import { Command, Options } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { ConfigProvider, Effect, Layer } from "effect";
import { AttachmentMetadataOrchestratorService } from "./services/attachment-metadata/orchestrator.js";
import { GoogleDriveReorganizationService } from "./services/google-drive/reorganization.js";
import { MappingOrchestratorService } from "./services/mapping/orchestrator.js";
import { MergingOrchestratorService } from "./services/merging/orchestrator.js";
import { RollbackService } from "./services/merging/rollback.js";

// Create a config layer from CLI options
const makeConfigLayer = (options: {
  limitFirst: boolean;
  skipMerge: boolean;
}) =>
  Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["LIMIT_TO_FIRST_FOLDER", options.limitFirst.toString()],
        ["SKIP_DUPLICATE_MERGING", options.skipMerge.toString()],
      ]),
    ).pipe(ConfigProvider.orElse(() => ConfigProvider.fromEnv())),
  );

// Create base layer with all services
const baseLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
  MappingOrchestratorService.Default,
  MergingOrchestratorService.Default,
  GoogleDriveReorganizationService.Default,
  RollbackService.Default,
  NodeContext.layer,
);

// Main reorganization execution
const runProgram = (options: {
  dryRun: boolean;
  limitFirst: boolean;
  skipMerge: boolean;
}) =>
  Effect.gen(function* () {
    const metadataOrchestrator = yield* AttachmentMetadataOrchestratorService;
    const mergingOrchestrator = yield* MergingOrchestratorService;
    const mappingOrchestrator = yield* MappingOrchestratorService;
    const rollback = yield* RollbackService;
    yield* GoogleDriveReorganizationService;

    // Log runtime options
    if (options.limitFirst) {
      yield* Effect.log(
        "Running in LIMIT MODE: Processing only first folder and one file",
      );
    }
    if (options.skipMerge) {
      yield* Effect.log(
        "Running in SKIP MODE: Skipping duplicate merging entirely",
      );
    }

    // Create rollback session for the entire operation
    const session = yield* rollback.createSession("migration-workflow");

    // Step 1: Process and organize metadata
    const organized = yield* metadataOrchestrator.run({ useCache: true });

    // Step 2: Resolve duplicate folders (unless skipped)
    if (!options.skipMerge) {
      yield* mergingOrchestrator.resolveDuplicates(session.id);
    } else {
      yield* Effect.log("Skipping duplicate merging as requested");
    }

    // Step 3: Map attachments to folders
    yield* mappingOrchestrator.mapAttachments(organized);

    // Complete the rollback session
    yield* rollback.completeSession(session.id);

    yield* Effect.log("✅ Migration workflow completed successfully!");

    // drive reorganization (commented out)
    // const result = yield* reorgService.processOrganizedAttachments(
    //   organizedAttachments,
    //   { dryRun: options.dryRun },
    // );
  }).pipe(Effect.provide(Layer.merge(makeConfigLayer(options), baseLayer)));

// Define CLI options
const dryRunOption = Options.boolean("dry-run").pipe(
  Options.withAlias("d"),
  Options.withDescription("Run without making actual changes"),
  Options.withDefault(false),
);

const limitFirstOption = Options.boolean("limit-first").pipe(
  Options.withAlias("l"),
  Options.withDescription("Process only first folder and one file"),
  Options.withDefault(false),
);

const skipMergeOption = Options.boolean("skip-merge").pipe(
  Options.withAlias("s"),
  Options.withDescription("Skip duplicate merging entirely"),
  Options.withDefault(false),
);

// Define the main command
const command = Command.make(
  "run",
  {
    dryRun: dryRunOption,
    limitFirst: limitFirstOption,
    skipMerge: skipMergeOption,
  },
  runProgram,
).pipe(
  Command.withDescription(
    "Execute the Applied Epic migration reorganization process",
  ),
);

// Create the CLI runner
const cli = Command.run(command, {
  name: "Applied Epic Migration",
  version: "0.0.0",
});

// CLI execution
if (import.meta.main) {
  cli(process.argv).pipe(
    Effect.provide(NodeContext.layer),
    NodeRuntime.runMain,
  );
}
