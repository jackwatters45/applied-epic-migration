import { Effect } from "effect";
import { ConfigService } from "../../lib/config.js";
import { GoogleDriveFileService } from "../google-drive/file.js";
import { ProgressLoggerService } from "../lib/progress.js";

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
}

export class FolderMergerService extends Effect.Service<FolderMergerService>()(
  "FolderMergerService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;
      const config = yield* ConfigService;
      const progress = yield* ProgressLoggerService;
      const sharedDriveId = yield* config.sharedClientDriveId;

      const mergeDuplicateFolders = (
        duplicates: DuplicateInfo[],
        options: Partial<MergeOptions> = {},
      ): Effect.Effect<void, Error> =>
        Effect.gen(function* () {
          const opts: MergeOptions = {
            dryRun: false,
            deleteSourceAfterMerge: true,
            ...options,
          };

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
            yield* mergeSingleDuplicateGroup(duplicate, opts);
          }

          yield* progress.complete();
        });

      const mergeSingleDuplicateGroup = (
        duplicate: DuplicateInfo,
        options: MergeOptions,
      ): Effect.Effect<void, Error> =>
        Effect.gen(function* () {
          const { folderIds } = duplicate;
          if (folderIds.length < 2) return;

          // Use the first folder as the target (usually the base folder without number)
          const [targetId, ...sourceIds] = folderIds;

          let totalItemsMoved = 0;

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
              totalItemsMoved += sourceItems.length;
              continue;
            }

            // Move all items from this source folder to target
            for (let i = 0; i < sourceItems.length; i++) {
              const item = sourceItems[i];
              yield* googleDrive.moveFile(item.id, targetId);
              yield* progress.logItem(
                `Moved ${i + 1}/${sourceItems.length}: ${item.name}`,
              );
            }

            totalItemsMoved += sourceItems.length;

            if (options.deleteSourceAfterMerge) {
              yield* googleDrive.trashFile(sourceId);
              yield* progress.logItem(`Deleted source folder ${sourceId}`);
            }
          }

          if (options.dryRun) {
            yield* progress.logItem(
              `[DRY RUN] Would move ${totalItemsMoved} total items`,
            );
          } else {
            yield* progress.logItem(`Moved ${totalItemsMoved} total items`);
          }
        });

      const mergeAppleStyleDuplicates = (
        duplicates: DuplicateInfo[],
        options: Partial<MergeOptions> = {},
      ): Effect.Effect<void, Error> =>
        Effect.gen(function* () {
          const opts: MergeOptions = {
            dryRun: false,
            deleteSourceAfterMerge: true,
            ...options,
          };

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
            yield* mergeSingleDuplicateGroup(duplicate, opts);
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
    ],
  },
) {}
