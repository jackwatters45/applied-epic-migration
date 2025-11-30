import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { ConfigService } from "../../lib/config.js";
import { CacheMode } from "../../lib/type.js";
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

export interface MergeToSharedDriveOptions {
  /** If true, only log what would be done without actually moving files */
  readonly dryRun: boolean;
  /** If provided, only process this many agencies (for testing) */
  readonly limitAgencies?: number | undefined;
  /** If provided, only process this many files per agency (for testing) */
  readonly limitFilesPerAgency?: number | undefined;
}

export interface MergeReport {
  readonly timestamp: string;
  readonly success: boolean;
  readonly totalAgencies: number;
  readonly processedAgencies: number;
  readonly skippedAgencies: number;
  readonly totalFiles: number;
  readonly movedFiles: number;
  readonly failedFiles: number;
  readonly createdYearFolders: number;
  readonly reusedYearFolders: number;
  readonly agencyResults: readonly AgencyMergeResult[];
  readonly errors: readonly string[];
}

export interface AgencyMergeResult {
  readonly sourceAgencyName: string;
  readonly sourceAgencyFolderId: string;
  readonly targetAgencyFolderId: string;
  readonly targetAgencyFolderName: string;
  readonly yearResults: readonly YearMergeResult[];
  readonly totalFiles: number;
  readonly movedFiles: number;
  readonly failedFiles: number;
  readonly errors: readonly string[];
}

export interface YearMergeResult {
  readonly year: string;
  readonly sourceFolderId: string;
  readonly targetFolderId: string;
  readonly created: boolean;
  readonly movedFiles: number;
  readonly failedFiles: number;
}

// Error type
export class SharedDriveMergerError extends Schema.TaggedError<SharedDriveMergerError>()(
  "SharedDriveMergerError",
  {
    message: Schema.String,
    type: Schema.String,
    details: Schema.optional(Schema.String),
  },
) {}

// ============================================================================
// Service
// ============================================================================

