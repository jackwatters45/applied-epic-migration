import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List, Schema } from "effect";
import {
  type Attachment,
  CacheMode,
  type OrganizedByAgency,
} from "../../lib/type.js";
import { GoogleDriveFileService } from "../google-drive/file.js";
import { ProgressLoggerService } from "../lib/progress.js";
import {
  type AgencyMapping,
  AgencyMappingStoreService,
} from "../mapping/agency-mapping-store.js";
import { RollbackService } from "../merging/rollback.js";

// ============================================================================
// Types
// ============================================================================

export interface MoveOptions {
  /** If true, only log what would be done without actually moving files */
  readonly dryRun: boolean;
  /** If provided, only process this many agencies (for testing) */
  readonly limitAgencies?: number;
  /** If provided, only process this many files per agency (for testing) */
  readonly limitFilesPerAgency?: number;
  /** Existing rollback session ID to use */
  readonly rollbackSessionId?: string;
}

export interface MoveResult {
  readonly success: boolean;
  readonly totalAgencies: number;
  readonly processedAgencies: number;
  readonly skippedAgencies: number;
  readonly totalFiles: number;
  readonly movedFiles: number;
  readonly failedFiles: number;
  readonly errors: readonly string[];
  readonly rollbackSessionId: string;
}

export interface YearFolderResult {
  readonly year: number;
  readonly folderId: string;
  readonly folderName: string;
  readonly created: boolean;
  readonly movedFiles: number;
  readonly failedFiles: number;
}

export interface AgencyMoveResult {
  readonly agencyName: string;
  readonly targetFolderId: string;
  readonly targetFolderName: string;
  readonly totalFiles: number;
  readonly movedFiles: number;
  readonly failedFiles: number;
  readonly yearFolders: readonly YearFolderResult[];
  readonly errors: readonly string[];
}

// Error type for attachment mover operations
export class AttachmentMoverError extends Schema.TaggedError<AttachmentMoverError>()(
  "AttachmentMoverError",
  {
    message: Schema.String,
    type: Schema.String,
    agencyName: Schema.optional(Schema.String),
    fileId: Schema.optional(Schema.String),
    details: Schema.optional(Schema.String),
  },
) {}

// ============================================================================
// Service
// ============================================================================

