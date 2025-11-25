import { Effect, Schema } from "effect";
import { ConfigService } from "../../lib/config.js";
import { CacheMode } from "../../lib/type.js";
import {
  FolderHierarchyService,
  type HierarchyTree,
} from "../google-drive/folder-hierarchy.js";
import { FolderMergerService } from "./folder-merger.js";
import {
  type DuplicateInfo,
  HierarchyAnalysisService,
} from "./hierarchy-analysis.js";
import { RollbackService } from "./rollback.js";

// Error type for merging orchestrator operations
export class MergingOrchestratorError extends Schema.TaggedError<MergingOrchestratorError>()(
  "MergingOrchestratorError",
  {
    message: Schema.String,
    type: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// Merging Orchestrator Service
export class MergingOrchestratorService extends Effect.Service<MergingOrchestratorService>()(
  "MergingOrchestratorService",
  {
    effect: Effect.gen(function* () {
      const config = yield* ConfigService;
      const folderHierarchy = yield* FolderHierarchyService;
      const hierarchyAnalyzer = yield* HierarchyAnalysisService;
      const folderMerger = yield* FolderMergerService;
      yield* RollbackService;

      // Helper: Analyze hierarchy for duplicates
      const analyzeDuplicates = (
        hierarchyTree: HierarchyTree,
        iteration: number,
      ) =>
        Effect.gen(function* () {
          if (iteration === 1) {
            yield* hierarchyAnalyzer.analyzeHierarchy(hierarchyTree);
          }

          const appleDuplicates =
            yield* hierarchyAnalyzer.extractAppleStyleDuplicates(hierarchyTree);
          const exactDuplicates =
            yield* hierarchyAnalyzer.extractDuplicateFolders(hierarchyTree);

          return {
            appleDuplicates,
            exactDuplicates,
            totalCount: appleDuplicates.length + exactDuplicates.length,
          };
        });

      // Helper: Merge duplicates for a single iteration
      const mergeDuplicatesOnce = (
        duplicates: {
          appleDuplicates: readonly DuplicateInfo[];
          exactDuplicates: readonly DuplicateInfo[];
        },
        rollbackSessionId: string,
      ) =>
        Effect.gen(function* () {
          const mergeOptions = {
            rollbackSessionId,
            softDeleteOptions: {
              mode: "trash" as const,
              metadataPrefix: "__DELETED",
            },
            limitToFirstFolder: config.limitToFirstFolder,
          };

          // Merge Apple-style duplicates first
          if (duplicates.appleDuplicates.length > 0) {
            yield* folderMerger.mergeAppleStyleDuplicates(
              duplicates.appleDuplicates as DuplicateInfo[],
              mergeOptions,
            );
          }

          // Merge exact duplicates with fresh tree
          if (duplicates.exactDuplicates.length > 0) {
            const treeAfterApple = yield* folderHierarchy.buildHierarchyTree({
              cacheMode: CacheMode.WRITE,
            });

            const remainingExact =
              yield* hierarchyAnalyzer.extractDuplicateFolders(treeAfterApple);

            if (remainingExact.length > 0) {
              yield* folderMerger.mergeDuplicateFolders(
                remainingExact as DuplicateInfo[],
                mergeOptions,
              );
            }
          }
        });

      // Helper: Check if iteration should continue
      const shouldContinue = (
        iteration: number,
        totalDuplicates: number,
        previousDuplicateCount: number,
        maxIterations: number,
      ): {
        continue: boolean;
        newPreviousCount: number;
      } => {
        // No duplicates found
        if (totalDuplicates === 0) {
          const message =
            iteration === 1
              ? "✅ No duplicates found in hierarchy - nothing to merge!\n"
              : `✅ All duplicates resolved after ${iteration - 1} iteration(s)!\n`;
          console.log(message);
          return { continue: false, newPreviousCount: previousDuplicateCount };
        }

        // Stuck state (no progress)
        if (totalDuplicates === previousDuplicateCount) {
          console.log(
            `⚠️  Warning: No progress made (still ${totalDuplicates} duplicates). Stopping to prevent infinite loop.\n`,
          );
          return { continue: false, newPreviousCount: previousDuplicateCount };
        }

        // Max iterations reached
        if (iteration >= maxIterations) {
          console.log(
            `⚠️  Reached maximum iterations (${maxIterations}). Some duplicates may remain.\n`,
          );
          return { continue: false, newPreviousCount: totalDuplicates };
        }

        // Continue iterating
        return { continue: true, newPreviousCount: totalDuplicates };
      };

      // Core: Resolve all duplicates through iterative merging
      const resolveDuplicates = (rollbackSessionId: string) =>
        Effect.gen(function* () {
          const maxIterations = 5;
          let iteration = 0;
          let previousDuplicateCount = -1;

          console.log("\n🔄 Starting recursive duplicate resolution...\n");

          while (iteration < maxIterations) {
            iteration++;

            const hierarchyTree = yield* folderHierarchy.buildHierarchyTree({
              cacheMode: CacheMode.WRITE,
            });

            const duplicates = yield* analyzeDuplicates(
              hierarchyTree,
              iteration,
            );

            console.log(
              `📊 Iteration ${iteration}: Found ${duplicates.appleDuplicates.length} Apple-style + ${duplicates.exactDuplicates.length} exact duplicate groups (${duplicates.totalCount} total)`,
            );

            const { continue: shouldCont, newPreviousCount } = shouldContinue(
              iteration,
              duplicates.totalCount,
              previousDuplicateCount,
              maxIterations,
            );

            if (!shouldCont) {
              break;
            }

            previousDuplicateCount = newPreviousCount;

            yield* mergeDuplicatesOnce(duplicates, rollbackSessionId);

            console.log(`✅ Iteration ${iteration} complete\n`);
          }
        });

      return {
        resolveDuplicates,
      } as const;
    }),
    dependencies: [
      ConfigService.Default,
      FolderHierarchyService.Default,
      FolderMergerService.Default,
      HierarchyAnalysisService.Default,
      RollbackService.Default,
    ],
  },
) {}
