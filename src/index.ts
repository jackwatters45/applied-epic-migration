import * as readline from "node:readline";
import { Command, Options } from "@effect/cli";
import { Terminal } from "@effect/platform";
import { NodeContext, NodeRuntime, NodeTerminal } from "@effect/platform-node";
import { ConfigProvider, Effect, Layer } from "effect";
import { CacheMode } from "./lib/type.js";
import { AttachmentMetadataOrchestratorService } from "./services/attachment-metadata/orchestrator.js";
import { AttachmentMoverService } from "./services/attachment-pipeline/file-mover.js";
import { AttachmentRenamerService } from "./services/attachment-pipeline/file-renamer.js";
import { AttachmentHierarchyService } from "./services/attachment-pipeline/hierarchy-builder.js";
import { AttachmentOrganizerService } from "./services/attachment-pipeline/orchestrator.js";
import { ZipAnalyzerService } from "./services/attachment-pipeline/zip-analyzer.js";
import { ZipExtractorService } from "./services/attachment-pipeline/zip-extractor.js";
import { GoogleDriveFileService } from "./services/google-drive/file.js";
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
  skippedAt?: string;
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

    const skippedCount = pending.filter((m) => m.skippedAt).length;
    const unskippedCount = pending.length - skippedCount;
    if (skippedCount > 0) {
      yield* display(
        `(${unskippedCount} new, ${skippedCount} previously skipped)\n`,
      );
    }

    for (const mapping of pending as PendingMapping[]) {
      const hasMatch = mapping.folderId !== "";
      const wasSkipped = !!mapping.skippedAt;

      yield* display("-".repeat(60));
      if (wasSkipped) {
        yield* display("[PREVIOUSLY SKIPPED]");
      }
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
      yield* display("  [d] Delete (test folder, should not be added)");
      yield* display("  [c] Create (no matching agency, needs to be created)");
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
        // Mark as skipped with timestamp
        const skippedMapping: AgencyMapping = {
          folderId: mapping.folderId,
          folderName: mapping.folderName,
          confidence: mapping.confidence,
          matchType: mapping.matchType as "exact" | "auto" | "manual",
          reasoning: mapping.reasoning,
          matchedAt: mapping.matchedAt,
          skippedAt: new Date().toISOString(),
        };
        yield* store.set(mapping.agencyName, skippedMapping);
        yield* display("Skipped - will appear at end of next review.\n");
      } else if (normalizedChoice === "d") {
        // Mark for deletion - test folder that should not be added
        const deleteMapping: AgencyMapping = {
          folderId: "",
          folderName: "",
          confidence: 100,
          matchType: "delete",
          reasoning:
            "Marked for deletion - test folder that should not be added to shared drive",
          matchedAt: new Date().toISOString(),
          reviewedAt: new Date().toISOString(),
        };
        yield* store.set(mapping.agencyName, deleteMapping);
        yield* display(
          `Marked for deletion: "${mapping.agencyName}" (test folder)\n`,
        );
      } else if (normalizedChoice === "c") {
        // Mark for creation - no matching agency in shared drive
        const createMapping: AgencyMapping = {
          folderId: "",
          folderName: "",
          confidence: 100,
          matchType: "create",
          reasoning:
            "Marked for creation - no matching agency folder exists in shared drive",
          matchedAt: new Date().toISOString(),
          reviewedAt: new Date().toISOString(),
        };
        yield* store.set(mapping.agencyName, createMapping);
        yield* display(
          `Marked for creation: "${mapping.agencyName}" (new folder needed)\n`,
        );
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
// Move Command - Move attachments to mapped folders with year organization
// ============================================================================

const moveLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
  AttachmentMoverService.Default,
  NodeContext.layer,
  NodeTerminal.layer,
);

