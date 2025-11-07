import { Effect, Layer } from "effect";
import { AttachmentMetadataOrchestratorService } from "./services/attachment-metadata/orchestrator.js";

export const ApplicationLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
);

const program = Effect.gen(function* () {
  const attachmentMetadataOrchestrator =
    yield* AttachmentMetadataOrchestratorService;

  const _organized = yield* attachmentMetadataOrchestrator.run();

  // TODO: actually move the transformed data to a new file
  // make sure to handle duplicates etc
});

Effect.runPromise(program.pipe(Effect.provide(ApplicationLayer)));
