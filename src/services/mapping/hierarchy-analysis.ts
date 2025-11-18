import { FileSystem } from "@effect/platform";
import { Effect, type Record } from "effect";
import { ConfigService } from "src/lib/config.js";
import type {
  FolderNode,
  HierarchyTree,
} from "../google-drive/folder-hierarchy.js";

// Re-export DuplicateInfo for use by other services
export interface DuplicateInfo {
  readonly folderName: string;
  readonly folderIds: readonly string[];
  readonly parentId: string;
  readonly parentName?: string;
}

export type HierarchyAnalysis = {
  totalFolders: number;
  maxDepth: number;
  rootFolders: number;
  depthDistribution: Record<number, number>;
  averageBranchFactor: number;
  maxBranchFactor: number;
  leafNodes: number;
  treeWidth: number;
};

export type TreeMetrics = {
  readonly depthDistribution: Record<number, number>;
  readonly branchFactorStats: {
    readonly min: number;
    readonly max: number;
    readonly average: number;
  };
  readonly treeWidth: number;
  readonly leafNodes: number;
};

export type TraversalResult<T> = {
  readonly visited: T[];
  readonly byLevel: Record<number, T[]>;
};

type HierarchyValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

export class HierarchyAnalysisService extends Effect.Service<HierarchyAnalysisService>()(
  "HierarchyAnalysisService",
  {
    effect: Effect.gen(function* () {
      const config = yield* ConfigService;
      const sharedDriveId = yield* config.sharedClientDriveId;

      const getFoldersAtLevel = (tree: HierarchyTree, level: number) =>
        Effect.gen(function* () {
          const result = yield* traverseBreadthFirst(tree, (node) => node);
          return result.byLevel[level] || [];
        });

      const findOrphanFolders = (tree: HierarchyTree) =>
        Effect.gen(function* () {
          const orphans: FolderNode[] = [];

          Object.values(tree.folderMap).forEach((node) => {
            if (
              node.parentId &&
              !tree.folderMap[node.parentId] &&
              node.parentId !== sharedDriveId
            ) {
              orphans.push(node);
            }
          });

          return orphans;
        });

      const calculateTreeMetrics = (tree: HierarchyTree) =>
        Effect.gen(function* () {
          const depthDistribution: Record<number, number> = {};
          const branchFactors: number[] = [];

          const calculateMetrics = (node: FolderNode) => {
            // Track depth distribution
            if (!depthDistribution[node.level]) {
              depthDistribution[node.level] = 0;
            }
            depthDistribution[node.level]++;

            // Track branch factor
            branchFactors.push(node.children.length);
          };

          yield* traverseDepthFirst(tree, calculateMetrics);

          const leafNodes = branchFactors.filter((count) => count === 0).length;
          const treeWidth = Math.max(...Object.values(depthDistribution));

          return {
            depthDistribution,
            branchFactorStats: {
              min: Math.min(...branchFactors),
              max: Math.max(...branchFactors),
              average:
                branchFactors.reduce((sum, count) => sum + count, 0) /
                branchFactors.length,
            },
            treeWidth,
            leafNodes,
          } satisfies TreeMetrics;
        });

      const analyzeHierarchy = (tree: HierarchyTree) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const metrics = yield* calculateTreeMetrics(tree);
          const orphans = yield* findOrphanFolders(tree);
          const rootFolders = yield* getFoldersAtLevel(tree, 0);
          const validation = yield* validateHierarchy(tree);

          const report = [
            "=== HIERARCHY ANALYSIS ===",
            `Total folders: ${tree.totalFolders}`,
            `Max depth: ${tree.maxDepth}`,
            `Root folders: ${tree.roots.length}`,
            `Average branch factor: ${metrics.branchFactorStats.average.toFixed(2)}`,
            `Tree width: ${metrics.treeWidth}`,
            `Leaf nodes: ${metrics.leafNodes}`,
            "",
            "=== LEVEL DISTRIBUTION ===",
            ...Object.entries(metrics.depthDistribution)
              .sort(
                ([a], [b]) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
              )
              .map(([level, count]) => `Level ${level}: ${count} folders`),
            "",
            `=== ROOT FOLDERS (${rootFolders.length}) ===`,
            ...rootFolders.map(
              (folder) =>
                `- ${folder.name} (${folder.children.length} children)`,
            ),
            "",
            `=== ORPHAN FOLDERS (${orphans.length}) ===`,
            orphans.length === 0
              ? "No orphan folders found ✅"
              : orphans
                  .map(
                    (orphan) =>
                      `- ${orphan.name} (${orphan.id}) - Missing parent: ${orphan.parentId}`,
                  )
                  .join("\n"),
            "",
            "=== VALIDATION ===",
            `Valid: ${validation.isValid}`,
            `Errors: ${validation.errors.length}`,
            `Warnings: ${validation.warnings.length}`,
            ...(validation.errors.length > 0
              ? [
                  "",
                  "Errors:",
                  ...validation.errors.map((error) => `- ${error}`),
                ]
              : []),
            ...(validation.warnings.length > 0
              ? [
                  "",
                  "Warnings:",
                  ...validation.warnings.map((warning) => `- ${warning}`),
                ]
              : []),
          ].join("\n");

          const filepath = "logs/hierarchy-analysis.log";
          yield* fs.makeDirectory("logs", { recursive: true });
          yield* fs.writeFileString(filepath, report);

          console.log(`📊 Hierarchy analysis report written to: ${filepath}`);

          return {
            totalFolders: tree.totalFolders,
            maxDepth: tree.maxDepth,
            rootFolders: tree.roots.length,
            depthDistribution: metrics.depthDistribution,
            averageBranchFactor: metrics.branchFactorStats.average,
            maxBranchFactor: metrics.branchFactorStats.max,
            leafNodes: metrics.leafNodes,
            treeWidth: metrics.treeWidth,
          } satisfies HierarchyAnalysis;
        });

      const getFolderPath = (
        tree: HierarchyTree,
        folderId: string,
      ): Effect.Effect<string[] | null, never> =>
        Effect.sync(() => {
          const node = tree.folderMap[folderId];
          return node ? node.path : null;
        });

      const getSubtree = (
        tree: HierarchyTree,
        folderId: string,
      ): Effect.Effect<HierarchyTree | null, never> =>
        Effect.gen(function* () {
          const rootNode = tree.folderMap[folderId];
          if (!rootNode) {
            return null;
          }

          // Collect all nodes in the subtree
          const subtreeNodes: Record<string, FolderNode> = {};

          const collectNodes = (node: FolderNode) => {
            subtreeNodes[node.id] = node;
            node.children.forEach(collectNodes);
          };

          collectNodes(rootNode);

          // Calculate subtree metrics
          const maxDepth = Math.max(
            ...Object.values(subtreeNodes).map((node) => node.level),
          );

          return {
            roots: [rootNode],
            totalFolders: Object.keys(subtreeNodes).length,
            maxDepth: maxDepth - rootNode.level, // Relative depth
            folderMap: subtreeNodes,
          };
        });

      // Phase 3: Output & Reporting Methods

      const generateNestedJson = (
        tree: HierarchyTree,
      ): Effect.Effect<string, never> =>
        Effect.gen(function* () {
          interface NestedNode {
            id: string;
            name: string;
            level: number;
            path: string[];
            children: NestedNode[];
          }

          const convertNode = (node: FolderNode): NestedNode => ({
            id: node.id,
            name: node.name,
            level: node.level,
            path: node.path,
            children: node.children.map(convertNode),
          });

          const nestedTree = tree.roots.map(convertNode);
          return JSON.stringify(nestedTree, null, 2);
        });

      const generateFlatWithPath = (
        tree: HierarchyTree,
      ): Effect.Effect<string, never> =>
        Effect.gen(function* () {
          const flatList = Object.values(tree.folderMap).map((node) => ({
            id: node.id,
            name: node.name,
            parentId: node.parentId,
            level: node.level,
            path: node.path.join("/"),
            childCount: node.children.length,
            isLeaf: node.children.length === 0,
          }));

          return JSON.stringify(flatList, null, 2);
        });

      const generateTreeVisualization = (
        tree: HierarchyTree,
      ): Effect.Effect<string, never> =>
        Effect.gen(function* () {
          const lines: string[] = [];

          const visualizeNode = (
            node: FolderNode,
            prefix = "",
            isLast = true,
          ): void => {
            const connector = isLast ? "└── " : "├── ";
            const extension = node.children.length > 0 ? "📁" : "📄";
            lines.push(
              `${prefix}${connector}${extension} ${node.name} (L${node.level})`,
            );

            const childPrefix = prefix + (isLast ? "    " : "│   ");

            node.children.forEach((child, index) => {
              const isChildLast = index === node.children.length - 1;
              visualizeNode(child, childPrefix, isChildLast);
            });
          };

          tree.roots.forEach((root, index) => {
            const isLastRoot = index === tree.roots.length - 1;
            visualizeNode(root, "", isLastRoot);
            if (!isLastRoot) {
              lines.push("");
            }
          });

          return lines.join("\n");
        });

      const generateLevelBasedGroupings = (
        tree: HierarchyTree,
      ): Effect.Effect<string, never> =>
        Effect.gen(function* () {
          const result = yield* traverseBreadthFirst(tree, (node) => ({
            id: node.id,
            name: node.name,
            path: node.path.join("/"),
            childCount: node.children.length,
          }));

          const levelGroups: Record<number, typeof result.visited> =
            result.byLevel;

          interface LevelGroup {
            level: number;
            folderCount: number;
            folders: Array<{
              id: string;
              name: string;
              path: string;
              childCount: number;
            }>;
          }

          const output = {
            summary: {
              totalLevels: Object.keys(levelGroups).length,
              maxDepth: tree.maxDepth,
              totalFolders: tree.totalFolders,
            },
            levels: {} as Record<string, LevelGroup>,
          };

          Object.entries(levelGroups).forEach(([level, folders]) => {
            output.levels[`level_${level}`] = {
              level: Number.parseInt(level, 10),
              folderCount: folders.length,
              folders: folders,
            };
          });

          return JSON.stringify(output, null, 2);
        });

      const generateHierarchyReport = (tree: HierarchyTree) =>
        Effect.gen(function* () {
          const analysis = yield* analyzeHierarchy(tree);
          const orphans = yield* findOrphanFolders(tree);
          const treeViz = yield* generateTreeVisualization(tree);

          const report = [
            "# FOLDER HIERARCHY REPORT",
            "=".repeat(50),
            "",
            "## OVERVIEW",
            `- Total Folders: ${analysis.totalFolders}`,
            `- Root Folders: ${analysis.rootFolders}`,
            `- Max Depth: ${analysis.maxDepth}`,
            `- Tree Width: ${analysis.treeWidth}`,
            `- Leaf Nodes: ${analysis.leafNodes}`,
            "",
            "## BRANCH FACTOR ANALYSIS",
            `- Average Branch Factor: ${analysis.averageBranchFactor.toFixed(2)}`,
            `- Max Branch Factor: ${analysis.maxBranchFactor}`,
            "",
            "## DEPTH DISTRIBUTION",
            ...Object.entries(analysis.depthDistribution)
              .sort(
                ([a], [b]) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
              )
              .map(([level, count]) => `- Level ${level}: ${count} folders`),
            "",
            "## ORPHAN FOLDERS",
            orphans.length === 0
              ? "No orphan folders found ✅"
              : orphans
                  .map(
                    (orphan) =>
                      `- ${orphan.name} (${orphan.id}) - Missing parent: ${orphan.parentId}`,
                  )
                  .join("\n"),
            "",
            "## TREE VISUALIZATION",
            "```",
            treeViz,
            "```",
            "",
            "## ROOT FOLDERS",
            ...tree.roots.map(
              (root) =>
                `- ${root.name} (${root.id}) - ${root.children.length} children`,
            ),
          ].join("\n");

          return report;
        });

      const validateHierarchy = (tree: HierarchyTree) =>
        Effect.gen(function* () {
          const errors: string[] = [];
          const warnings: string[] = [];

          // Check for circular references
          const visited = new Set<string>();
          const checkCircular = (node: FolderNode, path: string[]): boolean => {
            if (visited.has(node.id)) {
              errors.push(
                `Circular reference detected: ${path.join(" -> ")} -> ${node.name}`,
              );
              return true;
            }

            visited.add(node.id);
            for (const child of node.children) {
              if (checkCircular(child, [...path, node.name])) {
                return true;
              }
            }
            visited.delete(node.id);
            return false;
          };

          tree.roots.forEach((root) => {
            checkCircular(root, []);
          });

          // Check for orphan folders
          const orphans = yield* findOrphanFolders(tree);
          orphans.forEach((orphan) => {
            warnings.push(
              `Orphan folder: ${orphan.name} (${orphan.id}) - Missing parent: ${orphan.parentId}`,
            );
          });

          // Check for empty names
          Object.values(tree.folderMap).forEach((node) => {
            if (!node.name || node.name.trim() === "") {
              errors.push(`Folder with empty name: ${node.id}`);
            }
          });

          // Check for duplicate names within the same parent folder
          const namesByParent: Record<string, Record<string, string[]>> = {};
          Object.values(tree.folderMap).forEach((node) => {
            const parentId = node.parentId || "root"; // Group root folders together
            if (!namesByParent[parentId]) {
              namesByParent[parentId] = {};
            }
            if (!namesByParent[parentId][node.name]) {
              namesByParent[parentId][node.name] = [];
            }
            namesByParent[parentId][node.name].push(node.id);
          });

          Object.entries(namesByParent).forEach(([parentId, names]) => {
            Object.entries(names).forEach(([name, ids]) => {
              if (ids.length > 1) {
                const parentInfo =
                  parentId === "root" ? "root level" : `parent ${parentId}`;
                warnings.push(
                  `Duplicate folder name "${name}" within ${parentInfo}: ${ids.join(", ")}`,
                );
              }
            });
          });

          return {
            isValid: errors.length === 0,
            errors,
            warnings,
          } satisfies HierarchyValidationResult;
        });

      const extractDuplicateFolders = (tree: HierarchyTree) =>
        Effect.sync(() => {
          const duplicates: DuplicateInfo[] = [];
          const namesByParent: Record<string, Record<string, string[]>> = {};

          // Group folder IDs by parent and name
          Object.values(tree.folderMap).forEach((node) => {
            const parentId = node.parentId || "root";
            if (!namesByParent[parentId]) {
              namesByParent[parentId] = {};
            }
            if (!namesByParent[parentId][node.name]) {
              namesByParent[parentId][node.name] = [];
            }
            namesByParent[parentId][node.name].push(node.id);
          });

          // Extract exact name duplicates
          Object.entries(namesByParent).forEach(([parentId, names]) => {
            Object.entries(names).forEach(([name, ids]) => {
              if (ids.length > 1) {
                const parentName = tree.folderMap[parentId]?.name || "root";
                duplicates.push({
                  folderName: name,
                  folderIds: ids,
                  parentId,
                  parentName,
                });
              }
            });
          });

          console.log({ duplicates });

          return duplicates;
        });

      const extractAppleStyleDuplicates = (tree: HierarchyTree) =>
        Effect.sync(() => {
          const duplicates: DuplicateInfo[] = [];
          const foldersByParent: Record<string, FolderNode[]> = {};

          // Group folders by parent
          Object.values(tree.folderMap).forEach((node) => {
            const parentId = node.parentId || "root";
            if (!foldersByParent[parentId]) {
              foldersByParent[parentId] = [];
            }
            foldersByParent[parentId].push(node);
          });

          // For each parent, find Apple-style duplicates
          Object.entries(foldersByParent).forEach(([parentId, folders]) => {
            const baseNameGroups: Record<string, FolderNode[]> = {};

            folders.forEach((folder) => {
              // Match patterns: "folder", "folder (1)", "folder (2)", etc.
              const match = folder.name.match(/^(.+?)(?: \((\d+)\))?$/);
              if (match) {
                const baseName = match[1].trim();
                if (!baseNameGroups[baseName]) {
                  baseNameGroups[baseName] = [];
                }
                baseNameGroups[baseName].push(folder);
              }
            });

            // Extract groups with duplicates
            Object.entries(baseNameGroups).forEach(([baseName, nodes]) => {
              if (nodes.length > 1) {
                const parentName = tree.folderMap[parentId]?.name || "root";
                duplicates.push({
                  folderName: baseName,
                  folderIds: nodes.map((n) => n.id),
                  parentId,
                  parentName,
                });
              }
            });
          });

          console.log({ appleDuplicates: duplicates });

          return duplicates;
        });

      return {
        // Analysis methods
        analyzeHierarchy,
        getFoldersAtLevel,
        findOrphanFolders,
        calculateTreeMetrics,

        // Traversal methods
        traverseDepthFirst,
        traverseBreadthFirst,

        // Utility methods
        getFolderPath,
        getSubtree,

        // Phase 3: Output & Reporting
        generateNestedJson,
        generateFlatWithPath,
        generateTreeVisualization,
        generateLevelBasedGroupings,
        generateHierarchyReport,
        validateHierarchy,
        extractDuplicateFolders,
        extractAppleStyleDuplicates,
      } as const;
    }),
    dependencies: [ConfigService.Default],
  },
) {}

