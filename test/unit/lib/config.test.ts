import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { ConfigService } from "../../../src/lib/config.js";

describe("Lib Config Tests", () => {
  describe("ConfigService", () => {
    it("should provide default configuration", async () => {
      const config = await Effect.runPromise(
        Effect.gen(function* () {
          const configService = yield* ConfigService;
          return configService;
        }).pipe(Effect.provide(ConfigService.Default)),
      );

      expect(config).toHaveProperty("googleDrive");
      expect(config.googleDrive).toHaveProperty("serviceAccountKeyPath");
      expect(config.googleDrive).toHaveProperty("scopes");

      expect(config.googleDrive.serviceAccountKeyPath).toBe(
        "./.private_key.json",
      );
      expect(config.googleDrive.scopes).toEqual([
        "https://www.googleapis.com/auth/drive.metadata.readonly",
        "https://www.googleapis.com/auth/drive.file",
      ]);
    });

    it("should have correct structure", async () => {
      const config = await Effect.runPromise(
        Effect.gen(function* () {
          const configService = yield* ConfigService;
          return configService;
        }).pipe(Effect.provide(ConfigService.Default)),
      );

      expect(typeof config.googleDrive.serviceAccountKeyPath).toBe("string");
      expect(Array.isArray(config.googleDrive.scopes)).toBe(true);
      expect(
        config.googleDrive.scopes.every((scope) => typeof scope === "string"),
      ).toBe(true);
    });
  });
});
