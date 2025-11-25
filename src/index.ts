import { Command, Options } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { AttachmentMetadataOrchestratorService } from "./services/attachment-metadata/orchestrator.js";
import { GoogleDriveReorganizationService } from "./services/google-drive/reorganization.js";
import { MappingOrchestratorService } from "./services/mapping/orchestrator.js";

// Create complete layer
const mainLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
  MappingOrchestratorService.Default,
  GoogleDriveReorganizationService.Default,
  NodeContext.layer,
);

// Main reorganization execution
const runProgram = (options: {
  dryRun: boolean;
  limitFirst: boolean;
  skipMerge: boolean;
}) =>
  Effect.gen(function* () {
    // Set environment variables based on options
    if (options.limitFirst) {
      process.env.LIMIT_TO_FIRST_FOLDER = "true";
      yield* Effect.log(
        "Running in LIMIT MODE: Processing only first folder and one file",
      );
    }

    if (options.skipMerge) {
      process.env.SKIP_DUPLICATE_MERGING = "true";
      yield* Effect.log(
        "Running in SKIP MODE: Skipping duplicate merging entirely",
      );
    }

    const metadataOrchestrator = yield* AttachmentMetadataOrchestratorService;
    const mappingOrchestrator = yield* MappingOrchestratorService;
    yield* GoogleDriveReorganizationService;

    const organized = yield* metadataOrchestrator.run({ useCache: true });

    yield* mappingOrchestrator.runMapping(organized);

    // drive reorganization (commented out)
    // const result = yield* reorgService.processOrganizedAttachments(
    //   organizedAttachments,
    //   { dryRun: options.dryRun },
    // );
  });

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
  cli(process.argv).pipe(Effect.provide(mainLayer), NodeRuntime.runMain);
}
