import { describe, expect, it } from "@effect/vitest";
import { Either, Schema } from "effect";
import {
  BooleanFromYN,
  OptionalDateFromString,
  OptionalNumberFromString,
  OptionalString,
} from "../../../src/lib/schema.js";

describe.skip("Lib Schema Tests", () => {
  describe("OptionalString", () => {
    it("should handle valid strings", () => {
      const schema = OptionalString();
      const result = Schema.decodeUnknownEither(schema)("test");

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBe("test");
      }
    });

    it("should convert empty strings to undefined", () => {
      const schema = OptionalString();
      const result = Schema.decodeUnknownEither(schema)("");

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBeUndefined();
      }
    });

    it("should handle undefined", () => {
      const schema = OptionalString();
      const result = Schema.decodeUnknownEither(schema)(undefined);

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBeUndefined();
      }
    });

    it("should encode correctly", () => {
      const schema = OptionalString();
      const encoded = Schema.encodeEither(schema)("test");

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right).toBe("test");
      }
    });

    it("should encode undefined as empty string", () => {
      const schema = OptionalString();
      const encoded = Schema.encodeEither(schema)(undefined);

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right).toBe("");
      }
    });
  });

  describe("OptionalNumberFromString", () => {
    it("should parse valid numbers", () => {
      const result = Schema.decodeUnknownEither(OptionalNumberFromString)(
        "123",
      );

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBe(123);
      }
    });

    it("should handle decimal numbers", () => {
      const result = Schema.decodeUnknownEither(OptionalNumberFromString)(
        "123.45",
      );

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBe(123.45);
      }
    });

    it("should convert empty strings to undefined", () => {
      const result = Schema.decodeUnknownEither(OptionalNumberFromString)("");

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBeUndefined();
      }
    });

    it("should handle undefined", () => {
      const result = Schema.decodeUnknownEither(OptionalNumberFromString)(
        undefined,
      );

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBeUndefined();
      }
    });

    it("should encode numbers correctly", () => {
      const encoded = Schema.encodeEither(OptionalNumberFromString)(123);

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right).toBe("123");
      }
    });

    it("should encode undefined as empty string", () => {
      const encoded = Schema.encodeEither(OptionalNumberFromString)(undefined);

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right).toBe("");
      }
    });
  });

  describe("OptionalDateFromString", () => {
    it("should handle Date objects", () => {
      const testDate = new Date("2023-01-15");
      const result = Schema.decodeUnknownEither(OptionalDateFromString)(
        testDate,
      );

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toEqual(testDate);
      }
    });

    it("should convert empty strings to undefined", () => {
      const result = Schema.decodeUnknownEither(OptionalDateFromString)("");

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBeUndefined();
      }
    });

    it("should handle undefined", () => {
      const result = Schema.decodeUnknownEither(OptionalDateFromString)(
        undefined,
      );

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBeUndefined();
      }
    });

    it("should encode Date objects correctly", () => {
      const testDate = new Date("2023-01-15");
      const encoded = Schema.encodeEither(OptionalDateFromString)(testDate);

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right).toEqual(testDate);
      }
    });

    it("should encode undefined as empty string", () => {
      const encoded = Schema.encodeEither(OptionalDateFromString)(undefined);

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right).toBe("");
      }
    });
  });

  describe("BooleanFromYN", () => {
    it("should convert 'Y' to true", () => {
      const result = Schema.decodeUnknownEither(BooleanFromYN)("Y");

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBe(true);
      }
    });

    it("should convert 'N' to false", () => {
      const result = Schema.decodeUnknownEither(BooleanFromYN)("N");

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toBe(false);
      }
    });

    it("should encode true as 'Y'", () => {
      const encoded = Schema.encodeEither(BooleanFromYN)(true);

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right).toBe("Y");
      }
    });

    it("should encode false as 'N'", () => {
      const encoded = Schema.encodeEither(BooleanFromYN)(false);

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right).toBe("N");
      }
    });
  });
});