export class SharedDriveMergerService extends Effect.Service<SharedDriveMergerService>()(
  "SharedDriveMergerService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;
      const mappingStore = yield* AgencyMappingStoreService;
      const rollback = yield* RollbackService;
      const progress = yield* ProgressLoggerService;
      const fs = yield* FileSystem.FileSystem;
      const config = yield* ConfigService;

      const attachmentsFolderId = yield* config.attachmentsFolderId;

      /**
       * Get confirmed mappings (agencies with 100% confidence that have a target folder)
       */
      const getConfirmedMappings = () =>
        Effect.gen(function* () {
          const allMappings = yield* mappingStore.getAll();
          const confirmed: Array<{
            agencyName: string;
            mapping: AgencyMapping;
          }> = [];

          for (const [agencyName, mapping] of Object.entries(allMappings)) {
            // Only include mappings with 100% confidence and a valid target folder
            if (
              mapping.confidence === 100 &&
              mapping.folderId &&
              mapping.matchType !== "delete" &&
              mapping.matchType !== "create"
            ) {
              confirmed.push({ agencyName, mapping });
            }
          }

          return confirmed;
        });

      /**
       * Find or create a year folder in the target agency folder
       */
      const findOrCreateYearFolder = (
        targetAgencyFolderId: string,
        yearName: string,
        rollbackSessionId: string,
        dryRun: boolean,
      ) =>
        Effect.gen(function* () {
          // Search for existing year folder in target
          const existingFolders = yield* googleDrive.listFolders({
            parentId: targetAgencyFolderId,
            cacheMode: CacheMode.NONE, // Fresh data
          });

          const existingYearFolder = existingFolders.find(
            (f) => f.name === yearName,
          );

          if (existingYearFolder) {
            return { folderId: existingYearFolder.id, created: false };
          }

          // Year folder doesn't exist - create it
          if (dryRun) {
            return { folderId: `dry-run-year-${yearName}`, created: true };
          }

          const createResult = yield* googleDrive.createFolder(
            yearName,
            targetAgencyFolderId,
          );

          if (!createResult.success) {
            throw new SharedDriveMergerError({
              message: `Failed to create year folder ${yearName}`,
              type: "CREATE_FOLDER_FAILED",
              details: createResult.message,
            });
          }

          // Log folder creation for rollback
          yield* rollback.logOperation(rollbackSessionId, {
            type: "delete",
            fileId: createResult.folderId,
            fileName: yearName,
            sourceId: targetAgencyFolderId,
            targetId: targetAgencyFolderId,
            metadata: { operation: "folder_created", year: yearName },
          });

          return { folderId: createResult.folderId, created: true };
        });

      /**
       * Merge a single year folder from source to target
       */
      const mergeYearFolder = (
        sourceYearFolder: { id: string; name: string },
        targetAgencyFolderId: string,
        rollbackSessionId: string,
        options: MergeToSharedDriveOptions,
      ) =>
        Effect.gen(function* () {
          const yearName = sourceYearFolder.name;

          // Find or create target year folder
          const { folderId: targetYearFolderId, created } =
            yield* findOrCreateYearFolder(
              targetAgencyFolderId,
              yearName,
              rollbackSessionId,
              options.dryRun,
            );

          if (created) {
            yield* progress.logItem(`    Created year folder: ${yearName}`);
          } else {
            yield* progress.logItem(
              `    Using existing year folder: ${yearName}`,
            );
          }

          // List files in source year folder
          const sourceFiles = yield* googleDrive.listFiles({
            parentId: sourceYearFolder.id,
            cacheMode: CacheMode.NONE,
          });

          // Filter out subfolders - only move files
          const filesToMove = sourceFiles.filter(
            (f) => f.mimeType !== "application/vnd.google-apps.folder",
          );

          // Apply limit if specified
          const limitedFiles = options.limitFilesPerAgency
            ? filesToMove.slice(0, options.limitFilesPerAgency)
            : filesToMove;

          if (
            options.limitFilesPerAgency &&
            filesToMove.length > options.limitFilesPerAgency
          ) {
            yield* progress.logItem(
              `    LIMIT MODE: Moving ${limitedFiles.length}/${filesToMove.length} files`,
            );
          }

          let movedFiles = 0;
          let failedFiles = 0;

          for (let i = 0; i < limitedFiles.length; i++) {
            const file = limitedFiles[i];

            if (options.dryRun) {
              yield* progress.logItem(
                `    [DRY RUN] Would move: ${file.name} -> ${yearName}/`,
              );
              movedFiles++;
              continue;
            }

            // Log operation for rollback
            yield* rollback.logOperation(rollbackSessionId, {
              type: "move",
              fileId: file.id,
              fileName: file.name,
              sourceId: sourceYearFolder.id,
              targetId: targetYearFolderId,
            });

            // Move file to target year folder
            const moveResult = yield* Effect.either(
              googleDrive.moveFile(file.id, targetYearFolderId),
            );

            if (moveResult._tag === "Right") {
              movedFiles++;
              yield* progress.logItem(
                `    [${i + 1}/${limitedFiles.length}] Moved: ${file.name}`,
              );
            } else {
              failedFiles++;
              yield* progress.logItem(
                `    [${i + 1}/${limitedFiles.length}] FAILED: ${file.name} - ${moveResult.left}`,
              );
            }
          }

          const result: YearMergeResult = {
            year: yearName,
            sourceFolderId: sourceYearFolder.id,
            targetFolderId: targetYearFolderId,
            created,
            movedFiles,
            failedFiles,
          };

          return result;
        });

      /**
       * Merge a single agency from attachments drive to shared drive
       */
      const mergeAgency = (
        sourceAgencyFolder: { id: string; name: string },
        mapping: AgencyMapping,
        rollbackSessionId: string,
        options: MergeToSharedDriveOptions,
      ) =>
        Effect.gen(function* () {
          const agencyName = sourceAgencyFolder.name;

          yield* progress.logItem(`\n  Agency: ${agencyName}`);
          yield* progress.logItem(`  Target: ${mapping.folderName}`);

          // List year folders in source agency folder
          const yearFolders = yield* googleDrive.listFolders({
            parentId: sourceAgencyFolder.id,
            cacheMode: CacheMode.NONE,
          });

          yield* progress.logItem(`  Found ${yearFolders.length} year folders`);

          const yearResults: YearMergeResult[] = [];
          let totalFiles = 0;
          let movedFiles = 0;
          let failedFiles = 0;
          const errors: string[] = [];

          for (const yearFolder of yearFolders) {
            const yearResult = yield* Effect.either(
              mergeYearFolder(
                yearFolder,
                mapping.folderId,
                rollbackSessionId,
                options,
              ),
            );

            if (yearResult._tag === "Right") {
              yearResults.push(yearResult.right);
              totalFiles +=
                yearResult.right.movedFiles + yearResult.right.failedFiles;
              movedFiles += yearResult.right.movedFiles;
              failedFiles += yearResult.right.failedFiles;
            } else {
              const errorMsg = `Failed to merge year folder ${yearFolder.name}: ${yearResult.left}`;
              errors.push(errorMsg);
              yield* progress.logItem(`    ERROR: ${errorMsg}`);
            }
          }

          const result: AgencyMergeResult = {
            sourceAgencyName: agencyName,
            sourceAgencyFolderId: sourceAgencyFolder.id,
            targetAgencyFolderId: mapping.folderId,
            targetAgencyFolderName: mapping.folderName,
            yearResults,
            totalFiles,
            movedFiles,
            failedFiles,
            errors,
          };

          return result;
        });

      /**
       * Merge all organized attachments from attachments drive to shared drive
       */
      const mergeToSharedDrive = (
        options: Partial<MergeToSharedDriveOptions> = {},
      ) =>
        Effect.gen(function* () {
          const opts: MergeToSharedDriveOptions = {
            dryRun: false,
            ...options,
          };

          yield* progress.logItem("");
          yield* progress.logItem("=".repeat(70));
          yield* progress.logItem("MERGE TO SHARED DRIVE");
          yield* progress.logItem("=".repeat(70));

          if (opts.dryRun) {
            yield* progress.logItem("DRY RUN MODE - No files will be moved\n");
          }

          // Create rollback session
          const session = yield* rollback.createSession(
            "merge-to-shared-drive",
          );

          // Get confirmed mappings
          const confirmedMappings = yield* getConfirmedMappings();
          const mappingsByAgency = new Map(
            confirmedMappings.map((m) => [m.agencyName, m.mapping]),
          );

          yield* progress.logItem(
            `Found ${confirmedMappings.length} agencies with confirmed mappings`,
          );

          // List all agency folders in attachments drive
          const agencyFolders = yield* googleDrive.listFolders({
            parentId: attachmentsFolderId,
            cacheMode: CacheMode.NONE,
          });

          yield* progress.logItem(
            `Found ${agencyFolders.length} agency folders in attachments drive`,
          );

          // Filter to only agencies with confirmed mappings
          const agenciesToProcess = agencyFolders.filter((folder) =>
            mappingsByAgency.has(folder.name),
          );

          const skippedAgencies =
            agencyFolders.length - agenciesToProcess.length;

          yield* progress.logItem(
            `Processing ${agenciesToProcess.length} agencies, skipping ${skippedAgencies} without mappings`,
          );

          // Apply limit if specified
          const limitedAgencies = opts.limitAgencies
            ? agenciesToProcess.slice(0, opts.limitAgencies)
            : agenciesToProcess;

          if (
            opts.limitAgencies &&
            agenciesToProcess.length > opts.limitAgencies
          ) {
            yield* progress.logItem(
              `LIMIT MODE: Processing only ${limitedAgencies.length}/${agenciesToProcess.length} agencies`,
            );
          }

          yield* progress.startTask(
            "Merging to shared drive",
            limitedAgencies.length,
          );

          const agencyResults: AgencyMergeResult[] = [];
          let totalFiles = 0;
          let movedFiles = 0;
          let failedFiles = 0;
          let createdYearFolders = 0;
          let reusedYearFolders = 0;
          const allErrors: string[] = [];

          for (let i = 0; i < limitedAgencies.length; i++) {
            const agencyFolder = limitedAgencies[i];
            const mapping = mappingsByAgency.get(agencyFolder.name);

            if (!mapping) continue;

            yield* progress.logProgress(
              i + 1,
              `${agencyFolder.name} -> ${mapping.folderName}`,
            );

            const result = yield* Effect.either(
              mergeAgency(agencyFolder, mapping, session.id, opts),
            );

            if (result._tag === "Right") {
              agencyResults.push(result.right);
              totalFiles += result.right.totalFiles;
              movedFiles += result.right.movedFiles;
              failedFiles += result.right.failedFiles;
              allErrors.push(...result.right.errors);

              for (const yr of result.right.yearResults) {
                if (yr.created) createdYearFolders++;
                else reusedYearFolders++;
              }
            } else {
              const errorMsg = `Failed to merge agency ${agencyFolder.name}: ${result.left}`;
              allErrors.push(errorMsg);
              yield* progress.logItem(`ERROR: ${errorMsg}`);
            }
          }

          // Complete or fail the rollback session
          if (failedFiles > 0) {
            yield* rollback.failSession(
              session.id,
              `${failedFiles} files failed to move`,
            );
          } else {
            yield* rollback.completeSession(session.id);
          }

          yield* progress.complete();

          // Build report
          const report: MergeReport = {
            timestamp: new Date().toISOString(),
            success: failedFiles === 0,
            totalAgencies: agencyFolders.length,
            processedAgencies: limitedAgencies.length,
            skippedAgencies,
            totalFiles,
            movedFiles,
            failedFiles,
            createdYearFolders,
            reusedYearFolders,
            agencyResults,
            errors: allErrors,
          };

          // Write report to file
          yield* fs
            .makeDirectory("logs", { recursive: true })
            .pipe(Effect.ignore);

          yield* fs.writeFileString(
            "logs/merge-to-shared-drive-report.json",
            JSON.stringify(report, null, 2),
          );

          // Log summary
          yield* progress.logItem("");
          yield* progress.logItem("=".repeat(70));
          yield* progress.logItem("MERGE TO SHARED DRIVE SUMMARY");
          yield* progress.logItem("=".repeat(70));
          yield* progress.logItem(
            `Total agencies in attachments: ${report.totalAgencies}`,
          );
          yield* progress.logItem(`Processed: ${report.processedAgencies}`);
          yield* progress.logItem(
            `Skipped (no mapping): ${report.skippedAgencies}`,
          );
          yield* progress.logItem(`Total files: ${report.totalFiles}`);
          yield* progress.logItem(`Moved: ${report.movedFiles}`);
          yield* progress.logItem(`Failed: ${report.failedFiles}`);
          yield* progress.logItem(
            `Year folders created: ${report.createdYearFolders}`,
          );
          yield* progress.logItem(
            `Year folders reused: ${report.reusedYearFolders}`,
          );
          yield* progress.logItem(`Errors: ${report.errors.length}`);
          yield* progress.logItem("=".repeat(70));

          if (opts.dryRun) {
            yield* progress.logItem(
              "This was a DRY RUN - no files were actually moved",
            );
          }

          yield* progress.logItem(
            "Report saved to: logs/merge-to-shared-drive-report.json",
          );

          return report;
        });

      return {
        mergeToSharedDrive,
        getConfirmedMappings,
      } as const;
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      AgencyMappingStoreService.Default,
      RollbackService.Default,
      ProgressLoggerService.Default,
      ConfigService.Default,
      NodeContext.layer,
    ],
  },
) {}
