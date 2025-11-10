import { describe, expect, it } from "@effect/vitest";
import { Either, Schema } from "effect";
import {
  BooleanFromYN,
  OptionalDateFromString,
  OptionalNumberFromString,
  OptionalString,
} from "../../../src/lib/schema.js";

describe("Lib Schema Tests", () => {
  describe("OptionalString", () => {
    it("should handle valid strings", () => {
      const schema = Schema.Struct({ v: OptionalString() });
      const result = Schema.decodeUnknownEither(schema)({ v: "test" });

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right).toStrictEqual({ v: "test" });
      }
    });

    it("should convert empty strings to undefined", () => {
      const schema = Schema.Struct({ v: OptionalString() });
      const result = Schema.decodeUnknownEither(schema)({ v: "" });

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.v).toBeUndefined();
      }
    });

    it("should handle undefined", () => {
      const schema = Schema.Struct({ v: OptionalString() });
      const result = Schema.decodeUnknownEither(schema)({ v: undefined });

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.v).toBeUndefined();
      }
    });

    it("should encode correctly", () => {
      const schema = Schema.Struct({ v: OptionalString() });
      const encoded = Schema.encodeEither(schema)({ v: "test" });

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right.v).toBe("test");
      }
    });

    it("should encode undefined as empty string", () => {
      const schema = Schema.Struct({ v: OptionalString() });
      const encoded = Schema.encodeEither(schema)({ v: undefined });

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right.v).toBe("");
      }
    });
  });

  describe("OptionalNumberFromString", () => {
    it("should parse valid numbers", () => {
      const schema = Schema.Struct({ v: OptionalNumberFromString });
      const result = Schema.decodeUnknownEither(schema)({ v: "123" });

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.v).toBe(123);
      }
    });

    it("should handle decimal numbers", () => {
      const schema = Schema.Struct({ v: OptionalNumberFromString });
      const result = Schema.decodeUnknownEither(schema)({ v: "123.45" });

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.v).toBe(123.45);
      }
    });

    it("should convert empty strings to undefined", () => {
      const schema = Schema.Struct({ v: OptionalNumberFromString });
      const result = Schema.decodeUnknownEither(schema)({ v: "" });

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.v).toBeUndefined();
      }
    });

    it("should handle undefined", () => {
      const schema = Schema.Struct({ v: OptionalNumberFromString });
      const result = Schema.decodeUnknownEither(schema)({ v: undefined });

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.v).toBeUndefined();
      }
    });

    it("should encode numbers correctly", () => {
      const schema = Schema.Struct({ v: OptionalNumberFromString });
      const encoded = Schema.encodeEither(schema)({ v: 123 });

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right.v).toBe("123");
      }
    });

    it("should encode undefined as empty string", () => {
      const schema = Schema.Struct({ v: OptionalNumberFromString });
      const encoded = Schema.encodeEither(schema)({ v: undefined });

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right.v).toBe("");
      }
    });
  });

  describe("OptionalDateFromString", () => {
    it("should handle Date objects", () => {
      const testDate = new Date("2023-01-15");
      const schema = Schema.Struct({ v: OptionalDateFromString });
      const result = Schema.decodeUnknownEither(schema)({
        v: testDate.toISOString(),
      });

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.v).toEqual(testDate);
      }
    });

    it("should convert empty strings to undefined", () => {
      const schema = Schema.Struct({ v: OptionalDateFromString });
      const result = Schema.decodeUnknownEither(schema)({ v: "" });

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.v).toBeUndefined();
      }
    });

    it("should handle undefined", () => {
      const schema = Schema.Struct({ v: OptionalDateFromString });
      const result = Schema.decodeUnknownEither(schema)({ v: undefined });

      expect(Either.isRight(result)).toBe(true);
      if (Either.isRight(result)) {
        expect(result.right.v).toBeUndefined();
      }
    });

    it("should encode Date objects correctly", () => {
      const testDate = new Date("2023-01-15");
      const schema = Schema.Struct({ v: OptionalDateFromString });
      const encoded = Schema.encodeEither(schema)({ v: testDate });

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right.v).toBe(testDate.toISOString());
      }
    });

    it("should encode undefined as empty string", () => {
      const schema = Schema.Struct({ v: OptionalDateFromString });
      const encoded = Schema.encodeEither(schema)({ v: undefined });

      expect(Either.isRight(encoded)).toBe(true);
      if (Either.isRight(encoded)) {
        expect(encoded.right.v).toBe("");
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