const traverseDepthFirst = <T>(
  tree: HierarchyTree,
  callback: (node: FolderNode) => T,
): Effect.Effect<TraversalResult<T>, never> =>
  Effect.gen(function* () {
    const visited: T[] = [];
    const byLevel: Record<number, T[]> = {};

    const traverse = (node: FolderNode) => {
      const result = callback(node);
      visited.push(result);

      if (!byLevel[node.level]) {
        byLevel[node.level] = [];
      }
      byLevel[node.level].push(result);

      // Recursively traverse children
      node.children.forEach(traverse);
    };

    // Start from all root nodes
    tree.roots.forEach(traverse);

    return { visited, byLevel };
  });

const traverseBreadthFirst = <T>(
  tree: HierarchyTree,
  callback: (node: FolderNode) => T,
): Effect.Effect<TraversalResult<T>, never> =>
  Effect.sync(() => {
    const visited: T[] = [];
    const byLevel: Record<number, T[]> = {};
    const queue: FolderNode[] = [...tree.roots];

    while (queue.length > 0) {
      const node = queue.shift()!;
      const result = callback(node);
      visited.push(result);

      if (!byLevel[node.level]) {
        byLevel[node.level] = [];
      }
      byLevel[node.level].push(result);

      // Add children to queue for BFS
      queue.push(...node.children);
    }

    return { visited, byLevel };
  });
