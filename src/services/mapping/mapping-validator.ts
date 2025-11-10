// import { Effect, Schema } from "effect";
// import type { FolderAttachmentMappingResult } from "./folder-attachment-mapper.js";

// // Error type for validation operations
// export class MappingValidationError extends Schema.TaggedError<MappingValidationError>()(
//   "MappingValidationError",
//   {
//     message: Schema.String,
//     type: Schema.String,
//     status: Schema.optional(Schema.Number),
//   },
// ) {}

// // Types for validation results
// export interface ValidationReport {
//   readonly isValid: boolean;
//   readonly issues: readonly ValidationIssue[];
//   readonly summary: ValidationSummary;
// }

// export interface ValidationIssue {
//   readonly type:
//     | "unmatched_attachment"
//     | "low_confidence"
//     | "duplicate_folder"
//     | "missing_folder";
//   readonly severity: "error" | "warning" | "info";
//   readonly message: string;
//   readonly attachmentName?: string;
//   readonly folderId?: string;
//   readonly confidence?: number;
// }

// export interface ValidationSummary {
//   readonly totalAttachments: number;
//   readonly matchedAttachments: number;
//   readonly unmatchedAttachments: number;
//   readonly errorCount: number;
//   readonly warningCount: number;
//   readonly infoCount: number;
// }

// // Mapping Validator Service
// export class MappingValidatorService extends Effect.Service<MappingValidatorService>()(
//   "MappingValidatorService",
//   {
//     effect: Effect.gen(function* () {
//       return {
//         validateMapping: (mappingResult: FolderAttachmentMappingResult) =>
//           Effect.sync(() => {
//             const issues: ValidationIssue[] = [];

//             // Check for unmatched attachments
//             const unmatchedItems = mappingResult.attachmentsWithFolders.filter(
//               (item) => item.folderId === null,
//             );

//             for (const item of unmatchedItems) {
//               issues.push({
//                 type: "unmatched_attachment",
//                 severity: "error",
//                 message: `No folder found for attachment: ${item.attachment.nameOf}`,
//                 attachmentName: item.attachment.nameOf,
//               });
//             }

//             // Check for low confidence matches (for future fuzzy matching)
//             const lowConfidenceItems =
//               mappingResult.attachmentsWithFolders.filter(
//                 (item) => item.confidence > 0 && item.confidence < 0.8,
//               );

//             for (const item of lowConfidenceItems) {
//               issues.push({
//                 type: "low_confidence",
//                 severity: "warning",
//                 message: `Low confidence match (${(item.confidence * 100).toFixed(1)}%) for attachment: ${item.attachment.nameOf}`,
//                 attachmentName: item.attachment.nameOf,
//                 confidence: item.confidence,
//               });
//             }

//             // Check for duplicate folder assignments
//             const folderUsage = new Map<string, string[]>();
//             for (const item of mappingResult.attachmentsWithFolders) {
//               if (item.folderId) {
//                 const attachments = folderUsage.get(item.folderId) || [];
//                 attachments.push(item.attachment.nameOf);
//                 folderUsage.set(item.folderId, attachments);
//               }
//             }

//             for (const [folderId, attachments] of folderUsage.entries()) {
//               if (attachments.length > 1) {
//                 issues.push({
//                   type: "duplicate_folder",
//                   severity: "info",
//                   message: `Folder assigned to ${attachments.length} attachments: ${attachments.join(", ")}`,
//                   folderId,
//                 });
//               }
//             }

//             const summary: ValidationSummary = {
//               totalAttachments: mappingResult.attachmentsWithFolders.length,
//               matchedAttachments: mappingResult.attachmentsWithFolders.filter(
//                 (item) => item.folderId !== null,
//               ).length,
//               unmatchedAttachments: unmatchedItems.length,
//               errorCount: issues.filter((issue) => issue.severity === "error")
//                 .length,
//               warningCount: issues.filter(
//                 (issue) => issue.severity === "warning",
//               ).length,
//               infoCount: issues.filter((issue) => issue.severity === "info")
//                 .length,
//             };

//             return {
//               isValid: summary.errorCount === 0,
//               issues,
//               summary,
//             } as ValidationReport;
//           }),

//         generateMappingReport: (mappingResult: FolderAttachmentMappingResult) =>
//           Effect.gen(function* () {
//             const issues: ValidationIssue[] = [];

//             // Check for unmatched attachments
//             const unmatchedItems = mappingResult.attachmentsWithFolders.filter(
//               (item) => item.folderId === null,
//             );

//             for (const item of unmatchedItems) {
//               issues.push({
//                 type: "unmatched_attachment",
//                 severity: "error",
//                 message: `No folder found for attachment: ${item.attachment.nameOf}`,
//                 attachmentName: item.attachment.nameOf,
//               });
//             }

//             const validationReport = {
//               isValid: unmatchedItems.length === 0,
//               issues,
//               summary: {
//                 totalAttachments: mappingResult.attachmentsWithFolders.length,
//                 matchedAttachments: mappingResult.attachmentsWithFolders.filter(
//                   (item) => item.folderId !== null,
//                 ).length,
//                 unmatchedAttachments: unmatchedItems.length,
//                 errorCount: issues.filter((issue) => issue.severity === "error")
//                   .length,
//                 warningCount: issues.filter(
//                   (issue) => issue.severity === "warning",
//                 ).length,
//                 infoCount: issues.filter((issue) => issue.severity === "info")
//                   .length,
//               },
//             } as ValidationReport;

//             return {
//               mapping: {
//                 totalAttachments: mappingResult.attachmentsWithFolders.length,
//                 exactMatches: mappingResult.report.exactMatches,
//                 unmatchedAttachments: mappingResult.report.unmatchedAttachments,
//                 matchRate:
//                   mappingResult.attachmentsWithFolders.length > 0
//                     ? (mappingResult.report.exactMatches /
//                         mappingResult.attachmentsWithFolders.length) *
//                       100
//                     : 0,
//               },
//               validation: validationReport,
//               unmatchedAttachments: mappingResult.attachmentsWithFolders
//                 .filter((item) => item.folderId === null)
//                 .map((item) => item.attachment.nameOf),
//               exactMatches: mappingResult.attachmentsWithFolders
//                 .filter((item) => item.confidence === 1.0)
//                 .map((item) => ({
//                   attachmentName: item.attachment.nameOf,
//                   folderName: item.folderName!,
//                   folderPath: item.folderPath!,
//                   fileId: item.attachment.fileId,
//                 })),
//             };
//           }),

//         exportUnmatchedList: (mappingResult: FolderAttachmentMappingResult) =>
//           Effect.sync(() => {
//             const unmatched = mappingResult.attachmentsWithFolders.filter(
//               (item) => item.folderId === null,
//             );

//             return {
//               count: unmatched.length,
//               items: unmatched.map((item) => ({
//                 attachmentName: item.attachment.nameOf,
//                 fileId: item.attachment.fileId,
//                 lookupCode: item.attachment.lookupCode,
//                 description: item.attachment.description,
//               })),
//             };
//           }),
//       } as const;
//     }),
//     dependencies: [],
//   },
// ) {}