const runMove = (options: {
  dryRun: boolean;
  limitAgencies: number | undefined;
  limitFiles: number | undefined;
}) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    const metadataOrchestrator = yield* AttachmentMetadataOrchestratorService;
    const mover = yield* AttachmentMoverService;

    const display = (message: string) => terminal.display(`${message}\n`);

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("ATTACHMENT MOVER");
    yield* display(`${"=".repeat(60)}\n`);

    if (options.dryRun) {
      yield* display("DRY RUN MODE - No files will be moved\n");
    }

    // Step 1: Get organized attachments with years resolved
    yield* display("Loading attachment metadata...");
    const organized = yield* metadataOrchestrator.run({ useCache: true });

    // Step 2: Move attachments to mapped folders (organized by year)
    yield* display("Moving attachments to mapped folders...\n");
    const result = yield* mover.moveAttachmentsToMappedFolders(organized, {
      dryRun: options.dryRun,
      ...(options.limitAgencies !== undefined && {
        limitAgencies: options.limitAgencies,
      }),
      ...(options.limitFiles !== undefined && {
        limitFilesPerAgency: options.limitFiles,
      }),
    });

    // Display summary
    yield* display(`\n${"=".repeat(60)}`);
    yield* display("MOVE COMPLETE");
    yield* display(`${"=".repeat(60)}`);
    yield* display(`Success: ${result.success}`);
    yield* display(`Total agencies: ${result.totalAgencies}`);
    yield* display(`Processed: ${result.processedAgencies}`);
    yield* display(`Skipped: ${result.skippedAgencies}`);
    yield* display(`Total files: ${result.totalFiles}`);
    yield* display(`Moved: ${result.movedFiles}`);
    yield* display(`Failed: ${result.failedFiles}`);
    yield* display(`Rollback session: ${result.rollbackSessionId}`);

    if (result.errors.length > 0) {
      yield* display(`\nErrors (${result.errors.length}):`);
      for (const error of result.errors.slice(0, 10)) {
        yield* display(`  - ${error}`);
      }
      if (result.errors.length > 10) {
        yield* display(`  ... and ${result.errors.length - 10} more`);
      }
    }
  }).pipe(Effect.provide(moveLayer));

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

// Define CLI options for move command
const limitAgenciesOption = Options.integer("limit-agencies").pipe(
  Options.withAlias("a"),
  Options.withDescription("Limit to N agencies (for testing)"),
  Options.optional,
);

const limitFilesOption = Options.integer("limit-files").pipe(
  Options.withAlias("f"),
  Options.withDescription("Limit to N files per agency (for testing)"),
  Options.optional,
);

// Define the move subcommand
const moveCommand = Command.make(
  "move",
  {
    dryRun: dryRunOption,
    limitAgencies: limitAgenciesOption,
    limitFiles: limitFilesOption,
  },
  (options) =>
    runMove({
      dryRun: options.dryRun,
      limitAgencies:
        options.limitAgencies._tag === "Some"
          ? options.limitAgencies.value
          : undefined,
      limitFiles:
        options.limitFiles._tag === "Some"
          ? options.limitFiles.value
          : undefined,
    }),
).pipe(
  Command.withDescription(
    "Move attachments to mapped agency folders, organized by year",
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

// ============================================================================
// Analyze Zips Command - Analyze zip file contents
// ============================================================================

const analyzeZipsLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
  ZipAnalyzerService.Default,
  NodeContext.layer,
  NodeTerminal.layer,
);

const limitZipsOption = Options.integer("limit").pipe(
  Options.withAlias("n"),
  Options.withDescription("Limit to N zip files (for testing)"),
  Options.optional,
);

const runAnalyzeZips = (options: { limit: number | undefined }) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    const metadataOrchestrator = yield* AttachmentMetadataOrchestratorService;
    const analyzer = yield* ZipAnalyzerService;

    const display = (message: string) => terminal.display(`${message}\n`);

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("ZIP FILE ANALYZER");
    yield* display(`${"=".repeat(60)}\n`);

    // Step 1: Get organized attachments
    yield* display("Loading attachment metadata...");
    const organized = yield* metadataOrchestrator.run({ useCache: true });

    // Step 2: Analyze zip files
    yield* display("Analyzing zip files...\n");
    const report = yield* analyzer.analyzeZips(organized, {
      limit: options.limit,
    });

    // Display summary
    yield* display(`\nAnalysis complete. Found ${report.totalZips} zip files.`);
    yield* display("Report saved to: logs/zip-analysis-report.json");
  }).pipe(Effect.provide(analyzeZipsLayer));

