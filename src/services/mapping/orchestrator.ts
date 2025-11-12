import { Effect, Schema } from "effect";
import type { OrganizedHashMap } from "../../lib/type.js";
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
          // build a map of google drive file structure
          const hierarchyTree = yield* folderHierarchy.buildHierarchyTree({
            useCache: true,
          });

          // analyze hierarchy tree
          yield* hierarchyAnalyzer.analyzeHierarchy(hierarchyTree);

          // extract duplicate folders
          const duplicates =
            yield* hierarchyAnalyzer.extractDuplicateFolders(hierarchyTree);

          // merge folders in existing drive
          // Actually connect names of level 1/root drive and attachments folders
          // add files to hierarchy tree
          // drive
          yield* folderMerger.mergeDuplicateFolders(duplicates, {
            useTestDrive: true,
          });
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
