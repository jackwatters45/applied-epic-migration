import { NodeContext } from "@effect/platform-node";
import { Effect, Layer, ManagedRuntime } from "effect";
import { AttachmentMetadataOrchestratorService } from "./services/attachment-metadata/orchestrator.js";
import { GoogleDriveReorganizationService } from "./services/google-drive/reorganization.js";
import { MappingOrchestratorService } from "./services/mapping/orchestrator.js";

// Main reorganization execution
const program = (_options: { dryRun?: boolean } = {}) =>
  Effect.gen(function* () {
    const metadataOrchestrator = yield* AttachmentMetadataOrchestratorService;
    const mappingOrchestrator = yield* MappingOrchestratorService;
    const _reorgService = yield* GoogleDriveReorganizationService;

    const organized = yield* metadataOrchestrator.run({ useCache: true });

    yield* mappingOrchestrator.runMapping(organized);

    // const result = yield* reorgService.processOrganizedAttachments(
    //   organizedAttachments,
    //   { dryRun: options.dryRun ?? false },
    // );

    // return result;
  }).pipe(
    Effect.provide(mainLayer),
    Effect.catchAll((error) => {
      console.error("Reorganization failed:", error.message);
      if ("status" in error && error.status) {
        console.error(`Status: ${error.status}`);
      }
      return Effect.exit(Effect.succeed(() => {}));
    }),
  );

// Create complete layer
const mainLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
  MappingOrchestratorService.Default,
  GoogleDriveReorganizationService.Default,
  NodeContext.layer,
);

const runtime = ManagedRuntime.make(mainLayer);

// Main execution function
export const run = (options: { dryRun?: boolean } = {}) =>
  runtime.runPromise(program(options));

// CLI execution for manual testing
if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run");

  run({ dryRun })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Reorganization failed:", error);
      process.exit(1);
    });
}
