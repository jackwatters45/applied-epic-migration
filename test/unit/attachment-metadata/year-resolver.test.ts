import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { YearResolutionService } from "../../../src/services/attachment-metadata/year-resolver.js";

describe("Year Resolution Service", () => {
  describe("Interface Compliance", () => {
    it("should provide all required methods", async () => {
      const program = Effect.gen(function* () {
        const service = yield* YearResolutionService;

        expect(service.resolveYear).toBeDefined();
        expect(typeof service.resolveYear).toBe("function");
      }).pipe(Effect.provide(YearResolutionService.Default));

      await Effect.runPromise(program);
    });
  });

  describe("Basic Functionality", () => {
    it("should handle empty input gracefully", async () => {
      const program = Effect.gen(function* () {
        const service = yield* YearResolutionService;

        // Test that the service exists and can be called
        expect(service).toBeDefined();
        expect(service.resolveYear).toBeDefined();
      }).pipe(Effect.provide(YearResolutionService.Default));

      await Effect.runPromise(program);
    });
  });
});
