import { Effect, Schema as S } from "effect";

/**
 * Creates an optional string field that converts empty strings to undefined
 */
export const OptionalString = () =>
  S.optional(
    S.String.pipe(
      S.transform(S.Union(S.String, S.Undefined), {
        strict: false,
        decode: (s) => (s === "" ? undefined : s),
        encode: (_, s) => s ?? "",
      }),
    ),
  );

/**
 * Schema transformation that handles empty strings for optional number fields
 */
export const OptionalNumberFromString = S.optional(
  S.String.pipe(
    S.filter((s) => s === "" || !Number.isNaN(Number(s))),
    S.transform(S.Union(S.Number, S.Undefined), {
      strict: false,
      decode: (s) => (s === "" ? undefined : Number(s)),
      encode: (_, n) => n?.toString() ?? "",
    }),
  ),
);

/**
 * Schema transformation that handles empty strings for optional date fields
 */
export const OptionalDateFromString = S.optional(
  S.Union(
    // Handle empty strings
    S.Literal("").pipe(
      S.transform(S.Undefined, {
        strict: false,
        decode: () => undefined,
        encode: () => "",
      }),
    ),
    S.Date,
  ),
);

/**
 * Schema transformation for trimming strings
 */
export const TrimString = S.String.pipe(
  S.transform(S.String, {
    strict: false,
    decode: (s) => s.trim(),
    encode: (s) => s,
  }),
);

/**
 * Schema transformation for Y/N boolean fields
 */
export const BooleanFromYN = S.String.pipe(
  S.filter((s) => s === "Y" || s === "N"),
  S.transformOrFail(S.Boolean, {
    strict: false,
    decode: (s) => Effect.succeed(s === "Y"),
    encode: (b) => Effect.succeed(b ? "Y" : "N"),
  }),
);