const analyzeZipsCommand = Command.make(
  "analyze-zips",
  { limit: limitZipsOption },
  (options) =>
    runAnalyzeZips({
      limit: options.limit._tag === "Some" ? options.limit.value : undefined,
    }),
).pipe(
  Command.withDescription(
    "Analyze zip file contents to understand their structure",
  ),
);

// ============================================================================
// Extract Zips Command - Extract all zip files
// ============================================================================

const extractZipsLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
  ZipExtractorService.Default,
  NodeContext.layer,
  NodeTerminal.layer,
);

const runExtractZips = (options: {
  limit: number | undefined;
  dryRun: boolean;
}) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    const metadataOrchestrator = yield* AttachmentMetadataOrchestratorService;
    const extractor = yield* ZipExtractorService;

    const display = (message: string) => terminal.display(`${message}\n`);

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("ZIP FILE EXTRACTOR");
    yield* display(`${"=".repeat(60)}\n`);

    if (options.dryRun) {
      yield* display("DRY RUN MODE - No files will be uploaded or archived\n");
    }

    // Step 1: Get organized attachments
    yield* display("Loading attachment metadata...");
    const organized = yield* metadataOrchestrator.run({ useCache: true });

    // Step 2: Extract zip files
    yield* display("Extracting zip files...\n");
    const report = yield* extractor.extractAllZips(organized, {
      limit: options.limit,
      dryRun: options.dryRun,
    });

    // Display summary
    yield* display("\nExtraction complete.");
    yield* display(`  Zips processed: ${report.totalZips}`);
    yield* display(`  Files extracted: ${report.totalFilesExtracted}`);
    yield* display(`  Files uploaded: ${report.totalFilesUploaded}`);
    yield* display("Report saved to: logs/zip-extraction-report.json");
  }).pipe(Effect.provide(extractZipsLayer));

const extractZipsCommand = Command.make(
  "extract-zips",
  {
    limit: limitZipsOption,
    dryRun: dryRunOption,
  },
  (options) =>
    runExtractZips({
      limit: options.limit._tag === "Some" ? options.limit.value : undefined,
      dryRun: options.dryRun,
    }),
).pipe(
  Command.withDescription(
    "Extract all zip files and upload contents to Google Drive",
  ),
);

// ============================================================================
// Rename Attachments Command
// ============================================================================

const renameAttachmentsLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
  AttachmentRenamerService.Default,
  NodeContext.layer,
  NodeTerminal.layer,
);

const limitRenameOption = Options.integer("limit").pipe(
  Options.withAlias("n"),
  Options.withDescription("Limit to N files (for testing)"),
  Options.optional,
);

const runRenameAttachments = (options: {
  limit: number | undefined;
  dryRun: boolean;
}) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    const metadataOrchestrator = yield* AttachmentMetadataOrchestratorService;
    const renamer = yield* AttachmentRenamerService;

    const display = (message: string) => terminal.display(`${message}\n`);

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("ATTACHMENT RENAMER");
    yield* display(`${"=".repeat(60)}\n`);

    if (options.dryRun) {
      yield* display("DRY RUN MODE - No files will be renamed\n");
    }

    // Step 1: Get organized attachments
    yield* display("Loading attachment metadata...");
    const organized = yield* metadataOrchestrator.run({ useCache: true });

    // Step 2: Rename attachments
    yield* display("Renaming attachments...\n");
    const report = yield* renamer.renameAll(organized, {
      limit: options.limit,
      dryRun: options.dryRun,
    });

    // Display summary
    yield* display("\nRename complete.");
    yield* display(`  Total: ${report.totalAttachments}`);
    yield* display(`  Renamed: ${report.renamed}`);
    yield* display(`  Failed: ${report.failed}`);
    yield* display("Report saved to: logs/rename-report.json");
  }).pipe(Effect.provide(renameAttachmentsLayer));

const renameAttachmentsCommand = Command.make(
  "rename-attachments",
  {
    limit: limitRenameOption,
    dryRun: dryRunOption,
  },
  (options) =>
    runRenameAttachments({
      limit: options.limit._tag === "Some" ? options.limit.value : undefined,
      dryRun: options.dryRun,
    }),
).pipe(
  Command.withDescription(
    "Rename UUID-named attachments to human-readable names",
  ),
);

// ============================================================================
// Build Hierarchy Command
// ============================================================================

const buildHierarchyLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
  AttachmentHierarchyService.Default,
  NodeContext.layer,
  NodeTerminal.layer,
);

const limitHierarchyOption = Options.integer("limit").pipe(
  Options.withAlias("n"),
  Options.withDescription("Limit to N agencies (for testing)"),
  Options.optional,
);

const runBuildHierarchy = (options: {
  limit: number | undefined;
  dryRun: boolean;
}) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    const metadataOrchestrator = yield* AttachmentMetadataOrchestratorService;
    const hierarchyBuilder = yield* AttachmentHierarchyService;

    const display = (message: string) => terminal.display(`${message}\n`);

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("HIERARCHY BUILDER");
    yield* display(`${"=".repeat(60)}\n`);

    if (options.dryRun) {
      yield* display("DRY RUN MODE - No folders will be created\n");
    }

    // Step 1: Get organized attachments
    yield* display("Loading attachment metadata...");
    const organized = yield* metadataOrchestrator.run({ useCache: true });

    // Step 2: Build hierarchy
    yield* display("Building Agency/Year hierarchy...\n");
    const result = yield* hierarchyBuilder.buildHierarchy(organized, {
      limit: options.limit,
      dryRun: options.dryRun,
    });

    // Display summary
    yield* display("\nHierarchy build complete.");
    yield* display(`  Agencies: ${result.totalAgencies}`);
    yield* display(`  Year folders: ${result.totalYearFolders}`);
    yield* display(
      `  Created: ${result.createdAgencyFolders} agencies, ${result.createdYearFolders} years`,
    );
    yield* display("Report saved to: logs/hierarchy-build-report.json");
  }).pipe(Effect.provide(buildHierarchyLayer));

const buildHierarchyCommand = Command.make(
  "build-hierarchy",
  {
    limit: limitHierarchyOption,
    dryRun: dryRunOption,
  },
  (options) =>
    runBuildHierarchy({
      limit: options.limit._tag === "Some" ? options.limit.value : undefined,
      dryRun: options.dryRun,
    }),
).pipe(
  Command.withDescription(
    "Build Agency/Year folder hierarchy in attachments drive",
  ),
);

// ============================================================================
// Organize Command - Full pipeline
// ============================================================================

const organizeLayer = Layer.mergeAll(
  AttachmentOrganizerService.Default,
  NodeContext.layer,
  NodeTerminal.layer,
);

const skipHierarchyOption = Options.boolean("skip-hierarchy").pipe(
  Options.withDescription("Skip building hierarchy step"),
  Options.withDefault(false),
);

const skipExtractOption = Options.boolean("skip-extract").pipe(
  Options.withDescription("Skip extracting zips step"),
  Options.withDefault(false),
);

const skipRenameOption = Options.boolean("skip-rename").pipe(
  Options.withDescription("Skip renaming files step"),
  Options.withDefault(false),
);

const limitOrganizeOption = Options.integer("limit").pipe(
  Options.withAlias("n"),
  Options.withDescription("Limit items per step (for testing)"),
  Options.optional,
);

const runOrganize = (options: {
  limit: number | undefined;
  dryRun: boolean;
  skipHierarchy: boolean;
  skipExtract: boolean;
  skipRename: boolean;
}) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    const organizer = yield* AttachmentOrganizerService;

    const display = (message: string) => terminal.display(`${message}\n`);

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("ATTACHMENT ORGANIZER");
    yield* display(`${"=".repeat(60)}\n`);

    const result = yield* organizer.organize({
      limit: options.limit,
      dryRun: options.dryRun,
      skip: {
        hierarchy: options.skipHierarchy,
        extractZips: options.skipExtract,
        rename: options.skipRename,
      },
    });

    yield* display(
      `\nPipeline ${result.success ? "completed successfully" : "failed"}`,
    );
  }).pipe(Effect.provide(organizeLayer));

