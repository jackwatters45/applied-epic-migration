import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { AttachmentMetadataOrchestratorService } from "./services/attachment-metadata/orchestrator.js";
import type { OrganizedAttachment } from "./services/google-drive/reorganization.js";
import { GoogleDriveReorganizationService } from "./services/google-drive/reorganization.js";

// Main reorganization execution
const executeReorganization = (options: { dryRun?: boolean } = {}) =>
  Effect.gen(function* () {
    const orchestrator = yield* AttachmentMetadataOrchestratorService;
    const organized = yield* orchestrator.run();

    // Convert to OrganizedAttachment format
    const organizedAttachments = new Map<
      string,
      readonly OrganizedAttachment[]
    >();
    for (const [key, attachments] of organized.entries()) {
      organizedAttachments.set(key, attachments);
    }

    const reorgService = yield* GoogleDriveReorganizationService;
    const result = yield* reorgService.processOrganizedAttachments(
      organizedAttachments,
      { dryRun: options.dryRun ?? false },
    );

    return result;
  });

// Create the complete layer
const ReorganizationLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
  GoogleDriveReorganizationService.Default,
  NodeContext.layer,
);

// Main execution function
export const runReorganization = (options: { dryRun?: boolean } = {}) =>
  Effect.runPromise(
    executeReorganization(options).pipe(
      Effect.provide(ReorganizationLayer),
      Effect.catchAll((error) => {
        console.error("❌ Reorganization failed:", error.message);
        if ("status" in error && error.status) {
          console.error(`Status: ${error.status}`);
        }
        return Effect.sync(() => {});
      }),
    ),
  );

// CLI execution for manual testing
if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run");

  runReorganization({ dryRun })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Reorganization failed:", error);
      process.exit(1);
    });
}
