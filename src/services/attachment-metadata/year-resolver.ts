import { Effect, HashMap, List } from "effect";
import type {
  Attachment,
  AttachmentData,
  OrganizedHashMap,
} from "../../lib/type.js";
import { DynamicYearMetricsService } from "./year-metrics.js";
import type { PriorityConfig } from "./year-priority-config.js";
import { PRIORITY_CONFIGS } from "./year-priority-config.js";

// Helper function to resolve year for a single attachment
const resolveYearForAttachment = (
  attachment: AttachmentData,
  priorities: PriorityConfig[],
  metrics: DynamicYearMetricsService,
) =>
  Effect.gen(function* () {
    yield* metrics.incrementTotal();

    // Try each priority in order
    for (const priority of priorities) {
      const year = priority.extractor(attachment);
      if (year) {
        const validated = priority.validator(year);
        if (validated) {
          yield* metrics.recordPrioritySuccess(priority.id);
          return validated;
        }
      }
    }

    // No valid year found - record as failure
    yield* metrics.recordFailure(attachment);
    return null;
  });

// Main year resolution service (refactored)
export class YearResolutionService extends Effect.Service<YearResolutionService>()(
  "YearResolutionService",
  {
    effect: Effect.gen(function* () {
      const metrics = yield* DynamicYearMetricsService;

      return {
        // Resolve year for a single attachment
        resolveYearForAttachment: (
          attachment: AttachmentData,
          priorities: PriorityConfig[] = PRIORITY_CONFIGS,
        ) => resolveYearForAttachment(attachment, priorities, metrics),

        // Resolve years for all attachments in metadata
        resolveYear: (
          metadata: HashMap.HashMap<string, List.List<AttachmentData>>,
        ) =>
          Effect.gen(function* () {
            // Convert HashMap entries to array for processing
            const entries = Array.from(HashMap.entries(metadata));

            // Process each lookup code and its attachments
            const processedEntries = yield* Effect.forEach(
              entries,
              ([lookupCode, attachments]) =>
                Effect.gen(function* () {
                  // Convert List to array for processing
                  const attachmentArray = List.toArray(attachments);

                  // Resolve years for all attachments in this group
                  const processedAttachments = yield* Effect.forEach(
                    attachmentArray,
                    (attachment) =>
                      Effect.gen(function* () {
                        const year = yield* resolveYearForAttachment(
                          attachment,
                          PRIORITY_CONFIGS,
                          metrics,
                        );
                        return { attachment, year };
                      }),
                  );

                  // Filter out failed determinations and add metadata
                  const validAttachments = processedAttachments
                    .filter(({ year }) => year !== null)
                    .map(({ attachment, year }) => ({
                      ...attachment,
                      key: lookupCode,
                      name: attachment.formatted.nameOf,
                      determinedYear: year!,
                    }));

                  return [lookupCode, validAttachments] as const;
                }),
            );

            // Convert back to HashMap
            let result: OrganizedHashMap = HashMap.empty<
              string,
              List.List<Attachment>
            >();
            for (const [lookupCode, validAttachments] of processedEntries) {
              result = HashMap.set(
                result,
                lookupCode,
                List.fromIterable(validAttachments),
              );
            }
            return result;
          }),

        // Get detailed metrics report
        getMetrics: () => metrics.getDetailedReport(PRIORITY_CONFIGS),

        // Reset all metrics
        resetMetrics: () => metrics.reset(),

        // Get priority configurations
        getPriorityConfigs: () => Effect.sync(() => PRIORITY_CONFIGS),
      };
    }),
    dependencies: [DynamicYearMetricsService.Default],
  },
) {}
