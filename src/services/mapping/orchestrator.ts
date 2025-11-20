import { Effect, Schema } from "effect";
import { CacheMode, type OrganizedHashMap } from "../../lib/type.js";
import { FolderHierarchyService } from "../google-drive/folder-hierarchy.js";
import { AttachmentFolderMapperService } from "./attachment-folder-mapper.js";
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
      const attachmentFolderMapper = yield* AttachmentFolderMapperService;

      const runMapping = (attachments: OrganizedHashMap) =>
        Effect.gen(function* () {
          const hierarchyTree = yield* folderHierarchy.buildHierarchyTree({
            cacheMode: CacheMode.WRITE,
          });

          yield* hierarchyAnalyzer.analyzeHierarchy(hierarchyTree);

          // Merge Apple-style duplicate folders (e.g., "folder", "folder (1)", "folder (2)")
          const appleDuplicates =
            yield* hierarchyAnalyzer.extractAppleStyleDuplicates(hierarchyTree);

          yield* folderMerger.mergeAppleStyleDuplicates(appleDuplicates, {
            dryRun: true,
          });

          const hierarchyTreeAfterApple =
            yield* folderHierarchy.buildHierarchyTree({
              cacheMode: CacheMode.WRITE,
            });

          // Merge exact duplicate folders (e.g., "folder", "folder")
          const duplicates = yield* hierarchyAnalyzer.extractDuplicateFolders(
            hierarchyTreeAfterApple,
          );
          yield* folderMerger.mergeDuplicateFolders(duplicates, {
            dryRun: true,
          });

          // Re-erge Apple-style duplicate folders (e.g., "folder", "folder (1)", "folder (2)") to deal with any new duplicates
          const appleDuplicates2 =
            yield* hierarchyAnalyzer.extractAppleStyleDuplicates(hierarchyTree);

          yield* folderMerger.mergeAppleStyleDuplicates(appleDuplicates2, {
            dryRun: true,
          });

          const hierarchyTreeNoDuplicates =
            yield* folderHierarchy.buildHierarchyTree({
              cacheMode: CacheMode.WRITE,
            });

          // map gDriveTree to metadata attachments
          yield* attachmentFolderMapper.mergeAttachmentsToFolders({
            attachments,
            gDriveTree: hierarchyTreeNoDuplicates,
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
      AttachmentFolderMapperService.Default,
    ],
  },
) {}
