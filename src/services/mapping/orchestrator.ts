import { Effect, Schema } from "effect";
import { CacheMode, type OrganizedHashMap } from "../../lib/type.js";
import { FolderHierarchyService } from "../google-drive/folder-hierarchy.js";
import { AttachmentFolderMapperService } from "./attachment-folder-mapper.js";
import { FolderMergerService } from "./folder-merger.js";
import { HierarchyAnalysisService } from "./hierarchy-analysis.js";
import { RollbackService } from "./rollback.js";

// Error type for mapping orchestrator operations
export class MappingOrchestratorError extends Schema.TaggedError<MappingOrchestratorError>()(
  "MappingOrchestratorError",
  {
    message: Schema.String,
    type: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// Mapping Orchestrator Service
export class MappingOrchestratorService extends Effect.Service<MappingOrchestratorService>()(
  "MappingOrchestratorService",
  {
    effect: Effect.gen(function* () {
      const folderHierarchy = yield* FolderHierarchyService;
      const hierarchyAnalyzer = yield* HierarchyAnalysisService;
      const folderMerger = yield* FolderMergerService;
      const attachmentFolderMapper = yield* AttachmentFolderMapperService;
      const rollback = yield* RollbackService;

      const runMapping = (attachments: OrganizedHashMap) =>
        Effect.gen(function* () {
          // Create a rollback session for the entire mapping operation
          const rollbackSessionId = (yield* rollback.createSession(
            "folder-mapping",
          )).id;

          // Recursively merge duplicates until none remain
          const maxIterations = 5;
          let iteration = 0;
          let previousDuplicateCount = -1;

          console.log("\n🔄 Starting recursive duplicate resolution...\n");

          while (iteration < maxIterations) {
            iteration++;

            // Build fresh hierarchy tree
            const hierarchyTree = yield* folderHierarchy.buildHierarchyTree({
              cacheMode: CacheMode.WRITE,
            });

            // Run analysis on first iteration
            if (iteration === 1) {
              yield* hierarchyAnalyzer.analyzeHierarchy(hierarchyTree);
            }

            // Extract all types of duplicates
            const appleDuplicates =
              yield* hierarchyAnalyzer.extractAppleStyleDuplicates(
                hierarchyTree,
              );
            const exactDuplicates =
              yield* hierarchyAnalyzer.extractDuplicateFolders(hierarchyTree);

            const totalDuplicates =
              appleDuplicates.length + exactDuplicates.length;

            console.log(
              `📊 Iteration ${iteration}: Found ${appleDuplicates.length} Apple-style + ${exactDuplicates.length} exact duplicate groups (${totalDuplicates} total)`,
            );

            // Exit if no duplicates found
            if (totalDuplicates === 0) {
              if (iteration === 1) {
                console.log(
                  "✅ No duplicates found in hierarchy - nothing to merge!\n",
                );
              } else {
                console.log(
                  `✅ All duplicates resolved after ${iteration - 1} iteration(s)!\n`,
                );
              }
              break;
            }

            // Detect stuck state (no progress made)
            if (totalDuplicates === previousDuplicateCount) {
              console.log(
                `⚠️  Warning: No progress made (still ${totalDuplicates} duplicates). Stopping to prevent infinite loop.\n`,
              );
              break;
            }
            previousDuplicateCount = totalDuplicates;

            // Process Apple-style duplicates
            if (appleDuplicates.length > 0) {
              yield* folderMerger.mergeAppleStyleDuplicates(appleDuplicates, {
                dryRun: true,
                rollbackSessionId,
                softDeleteOptions: {
                  mode: "trash",
                  metadataPrefix: "__DELETED",
                },
              });
            }

            // Process exact duplicates
            if (exactDuplicates.length > 0) {
              // Rebuild tree after Apple merge to get fresh state
              const treeAfterApple = yield* folderHierarchy.buildHierarchyTree({
                cacheMode: CacheMode.WRITE,
              });

              // Re-extract exact duplicates (some might have been resolved by Apple merge)
              const remainingExact =
                yield* hierarchyAnalyzer.extractDuplicateFolders(
                  treeAfterApple,
                );

              if (remainingExact.length > 0) {
                yield* folderMerger.mergeDuplicateFolders(remainingExact, {
                  dryRun: true,
                  rollbackSessionId,
                  softDeleteOptions: {
                    mode: "trash",
                    metadataPrefix: "__DELETED",
                  },
                });
              }
            }

            console.log(`✅ Iteration ${iteration} complete\n`);
          }

          // Check if we hit max iterations
          if (iteration >= maxIterations) {
            console.log(
              `⚠️  Reached maximum iterations (${maxIterations}). Some duplicates may remain.\n`,
            );
          }

          // Build final clean tree
          const hierarchyTreeNoDuplicates =
            yield* folderHierarchy.buildHierarchyTree({
              cacheMode: CacheMode.WRITE,
            });

          // Map gDriveTree to metadata attachments
          // TODO:
          yield* attachmentFolderMapper.mergeAttachmentsToFolders({
            attachments,
            gDriveTree: hierarchyTreeNoDuplicates,
          });

          // Complete the rollback session if all operations succeeded
          yield* rollback.completeSession(rollbackSessionId);

          console.log("✅ Mapping operation completed successfully!\n");
        });

      return {
        runMapping,
      } as const;
    }),
    dependencies: [
      FolderHierarchyService.Default,
      FolderMergerService.Default,
      HierarchyAnalysisService.Default,
      AttachmentFolderMapperService.Default,
      RollbackService.Default,
    ],
  },
) {}
