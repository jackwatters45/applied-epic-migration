import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { GoogleDriveAuthService } from "../../../src/services/google-drive/auth.js";

describe("Google Drive Auth Service", () => {
  describe("Interface Compliance", () => {
    it("should provide all required methods", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveAuthService;

        expect(service.getServiceAccountEmail).toBeDefined();
        expect(typeof service.getServiceAccountEmail).toBe("function");
      }).pipe(Effect.provide(GoogleDriveAuthService.Default));

      await Effect.runPromise(program);
    });

    it("should return service account email", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveAuthService;
        const email = yield* service.getServiceAccountEmail();

        expect(email).toBeDefined();
        expect(typeof email).toBe("string");
        if (email) {
          expect(email.length).toBeGreaterThan(0);
        }
      }).pipe(Effect.provide(GoogleDriveAuthService.Default));

      await Effect.runPromise(program);
    });
  });
});
