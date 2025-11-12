import { Effect, Schema } from "effect";
import type { OrganizedHashMap } from "../../lib/type.js";
import { AttachmentMetadataOrchestratorService } from "../attachment-metadata/orchestrator.js";
import { FolderHierarchyService } from "../google-drive/folder-hierarchy.js";
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

// Types for orchestrator results
export interface MappingOrchestratorResult {
  readonly summary: {
    readonly totalAttachments: number;
    readonly exactMatches: number;
    readonly unmatchedAttachments: number;
    readonly matchRate: number;
  };
  readonly exactMatches: Array<{
    readonly attachmentName: string;
    readonly folderName: string;
    readonly folderPath: string;
    readonly fileId: string;
  }>;
  readonly unmatchedAttachments: Array<{
    readonly attachmentName: string;
    readonly fileId: string;
    readonly lookupCode: string;
    readonly description: string;
  }>;
  readonly validationReport: {
    readonly isValid: boolean;
    readonly errorCount: number;
    readonly warningCount: number;
  };
}

// Mapping Orchestrator Service
export class MappingOrchestratorService extends Effect.Service<MappingOrchestratorService>()(
  "MappingOrchestratorService",
  {
    effect: Effect.gen(function* () {
      const folderHierarchy = yield* FolderHierarchyService;
      const hierarchyAnalyzer = yield* HierarchyAnalysisService;

      const runMapping = (_attachments: OrganizedHashMap) =>
        Effect.gen(function* () {
          // build a map of google drive file structure
          const hierarchyTree = yield* folderHierarchy.buildHierarchyTree({
            useCache: true,
          });

          // analyze hierarchy tree
          yield* hierarchyAnalyzer.analyzeHierarchy(hierarchyTree);

          // merge folders in existing drive
          // Actually connect names of level 1/root drive and attachments folders
          // add files to hierarchy tree
          // drive
        });

      return {
        runMapping,
      } as const;
    }),
    dependencies: [
      AttachmentMetadataOrchestratorService.Default,
      FolderHierarchyService.Default,
      HierarchyAnalysisService.Default,
    ],
  },
) {}
