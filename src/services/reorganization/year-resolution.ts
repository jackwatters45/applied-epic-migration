import { Effect, Schema } from "effect";
import type { FileMetadata } from "./folder-scanner.js";

// Error types
export class YearResolutionError extends Schema.TaggedError<YearResolutionError>()(
  "YearResolutionError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

export interface YearMappingResult {
  readonly originalYear: number;
  readonly targetYear: number;
  readonly reason: string;
}

// Year Resolution Service
export class YearResolutionService extends Effect.Service<YearResolutionService>()(
  "YearResolutionService",
  {
    effect: Effect.gen(function* () {
      return {
        resolveYear: (date: Date) =>
          Effect.gen(function* () {
            // TODO: Implement year resolution logic (2018-2023 -> 2023)
            return {
              originalYear: date.getFullYear(),
              targetYear: date.getFullYear(),
              reason: "No mapping needed",
            } as YearMappingResult;
          }),

        extractYearFromFileMetadata: (_metadata: FileMetadata) =>
          Effect.gen(function* () {
            // TODO: Implement year extraction from file metadata
            return new Date();
          }),

        handleDuplicateYearFolders: (yearFolders: readonly string[]) =>
          Effect.gen(function* () {
            // TODO: Implement duplicate year folder handling
            return yearFolders[0] || "";
          }),
      } as const;
    }),
    dependencies: [],
  },
) {}
