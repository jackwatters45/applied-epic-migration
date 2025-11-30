import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List, Schema } from "effect";
import { ConfigService } from "../../lib/config.js";
import type { Attachment, OrganizedByAgency } from "../../lib/type.js";
import { GoogleDriveFileService } from "../google-drive/file.js";
import { ProgressLoggerService } from "../lib/progress.js";
import { ExtractionManifestService } from "./extraction-manifest.js";
import {
  type RenamedFileManifestEntry,
  RenameManifestService,
} from "./rename-manifest.js";

// ============================================================================
// Types
// ============================================================================

export interface RenameResult {
  /** Google Drive file ID */
  readonly fileId: string;
  /** Original UUID-based filename */
  readonly originalName: string;
  /** New human-readable filename */
  readonly newName: string;
  /** Whether rename was successful */
  readonly success: boolean;
  /** Error message if failed */
  readonly error?: string | undefined;
}

export interface RenameReport {
  readonly timestamp: string;
  readonly totalAttachments: number;
  readonly skippedExtracted: number;
  readonly skippedAlreadyRenamed: number;
  readonly skippedZipFiles: number;
  readonly renamed: number;
  readonly failed: number;
  readonly results: readonly RenameResult[];
  readonly errors: readonly string[];
}

export interface RenameOptions {
  /** Maximum number of files to rename (for testing) */
  readonly limit?: number | undefined;
  /** Only rename files from specific agencies */
  readonly filterAgencies?: readonly string[] | undefined;
  /** Dry run - don't actually rename */
  readonly dryRun?: boolean | undefined;
}

// Error type for rename operations
export class AttachmentRenamerError extends Schema.TaggedError<AttachmentRenamerError>()(
  "AttachmentRenamerError",
  {
    message: Schema.String,
    type: Schema.String,
    fileId: Schema.optional(Schema.String),
    details: Schema.optional(Schema.String),
  },
) {}

// ============================================================================
// Service
// ============================================================================

