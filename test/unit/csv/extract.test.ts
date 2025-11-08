import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import {
  CsvExtractError,
  CsvExtractorService,
} from "../../../src/services/csv/extract.js";

// Test layer with mocked file system
const TestLive = Layer.mergeAll(CsvExtractorService.Default, NodeContext.layer);

describe("CSV Extractor Service", () => {
  const testCsvContent = `name,age,city,active
John Doe,30,New York,true
Jane Smith,25,Los Angeles,false
Bob Johnson,35,Chicago,true`;

  const testCsvWithEmptyLines = `name,age,city
Alice,28,Boston

Charlie,32,Seattle

Diana,29,Portland`;

  beforeEach(() => {
    // Setup test environment if needed
  });

  afterEach(() => {
    // Cleanup test environment if needed
  });

  describe("extract", () => {
    it("should extract CSV data successfully", async () => {
      const result = (await Effect.runPromise(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const extractor = yield* CsvExtractorService;

          // Write test CSV file
          yield* fs.makeDirectory("/tmp", { recursive: true });
          yield* fs.writeFileString("/tmp/test.csv", testCsvContent);

          // Extract CSV data
          const records = yield* extractor.extract("/tmp/test.csv");

          // Cleanup
          yield* fs.remove("/tmp/test.csv");

          return records as Array<Record<string, unknown>>;
        }).pipe(Effect.provide(TestLive)),
      )) as Array<Record<string, unknown>>;

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: "John Doe",
        age: "30",
        city: "New York",
        active: "true",
      });
      expect(result[1]).toEqual({
        name: "Jane Smith",
        age: "25",
        city: "Los Angeles",
        active: "false",
      });
      expect(result[2]).toEqual({
        name: "Bob Johnson",
        age: "35",
        city: "Chicago",
        active: "true",
      });
    });

    it("should handle CSV with empty lines", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const extractor = yield* CsvExtractorService;

          // Write test CSV file
          yield* fs.makeDirectory("/tmp", { recursive: true });
          yield* fs.writeFileString(
            "/tmp/test-empty.csv",
            testCsvWithEmptyLines,
          );

          // Extract CSV data
          const records = yield* extractor.extract("/tmp/test-empty.csv");

          // Cleanup
          yield* fs.remove("/tmp/test-empty.csv");

          return records;
        }).pipe(Effect.provide(TestLive)),
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: "Alice",
        age: "28",
        city: "Boston",
      });
      expect(result[1]).toEqual({
        name: "Charlie",
        age: "32",
        city: "Seattle",
      });
      expect(result[2]).toEqual({
        name: "Diana",
        age: "29",
        city: "Portland",
      });
    });

    it("should trim whitespace from values", async () => {
      const csvWithWhitespace = `name,age,city
  John Doe , 30 ,   New York
 Jane Smith,25 , Los Angeles`;

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const extractor = yield* CsvExtractorService;

          yield* fs.makeDirectory("/tmp", { recursive: true });
          yield* fs.writeFileString(
            "/tmp/test-whitespace.csv",
            csvWithWhitespace,
          );

          const records = yield* extractor.extract("/tmp/test-whitespace.csv");

          yield* fs.remove("/tmp/test-whitespace.csv");

          return records;
        }).pipe(Effect.provide(TestLive)),
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "John Doe",
        age: "30",
        city: "New York",
      });
      expect(result[1]).toEqual({
        name: "Jane Smith",
        age: "25",
        city: "Los Angeles",
      });
    });

    it("should handle empty CSV file", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const extractor = yield* CsvExtractorService;

          yield* fs.makeDirectory("/tmp", { recursive: true });
          yield* fs.writeFileString("/tmp/empty.csv", "");

          const records = yield* extractor.extract("/tmp/empty.csv");

          yield* fs.remove("/tmp/empty.csv");

          return records;
        }).pipe(Effect.provide(TestLive)),
      );

      expect(result).toHaveLength(0);
    });

    it("should handle CSV with only headers", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const extractor = yield* CsvExtractorService;

          yield* fs.makeDirectory("/tmp", { recursive: true });
          yield* fs.writeFileString("/tmp/headers-only.csv", "name,age,city");

          const records = yield* extractor.extract("/tmp/headers-only.csv");

          yield* fs.remove("/tmp/headers-only.csv");

          return records;
        }).pipe(Effect.provide(TestLive)),
      );

      expect(result).toHaveLength(0);
    });

    it("should return CsvExtractError for non-existent file", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const extractor = yield* CsvExtractorService;

          return yield* Effect.flip(
            extractor.extract("/non-existent/file.csv"),
          );
        }).pipe(Effect.provide(TestLive)),
      );

      expect(result).toBeInstanceOf(CsvExtractError);
      expect(result.type).toBe("FILE_READ_ERROR");
      expect(result.message).toContain("Failed to read CSV file");
    });

    it("should return CsvExtractError for malformed CSV", async () => {
      const malformedCsv = `name,age
John,30
Jane,25,extra,field`;

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const extractor = yield* CsvExtractorService;

          yield* fs.makeDirectory("/tmp", { recursive: true });
          yield* fs.writeFileString("/tmp/malformed.csv", malformedCsv);

          const error = yield* Effect.flip(
            extractor.extract("/tmp/malformed.csv"),
          );

          yield* fs.remove("/tmp/malformed.csv");

          return error;
        }).pipe(Effect.provide(TestLive)),
      );

      expect(result).toBeInstanceOf(CsvExtractError);
      expect(result.type).toBe("CSV_EXTRACT_ERROR");
    });

    it("should handle CSV with special characters", async () => {
      const csvWithSpecialChars = `name,description,notes
"John Doe","Developer, Senior","Works in IT department"
"Jane Smith","Manager, Sales","Email: jane@company.com"`;

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const extractor = yield* CsvExtractorService;

          yield* fs.makeDirectory("/tmp", { recursive: true });
          yield* fs.writeFileString(
            "/tmp/special-chars.csv",
            csvWithSpecialChars,
          );

          const records = yield* extractor.extract("/tmp/special-chars.csv");

          yield* fs.remove("/tmp/special-chars.csv");

          return records;
        }).pipe(Effect.provide(TestLive)),
      );

      expect(result).toHaveLength(2);
      expect(result[0] as Record<string, unknown>).toEqual({
        name: "John Doe",
        description: "Developer, Senior",
        notes: "Works in IT department",
      });
    });

    it("should handle CSV with numeric and boolean values as strings", async () => {
      const csvWithMixedTypes = `name,age,salary,active
John,30,50000.50,true
Jane,25,60000,false
Bob,35,0,yes`;

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const extractor = yield* CsvExtractorService;

          yield* fs.makeDirectory("/tmp", { recursive: true });
          yield* fs.writeFileString("/tmp/mixed-types.csv", csvWithMixedTypes);

          const records = yield* extractor.extract("/tmp/mixed-types.csv");

          yield* fs.remove("/tmp/mixed-types.csv");

          return records;
        }).pipe(Effect.provide(TestLive)),
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: "John",
        age: "30",
        salary: "50000.50",
        active: "true",
      });
      expect((result[1] as Record<string, unknown>).active).toBe("false");
      expect((result[2] as Record<string, unknown>).active).toBe("yes");
    });
  });
});
