import { Effect, Layer } from "effect";
import { AttachmentMetadataOrchestratorService } from "./services/attachment-metadata/orchestrator.js";

export const ApplicationLayer = Layer.mergeAll(
  AttachmentMetadataOrchestratorService.Default,
);

const program = Effect.gen(function* () {
  const attachmentMetadataOrchestrator =
    yield* AttachmentMetadataOrchestratorService;

  // TODO: years
  const _organized = yield* attachmentMetadataOrchestrator.run();

  // merge duplicate years
  // TODO: actually move the transformed data to a new file
});

Effect.runPromise(program.pipe(Effect.provide(ApplicationLayer)));
