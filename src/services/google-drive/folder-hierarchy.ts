import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Array as A, Effect, Option } from "effect";
import { ConfigService } from "src/lib/config.js";
import { type GoogleDriveFile, GoogleDriveFileService } from "./file.js";

export interface FolderInfo {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
}

// for each second level, repeat
// add reporting
// add years
// add files
export class FolderHierarchyService extends Effect.Service<FolderHierarchyService>()(
  "FolderHierarchyService",
  {
    effect: Effect.gen(function* () {
      const config = yield* ConfigService;
      const fileService = yield* GoogleDriveFileService;
      const fs = yield* FileSystem.FileSystem;

      const sharedDriveId = yield* config.sharedClientDriveId;

      const groupByParent = (folders: readonly GoogleDriveFile[]) => {
        const groups: Record<string, GoogleDriveFile[]> = {};

        folders.forEach((folder) => {
          const parentId = Option.getOrElse(
            A.head(folder.parents),
            () => "root",
          );
          if (!groups[parentId]) {
            groups[parentId] = [];
          }
          groups[parentId].push(folder);
        });

        return groups;
      };

      return {
        createHierarchyMap: () =>
          Effect.gen(function* () {
            const files = yield* fileService.listFolders({
              sharedDriveId,
              useCache: true,
            });

            // write files to fs
            yield* fs.writeFileString(
              "logs/folders.json",
              JSON.stringify(files),
            );

            // group by parent
            const grouped = groupByParent(files);
            console.log("Folders grouped by parent:");
            Object.entries(grouped).forEach(([parentId, folders]) => {
              console.log(`${parentId}: ${folders.length} folders`);
            });

            yield* fs.writeFileString(
              "logs/folders-grouped.json",
              JSON.stringify(grouped),
            );

            return grouped;
          }),
      };
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      ConfigService.Default,
      NodeContext.layer,
    ],
  },
) {}
