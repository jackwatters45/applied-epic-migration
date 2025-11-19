import { Effect, Schema } from "effect";
import { CacheMode, type OrganizedHashMap } from "../../lib/type.js";
import { FolderHierarchyService } from "../google-drive/folder-hierarchy.js";
import { FolderMergerService } from "./folder-merger.js";
import { HierarchyAnalysisService } from "./hierarchy-analysis.js";

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

      const runMapping = (_attachments: OrganizedHashMap) =>
        Effect.gen(function* () {
          const hierarchyTree = yield* folderHierarchy.buildHierarchyTree({
            cacheMode: CacheMode.WRITE,
          });

          yield* hierarchyAnalyzer.analyzeHierarchy(hierarchyTree);

          // Merge Apple-style duplicate folders (e.g., "folder", "folder (1)", "folder (2)")
          const appleDuplicates =
            yield* hierarchyAnalyzer.extractAppleStyleDuplicates(hierarchyTree);

          yield* folderMerger.mergeAppleStyleDuplicates(appleDuplicates, {
            // dryRun: true,
            // deleteSourceAfterMerge: false,
          });

          const duplicates =
            yield* hierarchyAnalyzer.extractDuplicateFolders(hierarchyTree);

          yield* folderMerger.mergeDuplicateFolders(duplicates, {
            // dryRun: true,
            // deleteSourceAfterMerge: false,
          });

          // TODO: Actually connect names of level 1/root drive and attachments folders
        });

      return {
        runMapping,
      } as const;
    }),
    dependencies: [
      FolderHierarchyService.Default,
      FolderMergerService.Default,
      HierarchyAnalysisService.Default,
    ],
  },
) {}
