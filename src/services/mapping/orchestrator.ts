import { Effect, Schema } from "effect";
import type { OrganizedHashMap } from "../../lib/type.js";
import { AttachmentMetadataOrchestratorService } from "../attachment-metadata/orchestrator.js";
import { FolderHierarchyService } from "../google-drive/folder-hierarchy.js";

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

      const runMapping = (_attachments: OrganizedHashMap) =>
        Effect.gen(function* () {
          // build a map of google drive file structure
          const _hierarchyMap = yield* folderHierarchy.buildHierarchyTree({
            useCache: true,
          });

          // Actually connect names of parent folders
          //
          // const folders = yield* folderDiscoverer.listFolders();
          // console.log({ folders });
          // get all folder names
          // compare to attachments
        });

      return {
        runMapping,
      } as const;
    }),
    dependencies: [
      AttachmentMetadataOrchestratorService.Default,
      FolderHierarchyService.Default,
    ],
  },
) {}
