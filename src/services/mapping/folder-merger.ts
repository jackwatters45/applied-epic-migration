import { Effect } from "effect";
import { GoogleDriveFileService } from "../google-drive/file.js";

// Types
export interface DuplicateInfo {
  readonly folderName: string;
  readonly folderIds: readonly string[];
  readonly parentId: string;
}

export interface MergeOptions {
  readonly useTestDrive: boolean;
  readonly dryRun: boolean;
  readonly deleteSourceAfterMerge: boolean;
}

export class FolderMergerService extends Effect.Service<FolderMergerService>()(
  "FolderMergerService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;

      const mergeDuplicateFolders = (
        duplicates: DuplicateInfo[],
        options: Partial<MergeOptions> = {},
      ): Effect.Effect<void, Error> =>
        Effect.gen(function* () {
          const opts: MergeOptions = {
            useTestDrive: true,
            dryRun: false,
            deleteSourceAfterMerge: false,
            ...options,
          };

          for (const duplicate of duplicates) {
            yield* mergeSingleDuplicateGroup(duplicate, opts);
          }
        });

      const mergeSingleDuplicateGroup = (
        duplicate: DuplicateInfo,
        options: MergeOptions,
      ): Effect.Effect<void, Error> =>
        Effect.gen(function* () {
          const { folderIds } = duplicate;
          const [sourceId, targetId] = folderIds;

          if (options.dryRun) {
            return;
          }

          // Get source folder contents
          const sourceItems = yield* googleDrive.listFiles({
            parentId: sourceId,
          });

          // Move all items from source to target
          for (const item of sourceItems) {
            yield* googleDrive.moveFile(item.id, targetId);
          }

          // Delete the source folder after merge (it should be empty now)
          if (options.deleteSourceAfterMerge) {
            yield* googleDrive.deleteFile(sourceId);
          }
        });

      return {
        mergeDuplicateFolders,
      } as const;
    }),
    dependencies: [GoogleDriveFileService.Default],
  },
) {}