export class AttachmentMoverService extends Effect.Service<AttachmentMoverService>()(
  "AttachmentMoverService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;
      const mappingStore = yield* AgencyMappingStoreService;
      const rollback = yield* RollbackService;
      const progress = yield* ProgressLoggerService;
      const fs = yield* FileSystem.FileSystem;

      /**
       * Get confirmed mappings (agencies with 100% confidence - either exact match or manually reviewed)
       */
      const getConfirmedMappings = () =>
        Effect.gen(function* () {
          const allMappings = yield* mappingStore.getAll();
          const confirmed: Array<{
            agencyName: string;
            mapping: AgencyMapping;
          }> = [];

          for (const [agencyName, mapping] of Object.entries(allMappings)) {
            // Only include mappings with 100% confidence (exact or manually reviewed)
            if (mapping.confidence === 100 && mapping.folderId) {
              confirmed.push({ agencyName, mapping });
            }
          }

          return confirmed;
        });

      /**
       * Cache for year folders within each agency folder to avoid repeated API calls
       * Key: `${agencyFolderId}:${year}` -> folderId
       */
      const yearFolderCache = new Map<string, string>();

      /**
       * Find or create a year folder within an agency folder
       */
      const findOrCreateYearFolder = (
        agencyFolderId: string,
        year: number,
        rollbackSessionId: string,
        options: MoveOptions,
      ) =>
        Effect.gen(function* () {
          const cacheKey = `${agencyFolderId}:${year}`;
          const folderName = String(year);

          // Check cache first
          const cached = yearFolderCache.get(cacheKey);
          if (cached) {
            return { folderId: cached, folderName, created: false };
          }

          // List existing folders in the agency folder to find year folder
          const existingFolders = yield* googleDrive.listFolders({
            parentId: agencyFolderId,
            cacheMode: CacheMode.NONE, // Don't cache as we may create new folders
          });

          const existingYearFolder = existingFolders.find(
            (f) => f.name === folderName,
          );

          if (existingYearFolder) {
            yearFolderCache.set(cacheKey, existingYearFolder.id);
            return {
              folderId: existingYearFolder.id,
              folderName,
              created: false,
            };
          }

          // Year folder doesn't exist - create it
          if (options.dryRun) {
            yield* progress.logItem(
              `[DRY RUN] Would create year folder: ${folderName} in agency folder ${agencyFolderId}`,
            );
            // Return a placeholder for dry run
            return { folderId: `dry-run-${year}`, folderName, created: true };
          }

          const createResult = yield* googleDrive.createFolder(
            folderName,
            agencyFolderId,
          );

          if (!createResult.success) {
            throw new AttachmentMoverError({
              message: `Failed to create year folder ${folderName}`,
              type: "CREATE_FOLDER_FAILED",
              details: createResult.message,
            });
          }

          // Log folder creation for rollback (use "delete" since that's the reverse operation)
          yield* rollback.logOperation(rollbackSessionId, {
            type: "delete",
            fileId: createResult.folderId,
            fileName: folderName,
            sourceId: agencyFolderId,
            targetId: agencyFolderId,
            metadata: { operation: "folder_created", year: String(year) },
          });

          yearFolderCache.set(cacheKey, createResult.folderId);

          yield* progress.logItem(
            `  Created year folder: ${folderName} (${createResult.folderId})`,
          );

          return {
            folderId: createResult.folderId,
            folderName,
            created: true,
          };
        });

      /**
       * Move a single attachment file to its target folder
       */
      const moveAttachment = (
        attachment: Attachment,
        targetFolderId: string,
        rollbackSessionId: string,
        options: MoveOptions,
      ) =>
        Effect.gen(function* () {
          const fileId = attachment.formatted.fileId;
          const fileName = `${attachment.formatted.description}.${attachment.formatted.fileExtension}`;

          if (options.dryRun) {
            yield* progress.logItem(
              `[DRY RUN] Would move: ${fileName} -> ${targetFolderId}`,
            );
            return { success: true, fileId, fileName };
          }

          // Log operation for rollback before moving
          yield* rollback.logOperation(rollbackSessionId, {
            type: "move",
            fileId,
            fileName,
            sourceId: "unknown", // We don't track original parent
            targetId: targetFolderId,
          });

          // Move the file
          const result = yield* googleDrive.moveFile(fileId, targetFolderId);

          if (!result.success) {
            throw new AttachmentMoverError({
              message: `Failed to move file ${fileName}`,
              type: "MOVE_FAILED",
              fileId,
              details: result.message,
            });
          }

          return { success: true, fileId, fileName };
        });

      /**
       * Group attachments by their determined year
       */
      const groupByYear = (attachments: Attachment[]) => {
        const grouped = new Map<number, Attachment[]>();
        for (const attachment of attachments) {
          const year = attachment.determinedYear;
          const existing = grouped.get(year) || [];
          existing.push(attachment);
          grouped.set(year, existing);
        }
        return grouped;
      };

      /**
       * Move all attachments for a single agency to their target folder,
       * organized by year subfolders
       */
      const moveAgencyAttachments = (
        agencyName: string,
        attachments: List.List<Attachment>,
        mapping: AgencyMapping,
        rollbackSessionId: string,
        options: MoveOptions,
      ) =>
        Effect.gen(function* () {
          const attachmentArray = List.toArray(attachments);
          const filesToProcess = options.limitFilesPerAgency
            ? attachmentArray.slice(0, options.limitFilesPerAgency)
            : attachmentArray;

          if (options.limitFilesPerAgency && attachmentArray.length > 0) {
            yield* progress.logItem(
              `  LIMIT MODE: Processing ${filesToProcess.length}/${attachmentArray.length} files`,
            );
          }

          // Group attachments by year
          const byYear = groupByYear(filesToProcess);
          const years = Array.from(byYear.keys()).sort();

          yield* progress.logItem(
            `  Found ${years.length} years: ${years.join(", ")}`,
          );

          let movedFiles = 0;
          let failedFiles = 0;
          const errors: string[] = [];
          const yearFolders: YearFolderResult[] = [];
          let fileIndex = 0;

          for (const year of years) {
            const yearAttachments = byYear.get(year) || [];

            // Find or create the year folder within the agency folder
            const yearFolderResult = yield* Effect.either(
              findOrCreateYearFolder(
                mapping.folderId,
                year,
                rollbackSessionId,
                options,
              ),
            );

            if (yearFolderResult._tag === "Left") {
              // Failed to find/create year folder - skip all attachments for this year
              const errorMsg = `Failed to find/create year folder ${year}: ${String(yearFolderResult.left)}`;
              errors.push(errorMsg);
              yield* progress.logItem(`  ERROR: ${errorMsg}`);
              failedFiles += yearAttachments.length;

              yearFolders.push({
                year,
                folderId: "",
                folderName: String(year),
                created: false,
                movedFiles: 0,
                failedFiles: yearAttachments.length,
              });
              continue;
            }

            const {
              folderId: yearFolderId,
              folderName,
              created,
            } = yearFolderResult.right;
            let yearMovedFiles = 0;
            let yearFailedFiles = 0;

            if (created) {
              yield* progress.logItem(
                `  Created year folder: ${folderName} (${yearFolderId})`,
              );
            } else {
              yield* progress.logItem(
                `  Using existing year folder: ${folderName} (${yearFolderId})`,
              );
            }

            // Move each attachment to the year folder
            for (const attachment of yearAttachments) {
              fileIndex++;
              const fileName = `${attachment.formatted.description}.${attachment.formatted.fileExtension}`;

              const moveResult = yield* Effect.either(
                moveAttachment(
                  attachment,
                  yearFolderId,
                  rollbackSessionId,
                  options,
                ),
              );

              if (moveResult._tag === "Right") {
                movedFiles++;
                yearMovedFiles++;
                yield* progress.logItem(
                  `  [${fileIndex}/${filesToProcess.length}] Moved: ${fileName} -> ${year}/`,
                );
              } else {
                failedFiles++;
                yearFailedFiles++;
                const errorMsg = `Failed to move ${fileName}: ${String(moveResult.left)}`;
                errors.push(errorMsg);
                yield* progress.logItem(
                  `  [${fileIndex}/${filesToProcess.length}] ERROR: ${errorMsg}`,
                );
              }
            }

            yearFolders.push({
              year,
              folderId: yearFolderId,
              folderName,
              created,
              movedFiles: yearMovedFiles,
              failedFiles: yearFailedFiles,
            });
          }

          const result: AgencyMoveResult = {
            agencyName,
            targetFolderId: mapping.folderId,
            targetFolderName: mapping.folderName,
            totalFiles: attachmentArray.length,
            movedFiles,
            failedFiles,
            yearFolders,
            errors,
          };

          return result;
        });

      /**
       * Move all attachments to their mapped folders
       */
      const moveAttachmentsToMappedFolders = (
        attachments: OrganizedByAgency,
        options: Partial<MoveOptions> = {},
      ) =>
        Effect.gen(function* () {
          const opts: MoveOptions = {
            dryRun: false,
            ...options,
          };

          // Create rollback session
          const rollbackSessionId = opts.rollbackSessionId
            ? opts.rollbackSessionId
            : (yield* rollback.createSession("attachment-mover")).id;

          // Get confirmed mappings (only 100% confidence - exact or manually reviewed)
          const confirmedMappings = yield* getConfirmedMappings();
          const mappingsByAgency = new Map(
            confirmedMappings.map((m) => [m.agencyName, m.mapping]),
          );

          yield* progress.logItem(
            `Found ${confirmedMappings.length} agencies with confirmed mappings (100% confidence)`,
          );

          // Get all agencies from attachments
          const allAgencies = Array.from(HashMap.keys(attachments));

          // Filter to only agencies with confirmed mappings
          const agenciesToProcess = allAgencies.filter((name) =>
            mappingsByAgency.has(name),
          );

          const skippedAgencies = allAgencies.length - agenciesToProcess.length;

          yield* progress.logItem(
            `Processing ${agenciesToProcess.length} agencies, skipping ${skippedAgencies} without confirmed mappings`,
          );

          // Apply limit if specified
          const limitedAgencies = opts.limitAgencies
            ? agenciesToProcess.slice(0, opts.limitAgencies)
            : agenciesToProcess;

          if (opts.limitAgencies && agenciesToProcess.length > 0) {
            yield* progress.logItem(
              `LIMIT MODE: Processing only ${limitedAgencies.length}/${agenciesToProcess.length} agencies`,
            );
          }

          if (opts.dryRun) {
            yield* progress.logItem("DRY RUN MODE: No files will be moved");
          }

          yield* progress.startTask(
            "Moving attachments to mapped folders",
            limitedAgencies.length,
          );

          let totalFiles = 0;
          let movedFiles = 0;
          let failedFiles = 0;
          const allErrors: string[] = [];
          const agencyResults: AgencyMoveResult[] = [];

          for (let i = 0; i < limitedAgencies.length; i++) {
            const agencyName = limitedAgencies[i];
            const mapping = mappingsByAgency.get(agencyName);
            const agencyAttachments = HashMap.get(attachments, agencyName);

            if (!mapping || agencyAttachments._tag === "None") {
              continue;
            }

            yield* progress.logProgress(
              i + 1,
              `${agencyName} -> ${mapping.folderName}`,
            );

            const result = yield* moveAgencyAttachments(
              agencyName,
              agencyAttachments.value,
              mapping,
              rollbackSessionId,
              opts,
            );

            agencyResults.push(result);
            totalFiles += result.totalFiles;
            movedFiles += result.movedFiles;
            failedFiles += result.failedFiles;
            allErrors.push(...result.errors);
          }

          // Complete or fail the rollback session
          if (failedFiles > 0) {
            yield* rollback.failSession(
              rollbackSessionId,
              `${failedFiles} files failed to move`,
            );
          } else {
            yield* rollback.completeSession(rollbackSessionId);
          }

          yield* progress.complete();

          // Write results to file
          const resultReport = {
            timestamp: new Date().toISOString(),
            options: opts,
            summary: {
              totalAgencies: allAgencies.length,
              processedAgencies: limitedAgencies.length,
              skippedAgencies,
              totalFiles,
              movedFiles,
              failedFiles,
              successRate:
                totalFiles > 0
                  ? `${Math.round((movedFiles / totalFiles) * 100)}%`
                  : "N/A",
            },
            rollbackSessionId,
            agencyResults,
            errors: allErrors,
          };

          yield* fs
            .makeDirectory("logs", { recursive: true })
            .pipe(Effect.ignore);
          yield* fs.writeFileString(
            "logs/attachment-move-results.json",
            JSON.stringify(resultReport, null, 2),
          );

          // Log summary
          yield* progress.logItem("");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem("ATTACHMENT MOVE SUMMARY");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem(`Total agencies: ${allAgencies.length}`);
          yield* progress.logItem(`Processed: ${limitedAgencies.length}`);
          yield* progress.logItem(`Skipped (no mapping): ${skippedAgencies}`);
          yield* progress.logItem(`Total files: ${totalFiles}`);
          yield* progress.logItem(`Moved: ${movedFiles}`);
          yield* progress.logItem(`Failed: ${failedFiles}`);
          yield* progress.logItem(`Rollback session: ${rollbackSessionId}`);
          yield* progress.logItem("=".repeat(60));

          if (opts.dryRun) {
            yield* progress.logItem(
              "This was a DRY RUN - no files were actually moved",
            );
          }

          yield* progress.logItem(
            "Results written to: logs/attachment-move-results.json",
          );

          const result: MoveResult = {
            success: failedFiles === 0,
            totalAgencies: allAgencies.length,
            processedAgencies: limitedAgencies.length,
            skippedAgencies,
            totalFiles,
            movedFiles,
            failedFiles,
            errors: allErrors,
            rollbackSessionId,
          };

          return result;
        });

      return {
        moveAttachmentsToMappedFolders,
        getConfirmedMappings,
      } as const;
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      AgencyMappingStoreService.Default,
      RollbackService.Default,
      ProgressLoggerService.Default,
      NodeContext.layer,
    ],
  },
) {}
