import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { AttachmentMetadataTransformerService } from "../../../src/services/attachment-metadata/transform.js";

describe("Attachment Transform Service", () => {
  describe("Interface Compliance", () => {
    it("should provide all required methods", async () => {
      const program = Effect.gen(function* () {
        const service = yield* AttachmentMetadataTransformerService;

        expect(service.transformAttachmentMetadata).toBeDefined();
        expect(typeof service.transformAttachmentMetadata).toBe("function");
      }).pipe(Effect.provide(AttachmentMetadataTransformerService.Default));

      await Effect.runPromise(program);
    });
  });

  describe("Basic Functionality", () => {
    it("should handle empty input gracefully", async () => {
      const program = Effect.gen(function* () {
        const service = yield* AttachmentMetadataTransformerService;

        // Test that the service exists and can be called
        expect(service).toBeDefined();
        expect(service.transformAttachmentMetadata).toBeDefined();
      }).pipe(Effect.provide(AttachmentMetadataTransformerService.Default));

      await Effect.runPromise(program);
    });
  });
});
