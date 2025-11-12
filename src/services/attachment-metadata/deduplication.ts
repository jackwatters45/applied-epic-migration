import { Effect, HashMap, List } from "effect";
import type { AttachmentData } from "../../lib/type.js";

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
      samples: AttachmentData[];
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
          metadata: HashMap.HashMap<string, readonly AttachmentData[]>,
        ) =>
          Effect.gen(function* () {
            // Convert HashMap to array of all attachments
            const allAttachments: AttachmentData[] = [];
            for (const [, attachments] of HashMap.entries(metadata)) {
              allAttachments.push(...attachments);
            }

            const totalRecords = allAttachments.length;

            // Group by fileId
            const fileGroups = new Map<string, AttachmentData[]>();

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
                samples: AttachmentData[];
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
          metadata: HashMap.HashMap<string, List.List<AttachmentData>>,
        ) =>
          Effect.sync(() => {
            // Convert HashMap to array of all attachments
            const allAttachments: AttachmentData[] = [];
            for (const [, attachments] of HashMap.entries(metadata)) {
              allAttachments.push(...attachments);
            }

            // Track seen fileIds and keep only first occurrence
            const seenFileIds = new Set<string>();
            const uniqueAttachments: AttachmentData[] = [];

            for (const attachment of allAttachments) {
              const fileId = attachment.raw.fileId;

              if (!seenFileIds.has(fileId)) {
                seenFileIds.add(fileId);
                uniqueAttachments.push(attachment);
              }
            }

            // Convert back to original structure grouped by nameOf
            const groupedByNameOf = new Map<string, AttachmentData[]>();

            for (const attachment of uniqueAttachments) {
              const nameOf = attachment.raw.nameOf || "Unknown";
              const existing = groupedByNameOf.get(nameOf);

              if (existing) {
                existing.push(attachment);
              } else {
                groupedByNameOf.set(nameOf, [attachment]);
              }
            }

            // Convert Map back to HashMap
            let result = HashMap.empty<string, List.List<AttachmentData>>();
            for (const [nameOf, attachments] of groupedByNameOf.entries()) {
              result = HashMap.set(
                result,
                nameOf,
                List.fromIterable(attachments),
              );
            }

            return result;
          }),
      };
    }),
    dependencies: [],
  },
) {}
