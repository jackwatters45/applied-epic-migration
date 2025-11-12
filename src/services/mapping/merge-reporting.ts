import { Effect } from "effect";

// Result types for reporting (moved from core service)
export interface MergeResult {
  readonly sourceFolderId: string;
  readonly targetFolderId: string;
  readonly sourceFolderName: string;
  readonly targetFolderName: string;
  readonly filesMoved: number;
  readonly foldersMoved: number;
  readonly errors: readonly string[];
  readonly success: boolean;
}

export interface MergeReport {
  readonly timestamp: string;
  readonly summary: {
    totalDuplicates: number;
    successfulMerges: number;
    failedMerges: number;
    totalFilesMoved: number;
    totalFoldersMoved: number;
    totalErrors: number;
  };
  readonly results: readonly MergeResult[];
}

export interface ReportOptions {
  readonly includeDetails: boolean;
  readonly outputPath?: string;
}

export class MergeReportingService extends Effect.Service<MergeReportingService>()(
  "MergeReportingService",
  {
    effect: Effect.gen(function* () {
      const generateReport = (
        results: readonly MergeResult[],
        options: ReportOptions = { includeDetails: true },
      ): Effect.Effect<MergeReport, Error> =>
        Effect.gen(function* () {
          const timestamp = new Date().toISOString();

          const summary = {
            totalDuplicates: results.length,
            successfulMerges: results.filter((r) => r.success).length,
            failedMerges: results.filter((r) => !r.success).length,
            totalFilesMoved: results.reduce((sum, r) => sum + r.filesMoved, 0),
            totalFoldersMoved: results.reduce(
              (sum, r) => sum + r.foldersMoved,
              0,
            ),
            totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
          };

          return {
            timestamp,
            summary,
            results: options.includeDetails ? results : [],
          };
        });

      const logSummary = (report: MergeReport): Effect.Effect<void, never> =>
        Effect.sync(() => {
          console.log(`\n=== Merge Report - ${report.timestamp} ===`);
          console.log(
            `Total duplicates processed: ${report.summary.totalDuplicates}`,
          );
          console.log(`Successful merges: ${report.summary.successfulMerges}`);
          console.log(`Failed merges: ${report.summary.failedMerges}`);
          console.log(`Files moved: ${report.summary.totalFilesMoved}`);
          console.log(`Folders moved: ${report.summary.totalFoldersMoved}`);
          console.log(`Total errors: ${report.summary.totalErrors}`);

          if (report.summary.failedMerges > 0) {
            console.log("\nFailed merges:");
            report.results
              .filter((r) => !r.success)
              .forEach((r) => {
                console.log(
                  `  - ${r.sourceFolderName} → ${r.targetFolderName}`,
                );
                r.errors.forEach((error) => {
                  console.log(`    Error: ${error}`);
                });
              });
          }
        });

      const logDetailedResults = (
        report: MergeReport,
      ): Effect.Effect<void, never> =>
        Effect.sync(() => {
          console.log("\n=== Detailed Results ===");
          report.results.forEach((result, index) => {
            console.log(
              `\n${index + 1}. ${result.sourceFolderName} → ${result.targetFolderName}`,
            );
            console.log(`   Status: ${result.success ? "SUCCESS" : "FAILED"}`);
            console.log(`   Files moved: ${result.filesMoved}`);
            console.log(`   Folders moved: ${result.foldersMoved}`);
            if (result.errors.length > 0) {
              console.log(`   Errors: ${result.errors.join(", ")}`);
            }
          });
        });

      return {
        generateReport,
        logSummary,
        logDetailedResults,
      } as const;
    }),
    dependencies: [],
  },
) {}