const organizeCommand = Command.make(
  "organize",
  {
    limit: limitOrganizeOption,
    dryRun: dryRunOption,
    skipHierarchy: skipHierarchyOption,
    skipExtract: skipExtractOption,
    skipRename: skipRenameOption,
  },
  (options) =>
    runOrganize({
      limit: options.limit._tag === "Some" ? options.limit.value : undefined,
      dryRun: options.dryRun,
      skipHierarchy: options.skipHierarchy,
      skipExtract: options.skipExtract,
      skipRename: options.skipRename,
    }),
).pipe(
  Command.withDescription(
    "Run full organization pipeline: hierarchy -> extract -> rename",
  ),
);

// ============================================================================
// Move Folder Contents Command
// ============================================================================

const moveFolderContentsLayer = Layer.mergeAll(
  GoogleDriveFileService.Default,
  NodeContext.layer,
  NodeTerminal.layer,
);

const sourceFolderOption = Options.text("source").pipe(
  Options.withAlias("s"),
  Options.withDescription("Source folder ID to move contents from"),
  Options.optional,
);

const targetFolderOption = Options.text("target").pipe(
  Options.withAlias("t"),
  Options.withDescription("Target folder ID to move contents to"),
  Options.optional,
);

const deleteSourceOption = Options.boolean("delete-source").pipe(
  Options.withDescription("Delete the source folder after moving all contents"),
  Options.withDefault(false),
);

const runMoveFolderContents = (options: {
  source: string | undefined;
  target: string | undefined;
  dryRun: boolean;
  deleteSource: boolean;
}) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    const googleDrive = yield* GoogleDriveFileService;

    const display = (message: string) => terminal.display(`${message}\n`);

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("MOVE FOLDER CONTENTS");
    yield* display(`${"=".repeat(60)}\n`);

    // Interactive prompts if options not provided
    let source = options.source;
    let target = options.target;

    if (!source) {
      source = (yield* prompt("Enter source folder ID: ")).trim();
      if (!source) {
        yield* display("Source folder ID is required.");
        return;
      }
    }

    if (!target) {
      target = (yield* prompt("Enter target folder ID: ")).trim();
      if (!target) {
        yield* display("Target folder ID is required.");
        return;
      }
    }

    yield* display(`Source folder: ${source}`);
    yield* display(`Target folder: ${target}`);
    yield* display(`Dry run: ${options.dryRun}`);
    yield* display("");

    // List all files in source folder (no cache to ensure fresh data)
    yield* display("Listing files in source folder...");
    const files = yield* googleDrive.listFiles({
      parentId: source,
      cacheMode: CacheMode.NONE,
    });

    yield* display(`Found ${files.length} items to move\n`);

    if (files.length === 0) {
      yield* display("No files to move.");
      return;
    }

    let moved = 0;
    let failed = 0;

    if (options.dryRun) {
      // Dry run - just list what would be moved
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        yield* display(`[${i + 1}/${files.length}] Would move: ${file.name}`);
        moved++;
      }
    } else {
      // Move files in parallel batches for speed
      const BATCH_SIZE = 20; // Number of concurrent moves
      const batches: Array<typeof files> = [];

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        batches.push(files.slice(i, i + BATCH_SIZE));
      }

      yield* display(
        `Moving in ${batches.length} batches of up to ${BATCH_SIZE} files...\n`,
      );

      let processed = 0;
      for (const batch of batches) {
        // Process batch in parallel
        const results = yield* Effect.all(
          batch.map((file) =>
            Effect.either(googleDrive.moveFile(file.id, target)).pipe(
              Effect.map((result) => ({ file, result })),
            ),
          ),
          { concurrency: BATCH_SIZE },
        );

        // Report results
        for (const { file, result } of results) {
          processed++;
          if (result._tag === "Right") {
            yield* display(
              `[${processed}/${files.length}] Moved: ${file.name}`,
            );
            moved++;
          } else {
            yield* display(
              `[${processed}/${files.length}] FAILED: ${file.name} - ${result.left}`,
            );
            failed++;
          }
        }
      }
    }

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("SUMMARY");
    yield* display(`${"=".repeat(60)}`);
    yield* display(`Total items: ${files.length}`);
    yield* display(`Moved: ${moved}`);
    yield* display(`Failed: ${failed}`);

    if (options.dryRun) {
      yield* display("\nThis was a DRY RUN - no files were actually moved.");
    }

    // Delete source folder if requested and all files were moved successfully
    if (options.deleteSource && failed === 0 && !options.dryRun) {
      yield* display("\nDeleting source folder...");
      const deleteResult = yield* Effect.either(googleDrive.deleteFile(source));
      if (deleteResult._tag === "Right") {
        yield* display("Source folder deleted successfully.");
      } else {
        yield* display(`Failed to delete source folder: ${deleteResult.left}`);
      }
    } else if (options.deleteSource && options.dryRun) {
      yield* display("\n[DRY RUN] Would delete source folder after move.");
    } else if (options.deleteSource && failed > 0) {
      yield* display(
        "\nSource folder NOT deleted because some files failed to move.",
      );
    }
  }).pipe(Effect.provide(moveFolderContentsLayer));

