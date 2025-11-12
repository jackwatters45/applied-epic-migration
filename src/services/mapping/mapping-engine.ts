// import { Effect, Schema } from "effect";
// import type { FolderInfo } from "../google-drive/folder-hierarchy.js";

// // Error type for mapping operations
// export class MappingEngineError extends Schema.TaggedError<MappingEngineError>()(
//   "MappingEngineError",
//   {
//     message: Schema.String,
//     type: Schema.String,
//     status: Schema.optional(Schema.Number),
//   },
// ) {}

// // Types for mapping results
// export interface MappingResult {
//   readonly attachmentName: string;
//   readonly folderId: string | null;
//   readonly folderName: string | null;
//   readonly folderPath: string | null;
//   readonly confidence: number;
//   readonly matchType: "exact" | "none";
// }

// export interface MappingReport {
//   readonly totalAttachments: number;
//   readonly exactMatches: number;
//   readonly unmatchedAttachments: number;
//   readonly results: readonly MappingResult[];
// }

// // Mapping Engine Service
// export class MappingEngineService extends Effect.Service<MappingEngineService>()(
//   "MappingEngineService",
//   {
//     effect: Effect.gen(function* () {
//       return {
//         exactMatch: (attachmentName: string, folders: readonly FolderInfo[]) =>
//           Effect.sync(() => {
//             const normalizedName = attachmentName.toLowerCase().trim();

//             const matchingFolder = folders.find(
//               (folder) => folder.name.toLowerCase().trim() === normalizedName,
//             );

//             if (matchingFolder) {
//               return {
//                 attachmentName,
//                 folderId: matchingFolder.id,
//                 folderName: matchingFolder.name,
//                 folderPath: matchingFolder.path,
//                 confidence: 1.0,
//                 matchType: "exact" as const,
//               } as MappingResult;
//             }

//             return {
//               attachmentName,
//               folderId: null,
//               folderName: null,
//               folderPath: null,
//               confidence: 0.0,
//               matchType: "none" as const,
//             } as MappingResult;
//           }),

//         mapAttachments: (
//           attachmentNames: readonly string[],
//           folders: readonly FolderInfo[],
//         ) =>
//           Effect.gen(function* () {
//             const results: MappingResult[] = [];
//             let exactMatches = 0;

//             for (const attachmentName of attachmentNames) {
//               const normalizedName = attachmentName.toLowerCase().trim();

//               const matchingFolder = folders.find(
//                 (folder) => folder.name.toLowerCase().trim() === normalizedName,
//               );

//               const result: MappingResult = matchingFolder
//                 ? {
//                     attachmentName,
//                     folderId: matchingFolder.id,
//                     folderName: matchingFolder.name,
//                     folderPath: matchingFolder.path,
//                     confidence: 1.0,
//                     matchType: "exact" as const,
//                   }
//                 : {
//                     attachmentName,
//                     folderId: null,
//                     folderName: null,
//                     folderPath: null,
//                     confidence: 0.0,
//                     matchType: "none" as const,
//                   };

//               results.push(result);

//               if (result.matchType === "exact") {
//                 exactMatches++;
//               }
//             }

//             const report: MappingReport = {
//               totalAttachments: attachmentNames.length,
//               exactMatches,
//               unmatchedAttachments: attachmentNames.length - exactMatches,
//               results,
//             };

//             return report;
//           }),

//         getUnmatchedAttachments: (report: MappingReport) =>
//           Effect.sync(() => {
//             return report.results
//               .filter((result) => result.matchType === "none")
//               .map((result) => result.attachmentName);
//           }),

//         getExactMatches: (report: MappingReport) =>
//           Effect.sync(() => {
//             return report.results
//               .filter((result) => result.matchType === "exact")
//               .map((result) => ({
//                 attachmentName: result.attachmentName,
//                 folderId: result.folderId!,
//                 folderName: result.folderName!,
//                 folderPath: result.folderPath!,
//               }));
//           }),
//       } as const;
//     }),
//     dependencies: [],
//   },
// ) {}