export class AttachmentRenamerService extends Effect.Service<AttachmentRenamerService>()(
  "AttachmentRenamerService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;
      const progress = yield* ProgressLoggerService;
      const fs = yield* FileSystem.FileSystem;
      const config = yield* ConfigService;
      const extractionManifest = yield* ExtractionManifestService;
      const renameManifest = yield* RenameManifestService;

      const attachmentsFolderId = yield* config.attachmentsFolderId;
      const sharedDriveId = yield* config.sharedClientDriveId;

      /**
       * Check if an attachment is a zip file (skip these - they get extracted)
       */
      const isZipFile = (attachment: Attachment): boolean => {
        const ext = attachment.formatted.fileExtension.toLowerCase();
        return ext === ".zip" || ext === "zip";
      };

      /**
       * Get the Google Drive filename for an attachment (UUID-based name)
       */
      const getGoogleDriveFileName = (attachment: Attachment): string => {
        const newPath = attachment.formatted.newPath;
        const fileName = newPath.split("\\").pop() || newPath;
        return fileName;
      };

      /**
       * Get the target filename for an attachment (human-readable)
       */
      const getTargetFileName = (attachment: Attachment): string => {
        const description = attachment.formatted.description;
        const extension = attachment.formatted.fileExtension.toLowerCase();

        // If description already ends with the extension, don't add it again
        if (description.toLowerCase().endsWith(extension)) {
          return description;
        }

        return `${description}${extension}`;
      };

      /**
       * Find the Google Drive file ID by searching for the file
       */
      const findGoogleDriveFileId = (fileName: string) =>
        Effect.gen(function* () {
          const searchResults = yield* googleDrive.searchFiles({
            fileName,
            parentId: attachmentsFolderId,
            sharedDriveId,
          });

          if (searchResults.length === 0) {
            return yield* Effect.fail(
              new AttachmentRenamerError({
                message: `File not found in Google Drive: ${fileName}`,
                type: "FILE_NOT_FOUND",
                details: `Searched in attachments folder: ${attachmentsFolderId}`,
              }),
            );
          }

          if (searchResults.length > 1) {
            yield* progress.logItem(
              `  WARNING: Found ${searchResults.length} files named "${fileName}", using first match`,
            );
          }

          return searchResults[0].id;
        });

      /**
       * Rename a single file in Google Drive
       */
      const renameFile = (
        fileId: string,
        newName: string,
        dryRun: boolean,
      ): Effect.Effect<void, AttachmentRenamerError> =>
        Effect.gen(function* () {
          if (dryRun) {
            return;
          }

          yield* googleDrive.updateFileMetadata(fileId, { name: newName }).pipe(
            Effect.mapError(
              (error) =>
                new AttachmentRenamerError({
                  message: `Failed to rename file: ${error.message}`,
                  type: "RENAME_ERROR",
                  fileId,
                }),
            ),
          );
        });

      /**
       * Rename all attachments from UUID names to human-readable names
       */
      const renameAll = (
        attachments: OrganizedByAgency,
        options: RenameOptions = {},
      ) =>
        Effect.gen(function* () {
          // Get already-extracted file IDs (skip these)
          const extractedFileIds =
            yield* extractionManifest.getExtractedZipIds();

          // Get already-renamed file IDs (skip these)
          const renamedFileIds = yield* renameManifest.getRenamedFileIds();

          // Collect all non-zip attachments
          const allAttachments: Attachment[] = [];

          for (const [agencyName, agencyAttachments] of HashMap.entries(
            attachments,
          )) {
            if (
              options.filterAgencies &&
              !options.filterAgencies.includes(agencyName)
            ) {
              continue;
            }

            for (const attachment of List.toArray(agencyAttachments)) {
              allAttachments.push(attachment);
            }
          }

          yield* progress.logItem(
            `Found ${allAttachments.length} total attachments`,
          );

          // Filter and categorize
          let skippedZips = 0;
          let skippedExtracted = 0;
          let skippedAlreadyRenamed = 0;
          const toRename: Attachment[] = [];

          for (const attachment of allAttachments) {
            // Skip zip files (they get extracted, not renamed)
            if (isZipFile(attachment)) {
              skippedZips++;
              continue;
            }

            // Add to processing queue - we'll check manifests during processing
            // when we have the file ID
            toRename.push(attachment);
          }

          yield* progress.logItem(`Skipped ${skippedZips} zip files`);
          yield* progress.logItem(`To process: ${toRename.length} attachments`);

          // Apply limit if specified
          const attachmentsToProcess = options.limit
            ? toRename.slice(0, options.limit)
            : toRename;

          if (options.limit && toRename.length > options.limit) {
            yield* progress.logItem(
              `LIMIT MODE: Processing only ${attachmentsToProcess.length}/${toRename.length} attachments`,
            );
          }

          if (options.dryRun) {
            yield* progress.logItem("DRY RUN MODE: No files will be renamed");
          }

          yield* progress.startTask(
            "Renaming attachments",
            attachmentsToProcess.length,
          );

          const results: RenameResult[] = [];
          const manifestEntries: RenamedFileManifestEntry[] = [];
          const errors: string[] = [];
          const renamedAt = new Date().toISOString();

          for (let i = 0; i < attachmentsToProcess.length; i++) {
            const attachment = attachmentsToProcess[i];
            const originalName = getGoogleDriveFileName(attachment);
            const targetName = getTargetFileName(attachment);

            yield* progress.logProgress(
              i + 1,
              `${originalName} -> ${targetName}`,
            );

            // Find the file in Google Drive
            const findResult = yield* Effect.either(
              findGoogleDriveFileId(originalName),
            );

            if (findResult._tag === "Left") {
              const errorMsg = `File not found: ${originalName}`;
              errors.push(errorMsg);
              results.push({
                fileId: "",
                originalName,
                newName: targetName,
                success: false,
                error: errorMsg,
              });
              continue;
            }

            const fileId = findResult.right;

            // Check if this file was extracted from a zip (skip it)
            if (extractedFileIds.has(fileId)) {
              skippedExtracted++;
              continue;
            }

            // Check if already renamed
            if (renamedFileIds.has(fileId)) {
              skippedAlreadyRenamed++;
              continue;
            }

            // Rename the file
            const renameResult = yield* Effect.either(
              renameFile(fileId, targetName, options.dryRun ?? false),
            );

            if (renameResult._tag === "Right") {
              results.push({
                fileId,
                originalName,
                newName: targetName,
                success: true,
              });

              // Add to manifest entries (even for dry run, to show what would happen)
              if (!options.dryRun) {
                manifestEntries.push({
                  fileId,
                  originalName,
                  newName: targetName,
                  agencyName: attachment.agencyName,
                  determinedYear: attachment.determinedYear,
                  renamedAt,
                });
              }

              if (options.dryRun) {
                yield* progress.logItem(
                  `  [DRY RUN] Would rename: ${originalName} -> ${targetName}`,
                );
              }
            } else {
              const errorMsg = `Failed to rename ${originalName}: ${renameResult.left}`;
              errors.push(errorMsg);
              results.push({
                fileId,
                originalName,
                newName: targetName,
                success: false,
                error: String(renameResult.left),
              });
            }
          }

          yield* progress.complete();

          // Save manifest entries
          if (manifestEntries.length > 0) {
            yield* renameManifest.addEntries(manifestEntries);
          }

          // Build report
          const report: RenameReport = {
            timestamp: renamedAt,
            totalAttachments: allAttachments.length,
            skippedExtracted,
            skippedAlreadyRenamed,
            skippedZipFiles: skippedZips,
            renamed: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
            results,
            errors,
          };

          // Write report to file
          yield* fs
            .makeDirectory("logs", { recursive: true })
            .pipe(Effect.ignore);
          yield* fs.writeFileString(
            "logs/rename-report.json",
            JSON.stringify(report, null, 2),
          );

          // Log summary
          yield* progress.logItem("");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem("RENAME SUMMARY");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem(
            `Total attachments: ${report.totalAttachments}`,
          );
          yield* progress.logItem(
            `Skipped (zip files): ${report.skippedZipFiles}`,
          );
          yield* progress.logItem(
            `Skipped (from extraction): ${report.skippedExtracted}`,
          );
          yield* progress.logItem(
            `Skipped (already renamed): ${report.skippedAlreadyRenamed}`,
          );
          yield* progress.logItem(`Renamed: ${report.renamed}`);
          yield* progress.logItem(`Failed: ${report.failed}`);
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem("Report written to: logs/rename-report.json");
          yield* progress.logItem(
            `Manifest written to: ${renameManifest.MANIFEST_PATH}`,
          );

          return report;
        });

      /**
       * Rollback renames using the manifest
       */
      const rollbackRenames = (options: { dryRun?: boolean } = {}) =>
        Effect.gen(function* () {
          const entries = yield* renameManifest.getEntriesForRollback();

          if (entries.length === 0) {
            yield* progress.logItem("No renames to rollback");
            return { rolledBack: 0, failed: 0 };
          }

          yield* progress.logItem(
            `Found ${entries.length} renames to rollback`,
          );

          if (options.dryRun) {
            yield* progress.logItem("DRY RUN MODE: No files will be renamed");
          }

          yield* progress.startTask("Rolling back renames", entries.length);

          let rolledBack = 0;
          let failed = 0;
          const rolledBackIds: string[] = [];

          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];

            yield* progress.logProgress(
              i + 1,
              `${entry.newName} -> ${entry.originalName}`,
            );

            if (options.dryRun) {
              yield* progress.logItem(
                `  [DRY RUN] Would rollback: ${entry.newName} -> ${entry.originalName}`,
              );
              rolledBack++;
              continue;
            }

            const result = yield* Effect.either(
              renameFile(entry.fileId, entry.originalName, false),
            );

            if (result._tag === "Right") {
              rolledBack++;
              rolledBackIds.push(entry.fileId);
            } else {
              failed++;
              yield* progress.logItem(`  Failed to rollback: ${result.left}`);
            }
          }

          yield* progress.complete();

          // Remove rolled-back entries from manifest
          if (rolledBackIds.length > 0 && !options.dryRun) {
            yield* renameManifest.removeEntries(rolledBackIds);
          }

          yield* progress.logItem("");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem("ROLLBACK SUMMARY");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem(`Rolled back: ${rolledBack}`);
          yield* progress.logItem(`Failed: ${failed}`);
          yield* progress.logItem("=".repeat(60));

          return { rolledBack, failed };
        });

      return {
        renameAll,
        rollbackRenames,
      };
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      ProgressLoggerService.Default,
      ConfigService.Default,
      ExtractionManifestService.Default,
      RenameManifestService.Default,
      NodeContext.layer,
    ],
  },
) {}
