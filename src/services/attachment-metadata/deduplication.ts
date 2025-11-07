import { Effect, HashMap } from "effect";
import type { Attachment } from "./transform.js";

// Duplicate analysis interface
export interface DuplicateAnalysis {
  totalRecords: number;
  uniqueFileIds: number;
  duplicateFileIds: number;
  duplicateGroups: Record<
    string,
    {
      count: number;
      lookupCodes: string[];
      nameOf: string[];
      samples: Attachment[];
    }
  >;
}

// Deduplication Service
export class DeduplicationService extends Effect.Service<DeduplicationService>()(
  "DeduplicationService",
  {
    effect: Effect.gen(function* () {
      return {
        analyzeDuplicates: (
          metadata: HashMap.HashMap<string, readonly Attachment[]>,
        ) =>
          Effect.gen(function* () {
            // Convert HashMap to array of all attachments
            const allAttachments: Attachment[] = [];
            for (const [, attachments] of HashMap.entries(metadata)) {
              allAttachments.push(...attachments);
            }

            const totalRecords = allAttachments.length;

            // Group by fileId
            const fileGroups = new Map<string, Attachment[]>();

            for (const attachment of allAttachments) {
              const fileId = attachment.raw.fileId;
              const existing = fileGroups.get(fileId);

              if (existing) {
                existing.push(attachment);
              } else {
                fileGroups.set(fileId, [attachment]);
              }
            }

            // Find duplicates (groups with more than 1 attachment)
            const duplicateGroups: Record<
              string,
              {
                count: number;
                lookupCodes: string[];
                nameOf: string[];
                samples: Attachment[];
              }
            > = {};

            for (const [fileId, attachments] of fileGroups.entries()) {
              if (attachments.length > 1) {
                const lookupCodes = [
                  ...new Set(attachments.map((a) => a.raw.lookupCode)),
                ];
                const nameOfValues = [
                  ...new Set(attachments.map((a) => a.raw.nameOf || "Unknown")),
                ];

                duplicateGroups[fileId] = {
                  count: attachments.length,
                  lookupCodes,
                  nameOf: nameOfValues,
                  samples: attachments.slice(0, 3), // Keep first 3 samples
                };
              }
            }

            const uniqueFileIds = fileGroups.size;
            const duplicateFileIds = totalRecords - uniqueFileIds;

            return {
              totalRecords,
              uniqueFileIds,
              duplicateFileIds,
              duplicateGroups,
            } as DuplicateAnalysis;
          }),

        getDuplicateReport: (analysis: DuplicateAnalysis) =>
          Effect.sync(() => {
            const sortedDuplicates = Object.entries(analysis.duplicateGroups)
              .sort(([, a], [, b]) => b.count - a.count) // Sort by count descending
              .slice(0, 20); // Top 20 duplicate groups

            return {
              summary: {
                totalRecords: analysis.totalRecords,
                uniqueFileIds: analysis.uniqueFileIds,
                duplicateFileIds: analysis.duplicateFileIds,
              },
              topDuplicates: sortedDuplicates.map(([fileId, data]) => ({
                fileId,
                count: data.count,
                lookupCodes: data.lookupCodes,
                nameOf: data.nameOf,
                samples: data.samples.map((a) => ({
                  lookupCode: a.raw.lookupCode,
                  nameOf: a.raw.nameOf,
                  description: a.formatted.description,
                  attachedDate: a.raw.attachedDate,
                  folder: a.raw.folder,
                })),
              })),
            };
          }),

        deduplicateByFileId: (
          metadata: HashMap.HashMap<string, readonly Attachment[]>,
        ) =>
          Effect.sync(() => {
            // Convert HashMap to array of all attachments
            const allAttachments: Attachment[] = [];
            for (const [, attachments] of HashMap.entries(metadata)) {
              allAttachments.push(...attachments);
            }

            // Track seen fileIds and keep only first occurrence
            const seenFileIds = new Set<string>();
            const uniqueAttachments: Attachment[] = [];

            for (const attachment of allAttachments) {
              const fileId = attachment.raw.fileId;

              if (!seenFileIds.has(fileId)) {
                seenFileIds.add(fileId);
                uniqueAttachments.push(attachment);
              }
            }

            // Convert back to original structure grouped by lookupCode
            const groupedByLookupCode = new Map<string, Attachment[]>();

            for (const attachment of uniqueAttachments) {
              const lookupCode = attachment.raw.lookupCode;
              const existing = groupedByLookupCode.get(lookupCode);

              if (existing) {
                existing.push(attachment);
              } else {
                groupedByLookupCode.set(lookupCode, [attachment]);
              }
            }

            // Convert Map back to HashMap
            let result = HashMap.empty<string, readonly Attachment[]>();
            for (const [
              lookupCode,
              attachments,
            ] of groupedByLookupCode.entries()) {
              result = HashMap.set(result, lookupCode, attachments);
            }

            return result;
          }),
      };
    }),
    dependencies: [],
  },
) {}
