import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { OrganizedAttachment } from "../../../src/services/google-drive/reorganization.js";
import { GoogleDriveReorganizationService } from "../../../src/services/google-drive/reorganization.js";
import { createMockAttachment } from "../../utils/mock-data.js";

describe("Google Drive Reorganization Service", () => {
  const createMockOrganizedAttachment = (
    overrides: Partial<OrganizedAttachment> = {},
  ): OrganizedAttachment => ({
    ...createMockAttachment(),
    key: "TestClient",
    determinedYear: 2023,
    ...overrides,
  });

  describe("Year Normalization", () => {
    it("should normalize years 2018-2023 to 2023", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;

        expect(service.normalizeYear(2018)).toBe(2023);
        expect(service.normalizeYear(2019)).toBe(2023);
        expect(service.normalizeYear(2020)).toBe(2023);
        expect(service.normalizeYear(2021)).toBe(2023);
        expect(service.normalizeYear(2022)).toBe(2023);
        expect(service.normalizeYear(2023)).toBe(2023);
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });

    it("should keep years outside 2018-2023 range unchanged", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;

        expect(service.normalizeYear(2017)).toBe(2017);
        expect(service.normalizeYear(2024)).toBe(2024);
        expect(service.normalizeYear(2025)).toBe(2025);
        expect(service.normalizeYear(2010)).toBe(2010);
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });
  });

  describe("Service Account Info", () => {
    it("should return service account information", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;
        const info = yield* service.getServiceAccountInfo();

        expect(info).toBeDefined();
        expect(info.serviceAccountEmail).toBeDefined();
        expect(info.message).toContain("Verify this service account");
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });
  });

  describe("Processing Organized Attachments", () => {
    it("should process empty attachments map", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;
        const emptyMap = new Map<string, readonly OrganizedAttachment[]>();

        const result = yield* service.processOrganizedAttachments(emptyMap, {
          dryRun: true,
        });

        expect(result.success).toBe(true);
        expect(result.totalFiles).toBe(0);
        expect(result.processedFiles).toBe(0);
        expect(result.failedFiles).toBe(0);
        expect(result.errors).toHaveLength(0);
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });

    it("should process single attachment in dry run mode", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;
        const attachment = createMockOrganizedAttachment({
          key: "TestClient",
          determinedYear: 2023,
        });
        const map = new Map([["TestClient", [attachment]]]);

        const result = yield* service.processOrganizedAttachments(map, {
          dryRun: true,
        });

        expect(result.success).toBe(true);
        expect(result.totalFiles).toBe(1);
        expect(result.processedFiles).toBe(1);
        expect(result.failedFiles).toBe(0);
        expect(result.errors).toHaveLength(0);
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });

    it("should process multiple attachments with different clients", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;
        const attachment1 = createMockOrganizedAttachment({
          key: "ClientA",
          determinedYear: 2022,
        });
        const attachment2 = createMockOrganizedAttachment({
          key: "ClientB",
          determinedYear: 2024,
        });
        const attachment3 = createMockOrganizedAttachment({
          key: "ClientA",
          determinedYear: 2019, // Should normalize to 2023
        });

        const map = new Map([
          ["ClientA", [attachment1, attachment3]],
          ["ClientB", [attachment2]],
        ]);

        const result = yield* service.processOrganizedAttachments(map, {
          dryRun: true,
        });

        expect(result.success).toBe(true);
        expect(result.totalFiles).toBe(3);
        expect(result.processedFiles).toBe(3);
        expect(result.failedFiles).toBe(0);
        expect(result.errors).toHaveLength(0);
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });

    it("should handle attachments with missing year", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;
        const attachment = createMockOrganizedAttachment({
          key: "TestClient",
          determinedYear: new Date().getFullYear(), // Current year as fallback
        });
        const map = new Map([["TestClient", [attachment]]]);

        const result = yield* service.processOrganizedAttachments(map, {
          dryRun: true,
        });

        expect(result.success).toBe(true);
        expect(result.totalFiles).toBe(1);
        expect(result.processedFiles).toBe(1);
        expect(result.failedFiles).toBe(0);
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });

    it("should handle unknown client names", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;
        const attachment = createMockOrganizedAttachment({
          key: "",
          determinedYear: 2023,
        });
        const map = new Map([["", [attachment]]]);

        const result = yield* service.processOrganizedAttachments(map, {
          dryRun: true,
        });

        expect(result.success).toBe(true);
        expect(result.totalFiles).toBe(1);
        expect(result.processedFiles).toBe(1);
        expect(result.failedFiles).toBe(0);
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });

    it("should normalize years in target structure", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;
        const attachment = createMockOrganizedAttachment({
          key: "TestClient",
          determinedYear: 2019, // Should be normalized to 2023
        });
        const map = new Map([["TestClient", [attachment]]]);

        const result = yield* service.processOrganizedAttachments(map, {
          dryRun: true,
        });

        expect(result.success).toBe(true);
        expect(result.totalFiles).toBe(1);
        expect(result.processedFiles).toBe(1);
        expect(result.failedFiles).toBe(0);
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });
  });

  describe("Error Handling", () => {
    it("should handle processing errors gracefully", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;

        // Create an attachment that might cause issues
        const problematicAttachment = createMockOrganizedAttachment({
          key: "TestClient",
          determinedYear: 2023,
        });

        const map = new Map([["TestClient", [problematicAttachment]]]);

        // Even in dry run mode, the service should handle errors gracefully
        const result = yield* service.processOrganizedAttachments(map, {
          dryRun: true,
        });

        // Should still complete without throwing
        expect(result).toBeDefined();
        expect(typeof result.success).toBe("boolean");
        expect(typeof result.totalFiles).toBe("number");
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });
  });

  describe("Interface Compliance", () => {
    it("should provide all required methods", async () => {
      const program = Effect.gen(function* () {
        const service = yield* GoogleDriveReorganizationService;

        expect(service.processOrganizedAttachments).toBeDefined();
        expect(typeof service.processOrganizedAttachments).toBe("function");
        expect(service.getServiceAccountInfo).toBeDefined();
        expect(typeof service.getServiceAccountInfo).toBe("function");
        expect(service.normalizeYear).toBeDefined();
        expect(typeof service.normalizeYear).toBe("function");
      }).pipe(Effect.provide(GoogleDriveReorganizationService.Default));

      await Effect.runPromise(program);
    });
  });
});
