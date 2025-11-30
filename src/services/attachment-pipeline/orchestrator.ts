import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { AttachmentMetadataOrchestratorService } from "../attachment-metadata/orchestrator.js";
import { ProgressLoggerService } from "../lib/progress.js";
import { AttachmentRenamerService } from "./file-renamer.js";
import { AttachmentHierarchyService } from "./hierarchy-builder.js";
import { ZipExtractorService } from "./zip-extractor.js";

// ============================================================================
// Types
// ============================================================================

export interface OrganizeOptions {
  /** Maximum number of items to process per step (for testing) */
  readonly limit?: number | undefined;
  /** Dry run - don't make any changes */
  readonly dryRun?: boolean | undefined;
  /** Skip specific steps */
  readonly skip?: {
    readonly hierarchy?: boolean | undefined;
    readonly extractZips?: boolean | undefined;
    readonly rename?: boolean | undefined;
  };
}

export interface OrganizeStepResult {
  readonly step: string;
  readonly success: boolean;
  readonly skipped: boolean;
  readonly duration: number;
  readonly summary: string;
  readonly error?: string | undefined;
}

export interface OrganizeResult {
  readonly timestamp: string;
  readonly totalDuration: number;
  readonly steps: readonly OrganizeStepResult[];
  readonly success: boolean;
}

// Error type for orchestrator operations
export class AttachmentOrganizerError extends Schema.TaggedError<AttachmentOrganizerError>()(
  "AttachmentOrganizerError",
  {
    message: Schema.String,
    type: Schema.String,
    step: Schema.optional(Schema.String),
    details: Schema.optional(Schema.String),
  },
) {}

// ============================================================================
// Service
// ============================================================================

