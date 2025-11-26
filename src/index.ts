import * as readline from "node:readline";
import { Command, Options } from "@effect/cli";
import { Terminal } from "@effect/platform";
import { NodeContext, NodeRuntime, NodeTerminal } from "@effect/platform-node";
import { ConfigProvider, Effect, Layer } from "effect";
import { AttachmentMetadataOrchestratorService } from "./services/attachment-metadata/orchestrator.js";
import { GoogleDriveReorganizationService } from "./services/google-drive/reorganization.js";
import {
  type AgencyMapping,
  AgencyMappingStoreService,
} from "./services/mapping/agency-mapping-store.js";
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
    const organized = yield* metadataOrchestrator.run({ useCache: false });

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

    yield* Effect.log("Migration workflow completed successfully!");

    // drive reorganization (commented out)
    // const result = yield* reorgService.processOrganizedAttachments(
    //   organizedAttachments,
    //   { dryRun: options.dryRun },
    // );
  }).pipe(Effect.provide(Layer.merge(makeConfigLayer(options), baseLayer)));

// ============================================================================
// Review Command - Interactive review of pending mappings
// ============================================================================

type PendingMapping = {
  agencyName: string;
  folderId: string;
  folderName: string;
  confidence: number;
  matchType: string;
  reasoning: string;
  matchedAt: string;
  reviewedAt?: string;
};

const reviewLayer = Layer.mergeAll(
  AgencyMappingStoreService.Default,
  NodeContext.layer,
  NodeTerminal.layer,
);

// Prompt helper that echoes input as you type
const prompt = (question: string): Effect.Effect<string> =>
  Effect.async<string>((resume) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resume(Effect.succeed(answer));
    });
  });

const runReview = () =>
  Effect.gen(function* () {
    const store = yield* AgencyMappingStoreService;
    const terminal = yield* Terminal.Terminal;

    const display = (message: string) => terminal.display(`${message}\n`);

    const pending = yield* store.getPendingReview();

    if (pending.length === 0) {
      yield* display(
        "No mappings pending review. All mappings are >= 90% confidence.",
      );
      return;
    }

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("AGENCY MAPPING REVIEW");
    yield* display(`${"=".repeat(60)}`);
    yield* display(
      `\nFound ${pending.length} mapping(s) needing review (<90% confidence)\n`,
    );

    for (const mapping of pending as PendingMapping[]) {
      const hasMatch = mapping.folderId !== "";

      yield* display("-".repeat(60));
      yield* display(`Agency: "${mapping.agencyName}"`);

      if (hasMatch) {
        yield* display(
          `Current Match: "${mapping.folderName}" (${mapping.confidence}%)`,
        );
        yield* display(`Reasoning: ${mapping.reasoning}`);
      } else {
        yield* display("Current Match: NONE (no matching folder found)");
        yield* display("This agency requires manual folder ID entry.");
      }

      yield* display("");
      yield* display("Options:");
      if (hasMatch) {
        yield* display("  [a] Accept this match");
      }
      yield* display("  [s] Skip (review later)");
      yield* display("  [m] Enter manual folder ID");
      yield* display("  [q] Quit review");
      yield* display("");

      const choice = yield* prompt("Your choice: ");
      const normalizedChoice = choice.trim().toLowerCase();

      if (normalizedChoice === "q") {
        yield* display("\nExiting review...");
        break;
      }

      if (normalizedChoice === "a" && hasMatch) {
        // Accept the current match
        const updatedMapping: AgencyMapping = {
          folderId: mapping.folderId,
          folderName: mapping.folderName,
          confidence: 100, // Bump to 100% since manually accepted
          matchType: "manual",
          reasoning: `Manually accepted: ${mapping.reasoning}`,
          matchedAt: mapping.matchedAt,
          reviewedAt: new Date().toISOString(),
        };
        yield* store.set(mapping.agencyName, updatedMapping);
        yield* display(
          `Accepted: "${mapping.agencyName}" -> "${mapping.folderName}"\n`,
        );
      } else if (normalizedChoice === "a" && !hasMatch) {
        yield* display(
          "Cannot accept - no match available. Use [m] to enter manually.\n",
        );
      } else if (normalizedChoice === "m") {
        // Manual folder ID entry
        const folderId = yield* prompt("Enter folder ID: ");
        const trimmedFolderId = folderId.trim();

        if (trimmedFolderId.length > 0) {
          const folderName = yield* prompt(
            "Enter folder name (for reference): ",
          );

          const manualMapping: AgencyMapping = {
            folderId: trimmedFolderId,
            folderName: folderName.trim() || "Manual entry",
            confidence: 100,
            matchType: "manual",
            reasoning: "Manually entered folder ID",
            matchedAt: new Date().toISOString(),
            reviewedAt: new Date().toISOString(),
          };
          yield* store.set(mapping.agencyName, manualMapping);
          yield* display(
            `Saved manual mapping: "${mapping.agencyName}" -> "${trimmedFolderId}"\n`,
          );
        } else {
          yield* display("No folder ID entered, skipping...\n");
        }
      } else if (normalizedChoice === "s") {
        yield* display("Skipped for later review.\n");
      } else {
        yield* display(`Unknown option "${choice}", skipping...\n`);
      }
    }

    yield* display("\nReview session complete.");
  }).pipe(Effect.provide(reviewLayer));

// ============================================================================
// Status Command - Show current mapping status
// ============================================================================

const runStatus = () =>
  Effect.gen(function* () {
    const store = yield* AgencyMappingStoreService;
    const terminal = yield* Terminal.Terminal;

    const display = (message: string) => terminal.display(`${message}\n`);

    const mappings = yield* store.getAll();
    const entries = Object.entries(mappings);

    if (entries.length === 0) {
      yield* display("No mappings found. Run the main workflow first.");
      return;
    }

    const exact = entries.filter(([_, m]) => m.matchType === "exact").length;
    const auto = entries.filter(([_, m]) => m.matchType === "auto").length;
    const manual = entries.filter(([_, m]) => m.matchType === "manual").length;
    const pendingReview = entries.filter(([_, m]) => m.confidence < 90).length;

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("AGENCY MAPPING STATUS");
    yield* display(`${"=".repeat(60)}\n`);

    yield* display(`Total mappings: ${entries.length}`);
    yield* display(`  Exact matches: ${exact}`);
    yield* display(`  Auto matches: ${auto}`);
    yield* display(`  Manual matches: ${manual}`);
    yield* display(`  Pending review: ${pendingReview}`);

    if (pendingReview > 0) {
      yield* display(
        `\nRun 'review' command to review ${pendingReview} pending mapping(s).`,
      );
    }
  }).pipe(Effect.provide(reviewLayer));

// ============================================================================
// CLI Definition
// ============================================================================

// Define CLI options for run command
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
  Options.withDefault(true),
);

// Define the run subcommand
const runCommand = Command.make(
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

// Define the review subcommand
const reviewCommand = Command.make("review", {}, runReview).pipe(
  Command.withDescription(
    "Interactively review agency mappings with <90% confidence",
  ),
);

// Define the status subcommand
const statusCommand = Command.make("status", {}, runStatus).pipe(
  Command.withDescription("Show current agency mapping status"),
);

// Root command that groups subcommands
const rootCommand = Command.make("epic-migration").pipe(
  Command.withSubcommands([runCommand, reviewCommand, statusCommand]),
  Command.withDescription("Applied Epic Migration CLI"),
);

// Create the CLI runner
const cli = Command.run(rootCommand, {
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
