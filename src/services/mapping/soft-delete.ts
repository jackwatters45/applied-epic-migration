import { Effect, Schema } from "effect";
import { GoogleDriveFileService } from "../google-drive/file.js";
import { ProgressLoggerService } from "../lib/progress.js";

// Types for soft delete operations
export interface SoftDeleteOptions {
  readonly mode: "tag" | "rename" | "trash";
  readonly retentionPeriodDays?: number;
  readonly metadataPrefix?: string;
}

export interface SoftDeleteResult {
  readonly success: boolean;
  readonly fileId: string;
  readonly fileName: string;
  readonly mode: SoftDeleteOptions["mode"];
  readonly metadata?: Record<string, string>;
  readonly errors: readonly string[];
}

// Error type for soft delete operations
export class SoftDeleteError extends Schema.TaggedError<SoftDeleteError>()(
  "SoftDeleteError",
  {
    message: Schema.String,
    type: Schema.String,
    fileId: Schema.optional(Schema.String),
    details: Schema.optional(Schema.String),
  },
) {}

// Soft Delete Service
export class SoftDeleteService extends Effect.Service<SoftDeleteService>()(
  "SoftDeleteService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;
      const progress = yield* ProgressLoggerService;

      // Soft delete a folder using specified mode
      const softDeleteFolder = (folderId: string, options: SoftDeleteOptions) =>
        Effect.gen(function* () {
          const errors: string[] = [];
          let metadata: Record<string, string> = {};

          // Get folder info first
          const folderInfo = yield* Effect.mapError(
            googleDrive.getFileMetadata(folderId),
            (error) =>
              new SoftDeleteError({
                message: `Failed to get folder info: ${error}`,
                type: "GET_FOLDER_FAILED",
                fileId: folderId,
              }),
          );

          yield* progress.logItem(
            `[SOFT DELETE] Processing folder "${folderInfo.name}" in ${options.mode} mode`,
          );

          switch (options.mode) {
            case "tag": {
              // Add deletion metadata instead of deleting
              const retentionUntil = options.retentionPeriodDays
                ? new Date(
                    Date.now() +
                      options.retentionPeriodDays * 24 * 60 * 60 * 1000,
                  ).toISOString()
                : "";

              metadata = {
                deleted_for_merge: "true",
                deletion_date: new Date().toISOString(),
                ...(retentionUntil && { retention_until: retentionUntil }),
                original_source_id: folderId,
                deletion_mode: "soft_tag",
                ...(options.metadataPrefix && {
                  metadata_prefix: options.metadataPrefix,
                }),
              };

              // Try with full metadata first, if it fails due to size, retry with minimal metadata
              yield* Effect.mapError(
                Effect.catchTag(
                  googleDrive.updateFileMetadata(folderId, {
                    properties: metadata,
                  }),
                  "GoogleDriveFileError",
                  (error) =>
                    Effect.gen(function* () {
                      // Check if error is due to metadata size limit
                      if (error.message.includes("124 bytes")) {
                        yield* progress.logItem(
                          "[SOFT DELETE] Metadata too large, retrying with minimal metadata",
                        );

                        // Use minimal metadata
                        const minimalMetadata = {
                          deleted: "true",
                          mode: "tag",
                        };

                        return yield* googleDrive.updateFileMetadata(folderId, {
                          properties: minimalMetadata,
                        });
                      }
                      // Re-throw if it's not a size error
                      return yield* Effect.fail(error);
                    }),
                ),
                (error) =>
                  new SoftDeleteError({
                    message: `Failed to tag folder ${folderId}: ${error}`,
                    type: "TAG_FAILED",
                    fileId: folderId,
                  }),
              );

              yield* progress.logItem(
                `[SOFT DELETE] Tagged folder "${folderInfo.name}" with deletion metadata`,
              );
              break;
            }

            case "rename": {
              // Rename to indicate deletion status
              const timestamp = Date.now();
              const deletedName = options.metadataPrefix
                ? `${options.metadataPrefix}_${folderInfo.name}_${timestamp}`
                : `DELETED_${folderInfo.name}_${timestamp}`;

              metadata = {
                deleted_for_merge: "true",
                deletion_date: new Date().toISOString(),
                original_name: folderInfo.name,
                deleted_name: deletedName,
                deletion_mode: "soft_rename",
                timestamp: timestamp.toString(),
              };

              // Try with full metadata first, if it fails due to size, retry with minimal metadata
              yield* Effect.mapError(
                Effect.catchTag(
                  googleDrive.updateFileMetadata(folderId, {
                    name: deletedName,
                    properties: metadata,
                  }),
                  "GoogleDriveFileError",
                  (error) =>
                    Effect.gen(function* () {
                      // Check if error is due to metadata size limit
                      if (error.message.includes("124 bytes")) {
                        yield* progress.logItem(
                          "[SOFT DELETE] Metadata too large, retrying with minimal metadata",
                        );

                        // Use minimal metadata
                        const minimalMetadata = {
                          deleted: "true",
                          mode: "rename",
                        };

                        return yield* googleDrive.updateFileMetadata(folderId, {
                          name: deletedName,
                          properties: minimalMetadata,
                        });
                      }
                      // Re-throw if it's not a size error
                      return yield* Effect.fail(error);
                    }),
                ),
                (error) =>
                  new SoftDeleteError({
                    message: `Failed to rename folder ${folderId}: ${error}`,
                    type: "RENAME_FAILED",
                    fileId: folderId,
                  }),
              );

              yield* progress.logItem(
                `[SOFT DELETE] Renamed folder "${folderInfo.name}" to "${deletedName}"`,
              );
              break;
            }

            case "trash":
              // Move to trash (current behavior)
              metadata = {
                deleted_for_merge: "true",
                deletion_date: new Date().toISOString(),
                deletion_mode: "soft_trash",
              };

              yield* Effect.mapError(
                googleDrive.trashFile(folderId),
                (error) =>
                  new SoftDeleteError({
                    message: `Failed to trash folder ${folderId}: ${error}`,
                    type: "TRASH_FAILED",
                    fileId: folderId,
                  }),
              );

              yield* progress.logItem(
                `[SOFT DELETE] Moved folder "${folderInfo.name}" to trash`,
              );
              break;

            default:
              throw new SoftDeleteError({
                message: `Unknown soft delete mode: ${options.mode}`,
                type: "INVALID_MODE",
                fileId: folderId,
              });
          }

          const result: SoftDeleteResult = {
            success: errors.length === 0,
            fileId: folderId,
            fileName: folderInfo.name,
            mode: options.mode,
            metadata,
            errors,
          };

          yield* progress.logItem(
            `Soft delete completed: "${folderInfo.name}" (${options.mode} mode)`,
          );

          return result;
        });

      return {
        softDeleteFolder,
      } as const;
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      ProgressLoggerService.Default,
    ],
  },
) {}
