import { Effect, Schema } from "effect";
import {
  type ReorganizationOptions,
  ReorganizationOrchestratorService,
  type ReorganizationSummary,
} from "./orchestrator.js";

// Error types
export class CLIError extends Schema.TaggedError<CLIError>()("CLIError", {
  message: Schema.String,
  status: Schema.optional(Schema.Number),
}) {}

export interface CLIOptions {
  readonly sourceFolderId: string;
  readonly dryRun: boolean;
  readonly verbose: boolean;
  readonly batchSize: number;
  readonly skipDuplicates: boolean;
  readonly outputFormat: "json" | "table";
}

// CLI Service
export class CLIService extends Effect.Service<CLIService>()("CLIService", {
  effect: Effect.gen(function* () {
    const orchestrator = yield* ReorganizationOrchestratorService;

    return {
      parseArguments: (_args: readonly string[]) =>
        Effect.gen(function* () {
          // TODO: Parse command line arguments
          return {
            sourceFolderId: "",
            dryRun: false,
            verbose: false,
            batchSize: 50,
            skipDuplicates: true,
            outputFormat: "table" as const,
          } as CLIOptions;
        }),

      validateOptions: (options: CLIOptions) =>
        Effect.gen(function* () {
          // TODO: Validate CLI options
          if (!options.sourceFolderId) {
            return yield* Effect.fail(
              new CLIError({
                message: "Source folder ID is required",
                status: 400,
              }),
            );
          }
          return options;
        }),

      executeReorganization: (options: CLIOptions) =>
        Effect.gen(function* () {
          const reorgOptions: ReorganizationOptions = {
            sourceFolderId: options.sourceFolderId,
            dryRun: options.dryRun,
            batchSize: options.batchSize,
            skipDuplicates: options.skipDuplicates,
          };

          if (options.dryRun) {
            return yield* orchestrator.dryRun(reorgOptions);
          }
          const plan =
            yield* orchestrator.createReorganizationPlan(reorgOptions);
          return yield* orchestrator.executeReorganization(plan, reorgOptions);
        }),

      formatOutput: (
        summary: ReorganizationSummary,
        format: "json" | "table",
      ) =>
        Effect.gen(function* () {
          // TODO: Format output for display
          if (format === "json") {
            return JSON.stringify(summary, null, 2);
          }
          // TODO: Create table format
          return `Reorganization Summary:\nTotal Files: ${summary.totalFiles}\nProcessed: ${summary.processedFiles}\nSkipped: ${summary.skippedFiles}`;
        }),

      displayProgress: (current: number, total: number, message: string) =>
        Effect.gen(function* () {
          // TODO: Display progress updates
          console.log(`[${current}/${total}] ${message}`);
        }),

      handleError: (error: CLIError) =>
        Effect.gen(function* () {
          // TODO: Handle and display errors
          console.error(`Error: ${error.message}`);
        }),
    } as const;
  }),
  dependencies: [ReorganizationOrchestratorService.Default],
}) {}
