import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Array as A, Effect, Option, type Record } from "effect";
import { ConfigService } from "src/lib/config.js";
import { CacheMode } from "src/lib/type.js";
import { type GoogleDriveFile, GoogleDriveFileService } from "./file.js";

export interface FolderInfo {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
}

export interface FolderNode {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | undefined;
  readonly level: number;
  readonly children: FolderNode[];
  readonly path: string[];
}

export interface HierarchyTree {
  readonly roots: FolderNode[];
  readonly totalFolders: number;
  readonly maxDepth: number;
  readonly folderMap: Record<string, FolderNode>;
}

export class FolderHierarchyService extends Effect.Service<FolderHierarchyService>()(
  "FolderHierarchyService",
  {
    effect: Effect.gen(function* () {
      const config = yield* ConfigService;
      const fileService = yield* GoogleDriveFileService;
      const fs = yield* FileSystem.FileSystem;

      const sharedDriveId = yield* config.sharedClientDriveId;

      const groupByParent = (folders: readonly GoogleDriveFile[]) =>
        Effect.gen(function* () {
          const groups: Record<string, GoogleDriveFile[]> = {};

          folders.forEach((folder) => {
            const parentId = Option.getOrElse(
              A.head(folder.parents),
              () => sharedDriveId, // Use shared drive ID as root
            );
            if (!groups[parentId]) {
              groups[parentId] = [];
            }
            groups[parentId].push(folder);
          });

          return groups;
        });

      const _logGroupedFolderCounts = (
        grouped: Record<string, GoogleDriveFile[]>,
      ) =>
        Effect.gen(function* () {
          console.log("Folder counts by parent:");
          Object.entries(grouped).forEach(([parentId, folders]) => {
            const parentName =
              parentId === sharedDriveId ? "Shared Drive Root" : parentId;
            console.log(`${parentName}: ${folders.length} folders`);
          });

          const totalFolders = Object.values(grouped).reduce(
            (sum, folders) => sum + folders.length,
            0,
          );
          console.log(`Total folders: ${totalFolders}`);
        });

      const buildFolderNode = (
        folder: GoogleDriveFile,
        level: number,
        path: string[],
      ): FolderNode => {
        const parentId = Option.getOrElse(
          A.head(folder.parents),
          () => undefined,
        );
        return {
          id: folder.id,
          name: folder.name,
          parentId,
          level,
          children: [],
          path,
        };
      };

      const buildHierarchyTree = (
        grouped: Record<string, GoogleDriveFile[]>,
      ): Effect.Effect<HierarchyTree> =>
        Effect.gen(function* () {
          const folderMap: Record<string, FolderNode> = {};
          const roots: FolderNode[] = [];

          // First pass: create all folder nodes
          Object.values(grouped)
            .flat()
            .forEach((folder) => {
              const node = buildFolderNode(folder, 0, []);
              folderMap[folder.id] = node;
            });

          // Second pass: build parent-child relationships and calculate paths
          const calculatePathAndLevel = (
            folderId: string,
            visited = new Set<string>(),
          ): { path: string[]; level: number } => {
            if (visited.has(folderId)) {
              console.warn(
                `Circular reference detected for folder: ${folderId}`,
              );
              return { path: [], level: 0 };
            }
            visited.add(folderId);

            const node = folderMap[folderId];
            if (!node) {
              return { path: [], level: 0 };
            }

            if (!node.parentId || node.parentId === sharedDriveId) {
              return { path: [node.name], level: 0 };
            }

            const parentResult = calculatePathAndLevel(node.parentId, visited);
            return {
              path: [...parentResult.path, node.name],
              level: parentResult.level + 1,
            };
          };

          // Build relationships and calculate paths/levels
          Object.values(folderMap).forEach((node) => {
            const { path, level } = calculatePathAndLevel(node.id);
            folderMap[node.id] = { ...node, path, level };

            if (node.parentId && folderMap[node.parentId]) {
              folderMap[node.parentId].children.push(folderMap[node.id]);
            } else if (!node.parentId || node.parentId === sharedDriveId) {
              roots.push(folderMap[node.id]);
            }
          });

          // Calculate max depth
          const maxDepth = Math.max(
            ...Object.values(folderMap).map((node) => node.level),
          );

          return {
            roots,
            totalFolders: Object.keys(folderMap).length,
            maxDepth,
            folderMap,
          };
        });

      return {
        buildHierarchyTree: ({
          cacheMode = CacheMode.READ_WRITE,
        }: {
          cacheMode?: CacheMode;
        }) =>
          Effect.gen(function* () {
            const files = yield* fileService.listFolders({
              sharedDriveId,
              cacheMode,
            });

            // clean all file names
            const cleanedFiles = [];
            for (const file of files) {
              const cleanedFile = {
                ...file,
                name: file.name.trim(),
              };
              cleanedFiles.push(cleanedFile);
            }

            const grouped = yield* groupByParent(cleanedFiles);
            yield* fs.writeFileString(
              "logs/folders-grouped.json",
              JSON.stringify(grouped, null, 2),
            );

            const hierarchyTree = yield* buildHierarchyTree(grouped);
            yield* fs.writeFileString(
              "logs/folder-hierarchy.json",
              JSON.stringify(hierarchyTree, null, 2),
            );

            console.log("Hierarchy tree built:");
            console.log(`- Total folders: ${hierarchyTree.totalFolders}`);
            console.log(`- Root folders: ${hierarchyTree.roots.length}`);
            console.log(`- Max depth: ${hierarchyTree.maxDepth}`);

            return hierarchyTree;
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
