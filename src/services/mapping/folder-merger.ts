import { Effect, Schema } from "effect";
import { ConfigService } from "../../lib/config.js";
import {
  type GoogleDriveFile,
  GoogleDriveFileService,
} from "../google-drive/file.js";
import { ProgressLoggerService } from "../lib/progress.js";
import { RollbackService } from "./rollback.js";
import { VerificationService } from "./verification.js";

// Types
export interface DuplicateInfo {
  readonly folderName: string;
  readonly folderIds: readonly string[];
  readonly parentId: string;
  readonly parentName?: string;
}

export interface MergeOptions {
  readonly dryRun: boolean;
  readonly deleteSourceAfterMerge: boolean;
  readonly rollbackSessionId?: string;
}

// Error type for folder merger operations
export class FolderMergerError extends Schema.TaggedError<FolderMergerError>()(
  "FolderMergerError",
  {
    message: Schema.String,
    type: Schema.String,
    sourceId: Schema.optional(Schema.String),
    targetId: Schema.optional(Schema.String),
    missingItemsCount: Schema.optional(Schema.Number),
    remainingItemsCount: Schema.optional(Schema.Number),
    details: Schema.optional(Schema.String),
  },
) {}

export class FolderMergerService extends Effect.Service<FolderMergerService>()(
  "FolderMergerService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;
      const config = yield* ConfigService;
      const progress = yield* ProgressLoggerService;
      const verification = yield* VerificationService;
      const rollback = yield* RollbackService;
      const sharedDriveId = yield* config.sharedClientDriveId;

      const mergeDuplicateFolders = (
        duplicates: DuplicateInfo[],
        options: Partial<MergeOptions> = {},
      ) =>
        Effect.gen(function* () {
          const opts: MergeOptions = {
            dryRun: false,
            deleteSourceAfterMerge: true,
            ...options,
          };

          // Create rollback session if not provided
          const rollbackSessionId = opts.rollbackSessionId
            ? opts.rollbackSessionId
            : (yield* rollback.createSession("merge-duplicate-folders")).id;

          yield* progress.startTask(
            "Merging duplicate folders",
            duplicates.length,
          );

          for (let i = 0; i < duplicates.length; i++) {
            const duplicate = duplicates[i];
            const displayName = duplicate.parentName
              ? `${duplicate.parentName} / ${duplicate.folderName}`
              : duplicate.folderName;
            yield* progress.logProgress(
              i + 1,
              `${displayName} (${duplicates.length})`,
            );
            yield* mergeSingleDuplicateGroup(
              duplicate,
              opts,
              rollbackSessionId,
            );
          }

          // Complete rollback session if we created it
          if (!opts.rollbackSessionId) {
            yield* rollback.completeSession(rollbackSessionId);
          }

          yield* progress.complete();
        });

      const verifyMoveOperation = (
        sourceId: string,
        targetId: string,
        sourceItems: readonly GoogleDriveFile[],
      ) =>
        Effect.gen(function* () {
          yield* progress.logItem(
            `Verifying move from ${sourceId} to ${targetId} before deletion`,
          );

          const verificationResult = yield* verification.verifyMoveComplete({
            sourceId,
            targetId,
            expectedItems: sourceItems.map((item) => ({
              id: item.id,
              name: item.name,
            })),
          });

          if (!verificationResult.success) {
            yield* progress.logItem(
              `Verification failed for source folder ${sourceId}:`,
            );
            for (const error of verificationResult.errors) {
              yield* progress.logItem(`  Error: ${error}`);
            }

            throw new FolderMergerError({
              message: `Move verification failed for source folder ${sourceId}`,
              type: "VERIFICATION_FAILED",
              sourceId,
              targetId,
              missingItemsCount: verificationResult.missingItems.length,
              remainingItemsCount:
                verificationResult.remainingSourceItems.length,
              details: `Missing items: [${verificationResult.missingItems.join(", ")}], Remaining items: [${verificationResult.remainingSourceItems.join(", ")}]`,
            });
          }

          yield* progress.logItem(
            `Verification successful for source folder ${sourceId}`,
          );
        });

      const mergeSingleDuplicateGroup = (
        duplicate: DuplicateInfo,
        options: MergeOptions,
        rollbackSessionId: string,
      ) =>
        Effect.gen(function* () {
          const { folderIds } = duplicate;
          if (folderIds.length < 2) return;

          // Use the first folder as the target (usually the base folder without number)
          const [targetId, ...sourceIds] = folderIds;

          let _totalItemsMoved = 0;

          // Move contents from all source folders to the target
          for (const sourceId of sourceIds) {
            const sourceItems = yield* googleDrive.listFiles({
              parentId: sourceId,
              sharedDriveId,
            });

            yield* progress.logItem(
              `Found ${sourceItems.length} items in source folder ${sourceId}`,
            );

            if (options.dryRun) {
              yield* progress.logItem(
                `[DRY RUN] Would move ${sourceItems.length} items from ${sourceId}`,
              );
              _totalItemsMoved += sourceItems.length;
              continue;
            }

            // Move all items from this source folder to target
            for (let i = 0; i < sourceItems.length; i++) {
              const item = sourceItems[i];

              // Log move operation for rollback
              yield* rollback.logOperation(rollbackSessionId, {
                type: "move",
                fileId: item.id,
                fileName: item.name,
                sourceId,
                targetId,
              });

              yield* googleDrive.moveFile(item.id, targetId);
              yield* progress.logItem(
                `Moved ${i + 1}/${sourceItems.length}: ${item.name}`,
              );
            }

            _totalItemsMoved += sourceItems.length;

            // Verify move was successful before deleting source folder
            if (options.deleteSourceAfterMerge) {
              yield* verifyMoveOperation(sourceId, targetId, sourceItems);

              // Log trash operation for rollback
              yield* rollback.logOperation(rollbackSessionId, {
                type: "trash",
                fileId: sourceId,
                fileName: `Source folder ${sourceId}`,
                sourceId,
                targetId: "trash",
              });

              yield* googleDrive.trashFile(sourceId);
              yield* progress.logItem(`Deleted source folder ${sourceId}`);
            }
          }

          yield* progress.complete();
        });

      const mergeAppleStyleDuplicates = (
        duplicates: DuplicateInfo[],
        options: Partial<MergeOptions> = {},
      ) =>
        Effect.gen(function* () {
          const opts: MergeOptions = {
            dryRun: false,
            deleteSourceAfterMerge: true,
            ...options,
          };

          // Create rollback session if not provided
          const rollbackSessionId = opts.rollbackSessionId
            ? opts.rollbackSessionId
            : (yield* rollback.createSession("merge-apple-duplicates")).id;

          yield* progress.startTask(
            "Merging Apple-style duplicate folders",
            duplicates.length,
          );

          for (let i = 0; i < duplicates.length; i++) {
            const duplicate = duplicates[i];
            const displayName = duplicate.parentName
              ? `${duplicate.parentName} / ${duplicate.folderName}`
              : duplicate.folderName;
            yield* progress.logProgress(
              i + 1,
              `${displayName} (${duplicates.length})`,
            );
            yield* mergeSingleDuplicateGroup(
              duplicate,
              opts,
              rollbackSessionId,
            );
          }

          yield* progress.complete();
        });

      return {
        mergeDuplicateFolders,
        mergeAppleStyleDuplicates,
      } as const;
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      ConfigService.Default,
      ProgressLoggerService.Default,
      VerificationService.Default,
      RollbackService.Default,
    ],
  },
) {}
