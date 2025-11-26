import { Effect, Schema } from "effect";
import { CacheMode, type OrganizedByAgency } from "../../lib/type.js";
import { FolderHierarchyService } from "../google-drive/folder-hierarchy.js";
import { AttachmentFolderMapperService } from "./attachment-folder-mapper.js";

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
      const attachmentFolderMapper = yield* AttachmentFolderMapperService;

      // Map attachments to folder hierarchy
      const mapAttachments = (attachments: OrganizedByAgency) =>
        Effect.gen(function* () {
          console.log("\n📋 Starting attachment mapping...\n");

          const hierarchyTree = yield* folderHierarchy.buildHierarchyTree({
            cacheMode: CacheMode.WRITE,
          });

          yield* attachmentFolderMapper.mergeAttachmentsToFolders({
            attachments,
            gDriveTree: hierarchyTree,
          });

          console.log("✅ Attachment mapping completed!\n");
        });

      return {
        mapAttachments,
      } as const;
    }),
    dependencies: [
      FolderHierarchyService.Default,
      AttachmentFolderMapperService.Default,
    ],
  },
) {}
