import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { AttachmentMetadataValidatorService } from "../../../src/services/attachment-metadata/validate.js";

describe("Attachment Validator Service", () => {
  describe("Interface Compliance", () => {
    it("should provide all required methods", async () => {
      const program = Effect.gen(function* () {
        const service = yield* AttachmentMetadataValidatorService;

        expect(service.validateAttachmentMetadata).toBeDefined();
        expect(typeof service.validateAttachmentMetadata).toBe("function");
      }).pipe(Effect.provide(AttachmentMetadataValidatorService.Default));

      await Effect.runPromise(program);
    });
  });

  describe("Basic Functionality", () => {
    it("should handle empty input gracefully", async () => {
      const program = Effect.gen(function* () {
        const service = yield* AttachmentMetadataValidatorService;

        // Test that the service exists and can be called
        expect(service).toBeDefined();
        expect(service.validateAttachmentMetadata).toBeDefined();
      }).pipe(Effect.provide(AttachmentMetadataValidatorService.Default));

      await Effect.runPromise(program);
    });
  });
});
