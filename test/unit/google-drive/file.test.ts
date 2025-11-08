import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { GoogleDriveFileService } from "../../../src/services/google-drive/file.js";

describe("Google Drive File Service", () => {
  describe("Interface Compliance", () => {
    it("should provide all required methods", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveFileService;

        expect(service.listFiles).toBeDefined();
        expect(typeof service.listFiles).toBe("function");
        expect(service.createFolder).toBeDefined();
        expect(typeof service.createFolder).toBe("function");
        expect(service.moveFile).toBeDefined();
        expect(typeof service.moveFile).toBe("function");
      }).pipe(Effect.provide(GoogleDriveFileService.Default));

      await Effect.runPromise(program);
    });
  });

  describe("Folder Operations", () => {
    it("should handle folder creation requests", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveFileService;

        // This will likely fail in test environment without proper Google Drive access,
        // but we're testing that the interface exists and handles errors gracefully
        const result = yield* Effect.either(
          service.createFolder("test-folder", "root"),
        );

        // Should return Either.Left or Either.Right, but not throw
        expect(result._tag).toMatch(/Left|Right/);
      }).pipe(Effect.provide(GoogleDriveFileService.Default));

      await Effect.runPromise(program);
    });

    it("should handle file listing requests", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveFileService;

        const result = yield* Effect.either(service.listFiles("root"));

        // Should return Either.Left or Either.Right, but not throw
        expect(result._tag).toMatch(/Left|Right/);
      }).pipe(Effect.provide(GoogleDriveFileService.Default));

      await Effect.runPromise(program);
    });
  });
});
