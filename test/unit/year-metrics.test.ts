import { beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { AttachmentMetaData } from "../../src/services/attachment-metadata/validate.js";
import { DynamicYearMetricsService } from "../../src/services/attachment-metadata/year-metrics.js";
import { PRIORITY_CONFIGS } from "../../src/services/attachment-metadata/year-priority-config.js";
import { createMockAttachment } from "../utils/mock-data.js";

describe("Year Metrics Service", () => {
  let service: DynamicYearMetricsService;

  beforeEach(async () => {
    // Create a fresh service instance for each test
    const program = Effect.gen(function* () {
      const svc = yield* DynamicYearMetricsService;
      yield* svc.reset();
      return svc;
    }).pipe(Effect.provide(DynamicYearMetricsService.Default));
    service = await Effect.runPromise(program);
  });

  describe("recordPrioritySuccess", () => {
    it("should record successful year determination", async () => {
      await Effect.runPromise(service.recordPrioritySuccess(1));

      const count = await Effect.runPromise(service.getPriorityCount(1));
      expect(count).toBe(1);

      const rawMetrics = await Effect.runPromise(service.getRawMetrics());
      expect(rawMetrics.priorityMetrics).toEqual({ 1: 1 });
      expect(rawMetrics.successfulDeterminations).toBe(1);
    });

    it("should increment count for existing priority", async () => {
      await Effect.runPromise(service.recordPrioritySuccess(1));
      await Effect.runPromise(service.recordPrioritySuccess(1));

      const count = await Effect.runPromise(service.getPriorityCount(1));
      expect(count).toBe(2);

      const rawMetrics = await Effect.runPromise(service.getRawMetrics());
      expect(rawMetrics.priorityMetrics).toEqual({ 1: 2 });
      expect(rawMetrics.successfulDeterminations).toBe(2);
    });

    it("should record multiple priorities separately", async () => {
      await Effect.runPromise(service.recordPrioritySuccess(1));
      await Effect.runPromise(service.recordPrioritySuccess(2));

      const count1 = await Effect.runPromise(service.getPriorityCount(1));
      const count2 = await Effect.runPromise(service.getPriorityCount(2));

      expect(count1).toBe(1);
      expect(count2).toBe(1);

      const allMetrics = await Effect.runPromise(
        service.getAllPriorityMetrics(),
      );
      expect(allMetrics).toEqual({ 1: 1, 2: 1 });
    });
  });

  describe("recordFailure", () => {
    it("should record failed year determination", async () => {
      const attachment = createMockAttachment();
      await Effect.runPromise(service.recordFailure(attachment));

      const rawMetrics = await Effect.runPromise(service.getRawMetrics());
      expect(rawMetrics.failures).toBe(1);
      expect(rawMetrics.failureSamples).toHaveLength(1);
      expect(rawMetrics.failureSamples[0]).toEqual(attachment);
      expect(rawMetrics.failureBreakdown).toHaveProperty(
        attachment.raw.lookupCode,
      );
    });

    it("should increment count for existing failure reason", async () => {
      const attachment = createMockAttachment();
      await Effect.runPromise(service.recordFailure(attachment));
      await Effect.runPromise(service.recordFailure(attachment));

      const rawMetrics = await Effect.runPromise(service.getRawMetrics());
      expect(rawMetrics.failures).toBe(2);
      expect(rawMetrics.failureSamples).toHaveLength(2);
      expect(rawMetrics.failureBreakdown[attachment.raw.lookupCode].count).toBe(
        2,
      );
    });

    it("should limit failure samples to 20", async () => {
      const attachment = createMockAttachment();

      // Record 25 failures
      for (let i = 0; i < 25; i++) {
        await Effect.runPromise(service.recordFailure(attachment));
      }

      const rawMetrics = await Effect.runPromise(service.getRawMetrics());
      expect(rawMetrics.failures).toBe(25);
      expect(rawMetrics.failureSamples).toHaveLength(20); // Should be limited to 20
    });
  });

  describe("incrementTotal", () => {
    it("should increment total records", async () => {
      await Effect.runPromise(service.incrementTotal());
      await Effect.runPromise(service.incrementTotal());

      const rawMetrics = await Effect.runPromise(service.getRawMetrics());
      expect(rawMetrics.totalRecords).toBe(2);
    });
  });

  describe("getSuccessRate", () => {
    it("should calculate success rate correctly", async () => {
      // Add some records
      await Effect.runPromise(service.incrementTotal());
      await Effect.runPromise(service.incrementTotal());
      await Effect.runPromise(service.incrementTotal());

      // Add some successes
      await Effect.runPromise(service.recordPrioritySuccess(1));
      await Effect.runPromise(service.recordPrioritySuccess(2));

      const successRate = await Effect.runPromise(service.getSuccessRate());
      expect(successRate).toBe(66.66666666666666); // 2/3 * 100
    });

    it("should return 0 for no records", async () => {
      const successRate = await Effect.runPromise(service.getSuccessRate());
      expect(successRate).toBe(0);
    });
  });

  describe("getDetailedReport", () => {
    it("should generate complete metrics summary", async () => {
      const attachment = createMockAttachment();

      // Record some test data
      await Effect.runPromise(service.incrementTotal());
      await Effect.runPromise(service.incrementTotal());
      await Effect.runPromise(service.incrementTotal());
      await Effect.runPromise(service.incrementTotal());

      await Effect.runPromise(service.recordPrioritySuccess(1));
      await Effect.runPromise(service.recordPrioritySuccess(2));
      await Effect.runPromise(service.recordFailure(attachment));

      const result = await Effect.runPromise(
        service.getDetailedReport(PRIORITY_CONFIGS),
      );

      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("breakdown");
      expect(result).toHaveProperty("failureBreakdown");
      expect(result).toHaveProperty("failureSamples");

      // Check summary
      expect(result.summary.totalRecords).toBe(4);
      expect(result.summary.successfulDeterminations).toBe(2);
      expect(result.summary.failures).toBe(1);
      expect(result.summary.successRate).toBe("50.00%");

      // Check breakdown
      expect(Object.keys(result.breakdown)).toHaveLength(
        PRIORITY_CONFIGS.length,
      );
      expect(result.breakdown.priority1).toEqual({
        count: 1,
        percentage: "25.00%",
        description: PRIORITY_CONFIGS[0].description,
      });

      // Check failure breakdown
      expect(Object.keys(result.failureBreakdown)).toHaveLength(1);
      expect(result.failureBreakdown[attachment.raw.lookupCode]).toEqual({
        count: 1,
        nameOf: attachment.raw.nameOf || "Unknown",
        percentage: "25.00%",
      });

      // Check failure samples
      expect(result.failureSamples).toHaveLength(1);
      expect(result.failureSamples[0]).toEqual(attachment);
    });

    it("should handle empty metrics gracefully", async () => {
      const result = await Effect.runPromise(
        service.getDetailedReport(PRIORITY_CONFIGS),
      );

      expect(result.summary.totalRecords).toBe(0);
      expect(result.summary.successfulDeterminations).toBe(0);
      expect(result.summary.fallbackToAttachedDate).toBe(0);
      expect(result.summary.failures).toBe(0);
      expect(result.summary.successRate).toBe("0.00%");
      expect(Object.keys(result.breakdown)).toHaveLength(
        PRIORITY_CONFIGS.length,
      );
      expect(Object.keys(result.failureBreakdown)).toHaveLength(0);
      expect(result.failureSamples).toHaveLength(0);
    });

    it("should calculate percentages correctly", async () => {
      // Record 10 successes with priority 1
      for (let i = 0; i < 10; i++) {
        await Effect.runPromise(service.incrementTotal());
        await Effect.runPromise(service.recordPrioritySuccess(1));
      }

      const result = await Effect.runPromise(
        service.getDetailedReport(PRIORITY_CONFIGS),
      );

      expect(result.summary.totalRecords).toBe(10);
      expect(result.summary.successfulDeterminations).toBe(10);
      expect(result.summary.successRate).toBe("100.00%");
      expect(result.breakdown.priority1.percentage).toBe("100.00%");
    });

    it("should limit failure breakdown to top 20", async () => {
      // Create many different failure types
      for (let i = 0; i < 25; i++) {
        const baseAttachment = createMockAttachment();
        // Create a new attachment with different lookup code
        const newRaw = new AttachmentMetaData({
          ...baseAttachment.raw,
          lookupCode: `CODE${i}`,
        });
        const attachment = {
          ...baseAttachment,
          raw: newRaw,
        };
        await Effect.runPromise(service.incrementTotal());
        await Effect.runPromise(service.recordFailure(attachment));
      }

      const result = await Effect.runPromise(
        service.getDetailedReport(PRIORITY_CONFIGS),
      );

      expect(Object.keys(result.failureBreakdown)).toHaveLength(20);
    });
  });

  describe("reset", () => {
    it("should reset all metrics", async () => {
      // Add some data
      await Effect.runPromise(service.incrementTotal());
      await Effect.runPromise(service.recordPrioritySuccess(1));
      await Effect.runPromise(service.recordFailure(createMockAttachment()));

      // Reset
      await Effect.runPromise(service.reset());

      // Check everything is reset
      const rawMetrics = await Effect.runPromise(service.getRawMetrics());
      expect(rawMetrics.totalRecords).toBe(0);
      expect(rawMetrics.successfulDeterminations).toBe(0);
      expect(rawMetrics.fallbackToAttachedDate).toBe(0);
      expect(rawMetrics.failures).toBe(0);
      expect(Object.keys(rawMetrics.priorityMetrics)).toHaveLength(0);
      expect(rawMetrics.failureSamples).toHaveLength(0);
      expect(Object.keys(rawMetrics.failureBreakdown)).toHaveLength(0);
    });
  });
});
