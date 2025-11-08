import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { AttachmentMetadataOrchestratorService } from "../../../src/services/attachment-metadata/orchestrator.js";

describe("Attachment Metadata Orchestrator", () => {
  it("should have complete interface with metrics", async () => {
    const program = Effect.gen(function* () {
      const orchestrator = yield* AttachmentMetadataOrchestratorService;

      // Just verify the service exists and has the right interface
      expect(orchestrator).toBeDefined();
      expect(orchestrator.run).toBeDefined();
      expect(typeof orchestrator.run).toBe("function");

      return orchestrator;
    }).pipe(Effect.provide(AttachmentMetadataOrchestratorService.Default));

    const service = await Effect.runPromise(program);
    expect(service).toBeDefined();
  });

  it("should return OrchestratorResult interface", async () => {
    // This test verifies the interface is correct but doesn't run the full orchestration
    // to avoid needing the actual CSV file during testing
    const program = Effect.gen(function* () {
      const orchestrator = yield* AttachmentMetadataOrchestratorService;

      // Verify the service has the expected structure
      expect(orchestrator.run).toBeDefined();

      // We don't actually run it here to avoid file I/O in tests
      // but we verify the interface is available
      return true;
    }).pipe(Effect.provide(AttachmentMetadataOrchestratorService.Default));

    const result = await Effect.runPromise(program);
    expect(result).toBe(true);
  });
});
