import { Effect } from "effect";
import type { Attachment } from "./transform.js";

// Metrics interface for year determination
export interface YearDeterminationMetrics {
  totalRecords: number;
  successfulDeterminations: number;
  fallbackToAttachedDate: number;
  failures: number;
  priority1Success: number; // Year folder in original path
  priority2Success: number; // Explicit 4-digit year in description
  priority3Success: number; // Two-digit year at start of description
  priority4Success: number; // Year range patterns and filename patterns
  priority5Success: number; // Additional filename patterns
  priority6Success: number; // Single digit year patterns like "24 WC"
  priority7Success: number; // Date ranges in parentheses
  priority8Success: number; // Year in original path
  priority9Success: number; // Year in blob timestamps
  priority10Success: number; // Year in filename with underscores
  priority11Success: number; // Year in filename with dashes
  priority12Success: number; // Year after dash in description
  priority13Success: number; // Expiration date fallback
  priority14Success: number; // Activity description date patterns
  priority15Success: number; // Activity entered date
  priority16Success: number; // Attached date fallback after 10/30/2022
  priority17Success: number; // Lookup code start date fallback
  priority18Success: number; // Specific lookup codes attachment date fallback
  failureSamples: Attachment[]; // Full attachment objects for failed cases
  failureBreakdown: Record<string, { count: number; nameOf: string }>; // Failures by lookup code
}

