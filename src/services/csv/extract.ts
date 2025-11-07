import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { parse as parseCsv } from "csv-parse";
import { Effect, Schema } from "effect";

// Error type for CSV extraction
export class CsvExtractError extends Schema.TaggedError<CsvExtractError>()(
  "CsvExtractError",
  {
    message: Schema.String,
    type: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// CSV Extract Service
export class CsvExtractorService extends Effect.Service<CsvExtractorService>()(
  "CsvExtractorService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      return {
        extract: (filePath: string) =>
          Effect.gen(function* () {
            const records: Array<unknown> = [];

            const fileContent = yield* fs.readFileString(filePath, "utf8").pipe(
              Effect.mapError(
                (error) =>
                  new CsvExtractError({
                    type: "FILE_READ_ERROR",
                    message: `Failed to read CSV file: ${error.message || "Unknown error"}`,
                    status: 500,
                  }),
              ),
            );

            yield* Effect.tryPromise({
              try: () =>
                new Promise<void>((resolve, reject) => {
                  const extractor = parseCsv({
                    columns: true,
                    skip_empty_lines: true,
                    trim: true,
                  });

                  extractor.on("data", (row: unknown) => {
                    records.push(row);
                  });

                  extractor.on("error", (error) => {
                    reject(
                      new CsvExtractError({
                        type: "CSV_EXTRACT_ERROR",
                        message: `Failed to parse CSV: ${error.message}`,
                        status: 500,
                      }),
                    );
                  });

                  extractor.on("end", () => {
                    resolve();
                  });

                  extractor.write(fileContent);
                  extractor.end();
                }),
              catch: (error) =>
                error instanceof CsvExtractError
                  ? error
                  : new CsvExtractError({
                      type: "CSV_EXTRACT_ERROR",
                      message: `Failed to extract CSV: ${error instanceof Error ? error.message : "Unknown error"}`,
                      status: 500,
                    }),
            });

            return records;
          }),
      };
    }),
    dependencies: [NodeContext.layer],
  },
) {}