const moveFolderContentsCommand = Command.make(
  "move-folder-contents",
  {
    source: sourceFolderOption,
    target: targetFolderOption,
    dryRun: dryRunOption,
    deleteSource: deleteSourceOption,
  },
  (options) =>
    runMoveFolderContents({
      source: options.source._tag === "Some" ? options.source.value : undefined,
      target: options.target._tag === "Some" ? options.target.value : undefined,
      dryRun: options.dryRun,
      deleteSource: options.deleteSource,
    }),
).pipe(Command.withDescription("Move all contents from one folder to another"));

// ============================================================================
// Merge to Shared Drive Command
// ============================================================================

import { SharedDriveMergerService } from "./services/attachment-pipeline/shared-drive-merger.js";

const mergeToSharedDriveLayer = Layer.mergeAll(
  SharedDriveMergerService.Default,
  NodeContext.layer,
  NodeTerminal.layer,
);

const limitMergeAgenciesOption = Options.integer("limit-agencies").pipe(
  Options.withAlias("a"),
  Options.withDescription("Limit to N agencies (for testing)"),
  Options.optional,
);

const limitMergeFilesOption = Options.integer("limit-files").pipe(
  Options.withAlias("f"),
  Options.withDescription("Limit to N files per agency (for testing)"),
  Options.optional,
);

const runMergeToSharedDrive = (options: {
  dryRun: boolean;
  limitAgencies: number | undefined;
  limitFiles: number | undefined;
}) =>
  Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    const merger = yield* SharedDriveMergerService;

    const display = (message: string) => terminal.display(`${message}\n`);

    yield* display(`\n${"=".repeat(60)}`);
    yield* display("MERGE TO SHARED DRIVE");
    yield* display(`${"=".repeat(60)}\n`);

    if (options.dryRun) {
      yield* display("DRY RUN MODE - No files will be moved\n");
    }

    const report = yield* merger.mergeToSharedDrive({
      dryRun: options.dryRun,
      limitAgencies: options.limitAgencies,
      limitFilesPerAgency: options.limitFiles,
    });

    yield* display(
      `\nMerge ${report.success ? "completed successfully" : "completed with errors"}`,
    );
    yield* display(`  Agencies processed: ${report.processedAgencies}`);
    yield* display(`  Files moved: ${report.movedFiles}`);
    yield* display(`  Files failed: ${report.failedFiles}`);
  }).pipe(Effect.provide(mergeToSharedDriveLayer));

const mergeToSharedDriveCommand = Command.make(
  "merge-to-shared-drive",
  {
    dryRun: dryRunOption,
    limitAgencies: limitMergeAgenciesOption,
    limitFiles: limitMergeFilesOption,
  },
  (options) =>
    runMergeToSharedDrive({
      dryRun: options.dryRun,
      limitAgencies:
        options.limitAgencies._tag === "Some"
          ? options.limitAgencies.value
          : undefined,
      limitFiles:
        options.limitFiles._tag === "Some"
          ? options.limitFiles.value
          : undefined,
    }),
).pipe(
  Command.withDescription(
    "Merge organized attachments from attachments drive to shared drive",
  ),
);

// Root command that groups subcommands
const rootCommand = Command.make("epic-migration").pipe(
  Command.withSubcommands([
    runCommand,
    organizeCommand,
    moveCommand,
    analyzeZipsCommand,
    extractZipsCommand,
    buildHierarchyCommand,
    renameAttachmentsCommand,
    reviewCommand,
    statusCommand,
    moveFolderContentsCommand,
    mergeToSharedDriveCommand,
  ]),
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
