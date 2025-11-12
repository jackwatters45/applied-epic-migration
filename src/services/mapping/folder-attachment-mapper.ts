// import { Effect, Schema } from "effect";
// import type { FormattedAttachment } from "../../lib/type.js";
// import { FolderHierarchyService } from "../google-drive/folder-hierarchy.js";
// import { MappingEngineService, type MappingReport } from "./mapping-engine.js";

// // Error type for folder attachment mapping operations
// export class FolderAttachmentMappingError extends Schema.TaggedError<FolderAttachmentMappingError>()(
//   "FolderAttachmentMappingError",
//   {
//     message: Schema.String,
//     type: Schema.String,
//     status: Schema.optional(Schema.Number),
//   },
// ) {}

// // Types for folder attachment mapping
// export interface FolderAttachmentMappingResult {
//   readonly report: MappingReport;
//   readonly attachmentsWithFolders: Array<{
//     readonly attachment: FormattedAttachment;
//     readonly folderId: string | null;
//     readonly folderName: string | null;
//     readonly folderPath: string | null;
//     readonly confidence: number;
//   }>;
// }

// // Folder Attachment Mapper Service
// export class FolderAttachmentMapperService extends Effect.Service<FolderAttachmentMapperService>()(
//   "FolderAttachmentMapperService",
//   {
//     effect: Effect.gen(function* () {
//       const folderDiscovery = yield* FolderHierarchyService;
//       const mappingEngine = yield* MappingEngineService;

//       return {
//         mapAttachmentsToFolders: (
//           attachments: readonly FormattedAttachment[],
//           rootFolderId = "root",
//         ) =>
//           Effect.gen(function* () {
//             // Get all folders from Google Drive
//             const folderResult =
//               yield* folderDiscovery.getAllFolders(rootFolderId);

//             // Extract unique attachment names for folder matching
//             const uniqueAttachmentNames = Array.from(
//               new Set(attachments.map((attachment) => attachment.nameOf)),
//             ).filter(Boolean);

//             // Map attachment names to folders
//             const mappingReport = yield* mappingEngine.mapAttachments(
//               uniqueAttachmentNames,
//               folderResult.folders,
//             );

//             // Combine attachments with their folder mappings
//             const attachmentsWithFolders = attachments.map((attachment) => {
//               const mappingResult = mappingReport.results.find(
//                 (result) => result.attachmentName === attachment.nameOf,
//               );

//               return {
//                 attachment,
//                 folderId: mappingResult?.folderId ?? null,
//                 folderName: mappingResult?.folderName ?? null,
//                 folderPath: mappingResult?.folderPath ?? null,
//                 confidence: mappingResult?.confidence ?? 0.0,
//               };
//             });

//             return {
//               report: mappingReport,
//               attachmentsWithFolders,
//             } as FolderAttachmentMappingResult;
//           }),

//         getExactMatches: (mappingResult: FolderAttachmentMappingResult) =>
//           Effect.sync(() => {
//             return mappingResult.attachmentsWithFolders.filter(
//               (item) => item.confidence === 1.0,
//             );
//           }),

//         getUnmatchedAttachments: (
//           mappingResult: FolderAttachmentMappingResult,
//         ) =>
//           Effect.sync(() => {
//             return mappingResult.attachmentsWithFolders.filter(
//               (item) => item.folderId === null,
//             );
//           }),

//         getMappingStatistics: (mappingResult: FolderAttachmentMappingResult) =>
//           Effect.sync(() => {
//             const total = mappingResult.attachmentsWithFolders.length;
//             const matched = mappingResult.attachmentsWithFolders.filter(
//               (item) => item.folderId !== null,
//             ).length;
//             const unmatched = total - matched;

//             return {
//               totalAttachments: total,
//               matchedAttachments: matched,
//               unmatchedAttachments: unmatched,
//               matchRate: total > 0 ? (matched / total) * 100 : 0,
//               exactMatches: mappingResult.report.exactMatches,
//               uniqueAttachmentNames: mappingResult.report.totalAttachments,
//             };
//           }),
//       } as const;
//     }),
//     dependencies: [
//       FolderDiscoveryService.Default,
//       MappingEngineService.Default,
//     ],
//   },
// ) {}