export class YearMetricsService extends Effect.Service<YearMetricsService>()(
  "YearMetricsService",
  {
    effect: Effect.gen(function* () {
      const metrics: YearDeterminationMetrics = {
        totalRecords: 0,
        successfulDeterminations: 0,
        fallbackToAttachedDate: 0,
        failures: 0,
        priority1Success: 0,
        priority2Success: 0,
        priority3Success: 0,
        priority4Success: 0,
        priority5Success: 0,
        priority6Success: 0,
        priority7Success: 0,
        priority8Success: 0,
        priority9Success: 0,
        priority10Success: 0,
        priority11Success: 0,
        priority12Success: 0,
        priority13Success: 0,
        priority14Success: 0,
        priority15Success: 0,
        priority16Success: 0,
        priority17Success: 0,
        priority18Success: 0,
        failureSamples: [],
        failureBreakdown: {},
      };

      return {
        getMetrics: () => Effect.sync(() => ({ ...metrics })),

        incrementTotal: () =>
          Effect.sync(() => {
            metrics.totalRecords++;
          }),

        recordPrioritySuccess: (priority: number) =>
          Effect.sync(() => {
            const priorityKey =
              `priority${priority}Success` as keyof YearDeterminationMetrics;
            if (typeof metrics[priorityKey] === "number") {
              (metrics[priorityKey] as number)++;
              metrics.successfulDeterminations++;
            }
          }),

        recordFailure: () =>
          Effect.sync(() => {
            metrics.failures++;
          }),

        addFailureSample: (attachment: Attachment) =>
          Effect.sync(() => {
            // Keep only last 20 failure samples to avoid huge output
            if (metrics.failureSamples.length >= 20) {
              metrics.failureSamples.shift();
            }
            metrics.failureSamples.push(attachment);

            // Track failure breakdown by lookup code
            const lookupCode = attachment.raw.lookupCode;
            const nameOf = attachment.raw.nameOf;

            if (lookupCode && !metrics.failureBreakdown[lookupCode]) {
              metrics.failureBreakdown[lookupCode] = {
                count: 0,
                nameOf: nameOf || "Unknown",
              };
            }

            if (lookupCode && metrics.failureBreakdown[lookupCode]) {
              metrics.failureBreakdown[lookupCode].count++;
            }
          }),

        getSuccessRate: () =>
          Effect.sync(() => {
            if (metrics.totalRecords === 0) return 0;
            return (
              (metrics.successfulDeterminations / metrics.totalRecords) * 100
            );
          }),

        getDetailedReport: () =>
          Effect.sync(() => {
            const successRate =
              metrics.totalRecords > 0
                ? (metrics.successfulDeterminations / metrics.totalRecords) *
                  100
                : 0;

            return {
              summary: {
                totalRecords: metrics.totalRecords,
                successRate: `${successRate.toFixed(2)}%`,
                successfulDeterminations: metrics.successfulDeterminations,
                fallbackToAttachedDate: metrics.fallbackToAttachedDate,
                failures: metrics.failures,
              },
              breakdown: {
                priority1: {
                  count: metrics.priority1Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority1Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Year folder in original path",
                },
                priority2: {
                  count: metrics.priority2Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority2Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Explicit 4-digit year in description",
                },
                priority3: {
                  count: metrics.priority3Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority3Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Two-digit year at start of description",
                },
                priority4: {
                  count: metrics.priority4Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority4Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Year range patterns (e.g., '18-23')",
                },
                priority5: {
                  count: metrics.priority5Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority5Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Year in filename patterns (e.g., '18-23 CVLR')",
                },
                priority6: {
                  count: metrics.priority6Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority6Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Single digit year patterns like '24 WC'",
                },
                priority7: {
                  count: metrics.priority7Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority7Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description:
                    "Date ranges in parentheses like '(10272023 to 10272024)'",
                },
                priority8: {
                  count: metrics.priority8Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority8Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Year in original path patterns",
                },
                priority9: {
                  count: metrics.priority9Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority9Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Year in blob timestamps",
                },
                priority10: {
                  count: metrics.priority10Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority10Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Year in filename with underscores",
                },
                priority11: {
                  count: metrics.priority11Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority11Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Year in filename with dashes",
                },
                priority12: {
                  count: metrics.priority12Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority12Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Year after dash in description",
                },
                priority13: {
                  count: metrics.priority13Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority13Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Expiration date fallback",
                },
                priority14: {
                  count: metrics.priority14Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority14Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Activity description date patterns",
                },
                priority15: {
                  count: metrics.priority15Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority15Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Activity entered date",
                },
                priority16: {
                  count: metrics.priority16Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority16Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Attached date fallback after 10/30/2022",
                },
                priority17: {
                  count: metrics.priority17Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority17Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Lookup code start date fallback",
                },
                priority18: {
                  count: metrics.priority18Success,
                  percentage:
                    metrics.totalRecords > 0
                      ? `${((metrics.priority18Success / metrics.totalRecords) * 100).toFixed(2)}%`
                      : "0%",
                  description: "Specific lookup codes attachment date fallback",
                },
              },
              failureBreakdown: Object.entries(metrics.failureBreakdown)
                .sort(([, a], [, b]) => b.count - a.count) // Sort by count descending
                .slice(0, 20) // Top 20 failing lookup codes
                .reduce(
                  (acc, [lookupCode, data]) => {
                    acc[lookupCode] = {
                      count: data.count,
                      nameOf: data.nameOf,
                      percentage:
                        metrics.totalRecords > 0
                          ? `${((data.count / metrics.totalRecords) * 100).toFixed(2)}%`
                          : "0%",
                    };
                    return acc;
                  },
                  {} as Record<
                    string,
                    { count: number; nameOf: string; percentage: string }
                  >,
                ),
              failureSamples: metrics.failureSamples.slice(0, 20), // Include first 20 failure samples
            };
          }),

        reset: () =>
          Effect.sync(() => {
            metrics.totalRecords = 0;
            metrics.successfulDeterminations = 0;
            metrics.fallbackToAttachedDate = 0;
            metrics.failures = 0;
            metrics.priority1Success = 0;
            metrics.priority2Success = 0;
            metrics.priority3Success = 0;
            metrics.priority4Success = 0;
            metrics.priority5Success = 0;
            metrics.priority6Success = 0;
            metrics.priority7Success = 0;
            metrics.priority8Success = 0;
            metrics.priority9Success = 0;
            metrics.priority10Success = 0;
            metrics.priority11Success = 0;
            metrics.priority12Success = 0;
            metrics.priority13Success = 0;
            metrics.priority14Success = 0;
            metrics.priority15Success = 0;
            metrics.priority16Success = 0;
            metrics.priority17Success = 0;
            metrics.priority18Success = 0;
            metrics.failureSamples = [];
            metrics.failureBreakdown = {};
          }),
      };
    }),
    dependencies: [],
  },
) {}
