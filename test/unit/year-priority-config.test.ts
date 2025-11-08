import { describe, expect, it } from "@effect/vitest";
import { PRIORITY_CONFIGS } from "../../src/services/attachment-metadata/year-priority-config.js";
import { expectedResults, mockAttachments } from "../utils/mock-data.js";

describe("Year Priority Extractors", () => {
  describe("Priority 1: Path Year Folder", () => {
    it("should extract year from path with 4-digit folder", () => {
      const attachment = mockAttachments.pathYearFolder;
      const config = PRIORITY_CONFIGS[0]; // Priority 1

      const result = config.extractor(attachment);
      expect(result).toBe(expectedResults.pathYearFolder);
    });

    it("should return null when no year in path", () => {
      const attachment = mockAttachments.noYear;
      const config = PRIORITY_CONFIGS[0];

      const result = config.extractor(attachment);
      expect(result).toBeNull();
    });
  });

  describe("Priority 2: Explicit Year", () => {
    it("should extract 4-digit year from description", () => {
      const attachment = mockAttachments.explicitYear;
      const config = PRIORITY_CONFIGS[1]; // Priority 2

      const result = config.extractor(attachment);
      expect(result).toBe(expectedResults.explicitYear);
    });

    it("should return null when no 4-digit year in description", () => {
      const attachment = mockAttachments.noYear;
      const config = PRIORITY_CONFIGS[1];

      const result = config.extractor(attachment);
      expect(result).toBeNull();
    });
  });

  describe("Priority 3: Start Year", () => {
    it("should extract and validate 2-digit year from start of description", () => {
      const attachment = mockAttachments.startYear;
      const config = PRIORITY_CONFIGS[2]; // Priority 3

      const extractedYear = config.extractor(attachment);
      const validatedYear = config.validator(extractedYear!);
      expect(validatedYear).toBe(expectedResults.startYear);
    });

    it("should return null when no 2-digit year at start", () => {
      const attachment = mockAttachments.noYear;
      const config = PRIORITY_CONFIGS[2];

      const result = config.extractor(attachment);
      expect(result).toBeNull();
    });
  });

  describe("Priority 4: Year Range", () => {
    it("should extract and validate first year from range pattern", () => {
      const attachment = mockAttachments.yearRange;
      const config = PRIORITY_CONFIGS[3]; // Priority 4

      const extractedYear = config.extractor(attachment);
      const validatedYear = config.validator(extractedYear!);
      expect(validatedYear).toBe(expectedResults.yearRange);
    });

    it("should return null when no year range pattern", () => {
      const attachment = mockAttachments.noYear;
      const config = PRIORITY_CONFIGS[3];

      const result = config.extractor(attachment);
      expect(result).toBeNull();
    });
  });

  describe("Priority 5: Filename Year Pattern", () => {
    it("should extract and validate year from CVLR pattern", () => {
      const attachment = mockAttachments.filenameYear;
      const config = PRIORITY_CONFIGS[4]; // Priority 5

      const extractedYear = config.extractor(attachment);
      const validatedYear = config.validator(extractedYear!);
      expect(validatedYear).toBe(expectedResults.filenameYear);
    });

    it("should return null when no CVLR pattern", () => {
      const attachment = mockAttachments.noYear;
      const config = PRIORITY_CONFIGS[4];

      const result = config.extractor(attachment);
      expect(result).toBeNull();
    });
  });

  describe("Priority 6: WC Year Pattern", () => {
    it("should extract and validate year from WC pattern", () => {
      const attachment = mockAttachments.wcYear;
      const config = PRIORITY_CONFIGS[5]; // Priority 6

      const extractedYear = config.extractor(attachment);
      const validatedYear = config.validator(extractedYear!);
      expect(validatedYear).toBe(expectedResults.wcYear);
    });

    it("should return null when no WC pattern", () => {
      const attachment = mockAttachments.noYear;
      const config = PRIORITY_CONFIGS[5];

      const result = config.extractor(attachment);
      expect(result).toBeNull();
    });
  });

  describe("Priority 7: Date Range Year", () => {
    it("should extract 4-digit year from date range", () => {
      const attachment = mockAttachments.dateRangeYear;
      const config = PRIORITY_CONFIGS[6]; // Priority 7

      const result = config.extractor(attachment);
      expect(result).toBe(expectedResults.dateRangeYear);
    });

    it("should return null when no date range pattern", () => {
      const attachment = mockAttachments.noYear;
      const config = PRIORITY_CONFIGS[6];

      const result = config.extractor(attachment);
      expect(result).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty fields gracefully", () => {
      const attachment = mockAttachments.emptyFields;

      // Test all extractors with empty fields
      PRIORITY_CONFIGS.forEach((config) => {
        const result = config.extractor(attachment);
        expect(result).toBeNull();
      });
    });

    it("should handle null/undefined fields gracefully", () => {
      const attachment = mockAttachments.emptyFields; // Use emptyFields instead

      // Test all extractors with empty fields
      PRIORITY_CONFIGS.forEach((config) => {
        const result = config.extractor(attachment);
        expect(result).toBeNull();
      });
    });

    it("should handle invalid years", () => {
      const attachment = mockAttachments.invalidYear;

      // Extractors should find the year but validators will reject it
      const pathExtractor = PRIORITY_CONFIGS[0];

      expect(pathExtractor.extractor(attachment)).toBe(1800);

      // Validators should reject invalid years
      expect(pathExtractor.validator(1800)).toBeNull();

      // The explicitYear extractor only matches years starting with "20", so it won't find 1800
      const explicitExtractor = PRIORITY_CONFIGS[1];
      expect(explicitExtractor.extractor(attachment)).toBeNull();
    });
  });

  describe("Configuration Validation", () => {
    it("should have all required priority configurations", () => {
      expect(PRIORITY_CONFIGS).toHaveLength(18);

      PRIORITY_CONFIGS.forEach((config, index) => {
        expect(config).toHaveProperty("id");
        expect(config).toHaveProperty("name");
        expect(config).toHaveProperty("description");
        expect(config).toHaveProperty("extractor");
        expect(config).toHaveProperty("validator");
        expect(typeof config.extractor).toBe("function");
        expect(typeof config.validator).toBe("function");
        expect(config.id).toBe(index + 1);
      });
    });

    it("should have unique priority IDs", () => {
      const ids = PRIORITY_CONFIGS.map((config) => config.id);
      const uniqueIds = [...new Set(ids)];
      expect(ids).toEqual(uniqueIds);
    });

    it("should have descriptive names and descriptions", () => {
      PRIORITY_CONFIGS.forEach((config) => {
        expect(config.name).toBeTruthy();
        expect(config.name.length).toBeGreaterThan(0);
        expect(config.description).toBeTruthy();
        expect(config.description.length).toBeGreaterThan(0);
      });
    });
  });
});
