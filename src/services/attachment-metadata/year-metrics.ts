import { Effect } from "effect";
import type { Attachment } from "./transform.js";
import type { PriorityConfig } from "./year-priority-config.js";

// Metrics interfaces
export interface PriorityMetric {
  count: number;
  percentage: string;
  description: string;
}

export interface FailureBreakdown {
  count: number;
  nameOf: string;
  percentage: string;
}

export interface YearDeterminationMetrics {
  summary: {
    totalRecords: number;
    successRate: string;
    successfulDeterminations: number;
    fallbackToAttachedDate: number;
    failures: number;
  };
  breakdown: Record<string, PriorityMetric>;
  failureBreakdown: Record<string, FailureBreakdown>;
  failureSamples: Attachment[];
}

// Dynamic metrics service
export class DynamicYearMetricsService extends Effect.Service<DynamicYearMetricsService>()(
  "DynamicYearMetricsService",
  {
    effect: Effect.gen(function* () {
      // Internal state
      const priorityMetrics = new Map<number, number>();
      const failureSamples: Attachment[] = [];
      const failureBreakdown = new Map<
        string,
        { count: number; nameOf: string }
      >();

      let totalRecords = 0;
      let successfulDeterminations = 0;
      let fallbackToAttachedDate = 0;
      let failures = 0;

      return {
        // Record a successful year determination for a specific priority
        recordPrioritySuccess: (priorityId: number) =>
          Effect.sync(() => {
            const currentCount = priorityMetrics.get(priorityId) || 0;
            priorityMetrics.set(priorityId, currentCount + 1);
            successfulDeterminations++;
          }),

        // Record a failed year determination
        recordFailure: (attachment: Attachment) =>
          Effect.sync(() => {
            failures++;

            // Keep only last 20 failure samples to avoid huge output
            if (failureSamples.length >= 20) {
              failureSamples.shift();
            }
            failureSamples.push(attachment);

            // Track failure breakdown by lookup code
            const lookupCode = attachment.raw.lookupCode;
            const nameOf = attachment.raw.nameOf;

            if (lookupCode && !failureBreakdown.has(lookupCode)) {
              failureBreakdown.set(lookupCode, {
                count: 0,
                nameOf: nameOf || "Unknown",
              });
            }

            if (lookupCode && failureBreakdown.has(lookupCode)) {
              const current = failureBreakdown.get(lookupCode)!;
              current.count++;
            }
          }),

        // Increment total records processed
        incrementTotal: () =>
          Effect.sync(() => {
            totalRecords++;
          }),

        // Get current success rate
        getSuccessRate: () =>
          Effect.sync(() => {
            if (totalRecords === 0) return 0;
            return (successfulDeterminations / totalRecords) * 100;
          }),

        // Generate detailed metrics report
        getDetailedReport: (priorityConfigs: PriorityConfig[]) =>
          Effect.sync(() => {
            const successRate =
              totalRecords > 0
                ? (successfulDeterminations / totalRecords) * 100
                : 0;

            // Generate breakdown for each priority
            const breakdown: Record<string, PriorityMetric> = {};
            for (const config of priorityConfigs) {
              const count = priorityMetrics.get(config.id) || 0;
              breakdown[`priority${config.id}`] = {
                count,
                percentage:
                  totalRecords > 0
                    ? `${((count / totalRecords) * 100).toFixed(2)}%`
                    : "0%",
                description: config.description,
              };
            }

            // Generate failure breakdown
            const failureBreakdownObj: Record<string, FailureBreakdown> = {};
            for (const [lookupCode, data] of failureBreakdown.entries()) {
              failureBreakdownObj[lookupCode] = {
                count: data.count,
                nameOf: data.nameOf,
                percentage:
                  totalRecords > 0
                    ? `${((data.count / totalRecords) * 100).toFixed(2)}%`
                    : "0%",
              };
            }

            // Sort failures by count and take top 20
            const sortedFailures = Object.entries(failureBreakdownObj)
              .sort(([, a], [, b]) => b.count - a.count)
              .slice(0, 20)
              .reduce(
                (acc, [key, value]) => {
                  acc[key] = value;
                  return acc;
                },
                {} as Record<string, FailureBreakdown>,
              );

            return {
              summary: {
                totalRecords,
                successRate: `${successRate.toFixed(2)}%`,
                successfulDeterminations,
                fallbackToAttachedDate,
                failures,
              },
              breakdown,
              failureBreakdown: sortedFailures,
              failureSamples: failureSamples.slice(0, 20),
            } as YearDeterminationMetrics;
          }),

        // Get raw metrics (for backward compatibility)
        getRawMetrics: () =>
          Effect.sync(() => {
            return {
              totalRecords,
              successfulDeterminations,
              fallbackToAttachedDate,
              failures,
              priorityMetrics: Object.fromEntries(priorityMetrics),
              failureSamples: [...failureSamples],
              failureBreakdown: Object.fromEntries(failureBreakdown),
            };
          }),

        // Reset all metrics
        reset: () =>
          Effect.sync(() => {
            priorityMetrics.clear();
            failureSamples.length = 0;
            failureBreakdown.clear();
            totalRecords = 0;
            successfulDeterminations = 0;
            fallbackToAttachedDate = 0;
            failures = 0;
          }),

        // Get priority count by ID
        getPriorityCount: (priorityId: number) =>
          Effect.sync(() => priorityMetrics.get(priorityId) || 0),

        // Get all priority metrics
        getAllPriorityMetrics: () =>
          Effect.sync(() => Object.fromEntries(priorityMetrics)),
      };
    }),
    dependencies: [],
  },
) {}