export class AttachmentOrganizerService extends Effect.Service<AttachmentOrganizerService>()(
  "AttachmentOrganizerService",
  {
    effect: Effect.gen(function* () {
      const metadataOrchestrator = yield* AttachmentMetadataOrchestratorService;
      const hierarchyBuilder = yield* AttachmentHierarchyService;
      const zipExtractor = yield* ZipExtractorService;
      const renamer = yield* AttachmentRenamerService;
      const progress = yield* ProgressLoggerService;
      const fs = yield* FileSystem.FileSystem;

      /**
       * Run the full organization pipeline:
       * 1. Build hierarchy (create Agency/Year folders)
       * 2. Extract zips (in place)
       * 3. Rename files (UUID -> human-readable)
       */
      const organize = (options: OrganizeOptions = {}) =>
        Effect.gen(function* () {
          const startTime = Date.now();
          const steps: OrganizeStepResult[] = [];

          yield* progress.logItem("");
          yield* progress.logItem("=".repeat(70));
          yield* progress.logItem("ATTACHMENT ORGANIZATION PIPELINE");
          yield* progress.logItem("=".repeat(70));

          if (options.dryRun) {
            yield* progress.logItem("DRY RUN MODE - No changes will be made");
          }

          yield* progress.logItem("");
          yield* progress.logItem("Pipeline steps:");
          yield* progress.logItem(
            "  1. Build hierarchy (create Agency/Year folders)",
          );
          yield* progress.logItem("  2. Extract zip files");
          yield* progress.logItem("  3. Rename files (UUID -> human-readable)");
          yield* progress.logItem("");

          // Load metadata once for all steps
          yield* progress.logItem("Loading attachment metadata...");
          const organized = yield* metadataOrchestrator.run({ useCache: true });

          // Step 1: Build hierarchy
          yield* progress.logItem("");
          yield* progress.logItem("-".repeat(70));
          yield* progress.logItem("STEP 1: Build Hierarchy");
          yield* progress.logItem("-".repeat(70));

          if (options.skip?.hierarchy) {
            yield* progress.logItem("SKIPPED (via options)");
            steps.push({
              step: "build-hierarchy",
              success: true,
              skipped: true,
              duration: 0,
              summary: "Skipped via options",
            });
          } else {
            const stepStart = Date.now();
            const result = yield* Effect.either(
              hierarchyBuilder.buildHierarchy(organized, {
                limit: options.limit,
                dryRun: options.dryRun,
              }),
            );

            const duration = Date.now() - stepStart;

            if (result._tag === "Right") {
              steps.push({
                step: "build-hierarchy",
                success: true,
                skipped: false,
                duration,
                summary: `Created ${result.right.createdAgencyFolders} agency folders, ${result.right.createdYearFolders} year folders`,
              });
            } else {
              steps.push({
                step: "build-hierarchy",
                success: false,
                skipped: false,
                duration,
                summary: "Failed",
                error: String(result.left),
              });
              yield* progress.logItem(`ERROR: ${result.left}`);
            }
          }

          // Step 2: Extract zips
          yield* progress.logItem("");
          yield* progress.logItem("-".repeat(70));
          yield* progress.logItem("STEP 2: Extract Zip Files");
          yield* progress.logItem("-".repeat(70));

          if (options.skip?.extractZips) {
            yield* progress.logItem("SKIPPED (via options)");
            steps.push({
              step: "extract-zips",
              success: true,
              skipped: true,
              duration: 0,
              summary: "Skipped via options",
            });
          } else {
            const stepStart = Date.now();
            const result = yield* Effect.either(
              zipExtractor.extractAllZips(organized, {
                limit: options.limit,
                dryRun: options.dryRun,
              }),
            );

            const duration = Date.now() - stepStart;

            if (result._tag === "Right") {
              steps.push({
                step: "extract-zips",
                success: true,
                skipped: false,
                duration,
                summary: `Extracted ${result.right.totalFilesExtracted} files from ${result.right.successfulExtractions} zips`,
              });
            } else {
              steps.push({
                step: "extract-zips",
                success: false,
                skipped: false,
                duration,
                summary: "Failed",
                error: String(result.left),
              });
              yield* progress.logItem(`ERROR: ${result.left}`);
            }
          }

          // Step 3: Rename files
          yield* progress.logItem("");
          yield* progress.logItem("-".repeat(70));
          yield* progress.logItem("STEP 3: Rename Files");
          yield* progress.logItem("-".repeat(70));

          if (options.skip?.rename) {
            yield* progress.logItem("SKIPPED (via options)");
            steps.push({
              step: "rename-files",
              success: true,
              skipped: true,
              duration: 0,
              summary: "Skipped via options",
            });
          } else {
            const stepStart = Date.now();
            const result = yield* Effect.either(
              renamer.renameAll(organized, {
                limit: options.limit,
                dryRun: options.dryRun,
              }),
            );

            const duration = Date.now() - stepStart;

            if (result._tag === "Right") {
              steps.push({
                step: "rename-files",
                success: true,
                skipped: false,
                duration,
                summary: `Renamed ${result.right.renamed} files`,
              });
            } else {
              steps.push({
                step: "rename-files",
                success: false,
                skipped: false,
                duration,
                summary: "Failed",
                error: String(result.left),
              });
              yield* progress.logItem(`ERROR: ${result.left}`);
            }
          }

          const totalDuration = Date.now() - startTime;
          const success = steps.every((s) => s.success);

          const organizeResult: OrganizeResult = {
            timestamp: new Date().toISOString(),
            totalDuration,
            steps,
            success,
          };

          // Write report
          yield* fs
            .makeDirectory("logs", { recursive: true })
            .pipe(Effect.ignore);
          yield* fs.writeFileString(
            "logs/organize-report.json",
            JSON.stringify(organizeResult, null, 2),
          );

          // Summary
          yield* progress.logItem("");
          yield* progress.logItem("=".repeat(70));
          yield* progress.logItem("PIPELINE COMPLETE");
          yield* progress.logItem("=".repeat(70));
          yield* progress.logItem(
            `Total duration: ${(totalDuration / 1000).toFixed(1)}s`,
          );
          yield* progress.logItem("");

          for (const step of steps) {
            const status = step.skipped
              ? "SKIPPED"
              : step.success
                ? "SUCCESS"
                : "FAILED";
            yield* progress.logItem(
              `  ${step.step}: ${status} (${(step.duration / 1000).toFixed(1)}s) - ${step.summary}`,
            );
          }

          yield* progress.logItem("");
          yield* progress.logItem(
            success
              ? "All steps completed successfully!"
              : "Some steps failed!",
          );
          yield* progress.logItem("Report saved to: logs/organize-report.json");

          return organizeResult;
        });

      return {
        organize,
      };
    }),
    dependencies: [
      AttachmentMetadataOrchestratorService.Default,
      AttachmentHierarchyService.Default,
      ZipExtractorService.Default,
      AttachmentRenamerService.Default,
      ProgressLoggerService.Default,
      NodeContext.layer,
    ],
  },
) {}
