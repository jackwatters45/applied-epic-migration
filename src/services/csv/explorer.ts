import { Console, Effect, Schema } from "effect";
import {
  analyzeBooleanValues,
  analyzeDateValues,
  analyzeNumericValues,
  cleanValue,
  getNonNullValuesFromArr,
} from "../../lib/util.js";

// Error types for CSV exploration
export class CsvExplorerError extends Schema.TaggedError<CsvExplorerError>()(
  "CsvExplorerError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// Types for field analysis
export interface FieldAnalysis {
  readonly fieldName: string;
  readonly dataType:
    | "string"
    | "number"
    | "date"
    | "boolean"
    | "undefined"
    | "mixed";
  readonly sampleValues: readonly string[];
  readonly nullCount: number;
  readonly totalCount: number;
  readonly uniqueValues: readonly string[];
}

export interface CsvAnalysis {
  readonly totalRows: number;
  readonly totalFields: number;
  readonly fieldAnalyses: readonly FieldAnalysis[];
  readonly sampleRow: Record<string, unknown>;
}

// CSV Explorer Service - no dependencies, works with any CSV data
export class CsvExplorerService extends Effect.Service<CsvExplorerService>()(
  "CsvExplorerService",
  {
    effect: Effect.gen(function* () {
      const analyzeDataType = (
        values: readonly string[],
      ): FieldAnalysis["dataType"] => {
        const nonNullValues = getNonNullValuesFromArr(values);

        if (nonNullValues.length === 0) {
          return "undefined";
        }

        // Check if all values are numbers
        const numberAnalysis = analyzeNumericValues(nonNullValues);
        if (numberAnalysis.isAll) {
          return "number";
        }

        // Check if all values are dates
        const dateAnalysis = analyzeDateValues(nonNullValues);
        if (dateAnalysis.isAll && nonNullValues.length > 0) {
          return "date";
        }

        // Check if all values are boolean-like
        const booleanAnalysis = analyzeBooleanValues(nonNullValues);
        if (booleanAnalysis.isAll && nonNullValues.length > 0) {
          return "boolean";
        }

        // Check if values have consistent string-like patterns
        // If they're not all numbers, dates, or booleans, they're strings
        // Only mark as "mixed" if we have conflicting specific types
        const hasNumbers = numberAnalysis.hasSome;
        const hasDates = dateAnalysis.hasSome;
        const hasBooleans = booleanAnalysis.hasSome;

        // If we have multiple specific types, it's mixed
        const typeCount = [hasNumbers, hasDates, hasBooleans].filter(
          Boolean,
        ).length;
        if (typeCount > 1) {
          return "mixed";
        }

        // Otherwise, it's a string (most common case)
        return "string";
      };

      const getCleanSamples = (
        values: readonly string[],
        maxSamples = 5,
      ): string[] => {
        const cleanedValues = getNonNullValuesFromArr(values).slice(
          0,
          maxSamples * 3,
        );

        // Remove duplicates while preserving order
        const seen = new Set<string>();
        const uniqueSamples: string[] = [];

        for (const value of cleanedValues) {
          if (!seen.has(value)) {
            seen.add(value);
            uniqueSamples.push(value);
            if (uniqueSamples.length >= maxSamples) break;
          }
        }

        return uniqueSamples;
      };

      const analyzeField = (fieldName: string, values: readonly string[]) =>
        Effect.sync(() => {
          const cleanedValues = values.map(cleanValue);
          const dataType = analyzeDataType(cleanedValues);
          const nonNullValues = getNonNullValuesFromArr(cleanedValues);
          const nullCount = cleanedValues.length - nonNullValues.length;
          const uniqueValues = [...new Set(nonNullValues)];

          return {
            fieldName,
            dataType,
            sampleValues: getCleanSamples(values),
            nullCount,
            totalCount: values.length,
            uniqueValues,
          };
        });

      const exploreParsedCsv = (
        parsedData: readonly Record<string, unknown>[],
      ) =>
        Effect.gen(function* () {
          yield* Console.log(
            `🔍 Exploring parsed CSV with ${parsedData.length} rows`,
          );

          if (parsedData.length === 0) {
            return {
              totalRows: 0,
              totalFields: 0,
              fieldAnalyses: [],
              sampleRow: {},
            };
          }

          // Get all field names from first row
          const fieldNames = Object.keys(parsedData[0]);
          yield* Console.log(
            `📊 Found ${fieldNames.length} fields in ${parsedData.length} rows`,
          );

          // Analyze each field
          const fieldAnalyses: FieldAnalysis[] = [];

          for (const fieldName of fieldNames) {
            const values = parsedData.map((row) =>
              String(row[fieldName] ?? "").trim(),
            );
            const analysis = yield* analyzeField(fieldName, values);
            fieldAnalyses.push(analysis);

            yield* Console.log(`📋 Field: ${fieldName}`);
            yield* Console.log(`   Type: ${analysis.dataType}`);
            yield* Console.log(
              `   Null/Empty: ${analysis.nullCount}/${analysis.totalCount}`,
            );
            yield* Console.log(
              `   Unique values: ${analysis.uniqueValues.length}`,
            );

            // Show cleaned sample values
            const displaySamples = analysis.sampleValues.slice(0, 3);
            const sampleText =
              displaySamples.length > 0
                ? displaySamples.map((s) => `"${s}"`).join(", ")
                : "No valid samples";
            yield* Console.log(
              `   Samples: ${sampleText}${analysis.sampleValues.length > 3 ? "..." : ""}`,
            );
          }

          // Clean the sample row for better display
          const cleanedSampleRow: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(parsedData[0])) {
            const stringValue = String(value ?? "");
            const cleaned = cleanValue(stringValue);
            cleanedSampleRow[key] = cleaned === "" ? undefined : cleaned;
          }

          return {
            totalRows: parsedData.length,
            totalFields: fieldNames.length,
            fieldAnalyses,
            sampleRow: cleanedSampleRow,
          };
        });

      const generateTypeDefinitions = (
        analysis: CsvAnalysis,
      ): Effect.Effect<string, CsvExplorerError> =>
        Effect.sync(() => {
          let typeDefinitions =
            "// Generated TypeScript interfaces based on CSV analysis\n\n";

          // Main interface
          typeDefinitions += "export interface CsvRow {\n";

          for (const field of analysis.fieldAnalyses) {
            let type: string;

            switch (field.dataType) {
              case "string":
                type = "string";
                break;
              case "number":
                type = "number";
                break;
              case "date":
                type = "Date";
                break;
              case "boolean":
                type = "boolean";
                break;
              case "undefined":
                type = "unknown";
                break;
              case "mixed":
                type = "string | number | Date | undefined";
                break;
              default:
                type = "string";
            }

            // Add undefined to type for fields that have null/empty values
            if (field.nullCount > 0 && field.dataType !== "mixed") {
              type += " | undefined";
            }

            typeDefinitions += `  readonly ${field.fieldName}: ${type};\n`;
          }

          typeDefinitions += "}\n\n";

          // Add statistics as comment
          typeDefinitions += "/*\n * CSV Statistics:\n";
          typeDefinitions += ` * Total Rows: ${analysis.totalRows}\n`;
          typeDefinitions += ` * Total Fields: ${analysis.totalFields}\n`;
          typeDefinitions += " */\n";

          return typeDefinitions;
        });

      return {
        // Main exploration function - takes any parsed CSV data
        exploreParsedCsv,

        // Field analysis
        analyzeField,

        // Type definition generation
        generateTypeDefinitions,

        // Utility functions
        getDataTypes: (analysis: CsvAnalysis) =>
          analysis.fieldAnalyses.map((f) => f.dataType),

        getFieldsByType: (
          analysis: CsvAnalysis,
          dataType: FieldAnalysis["dataType"],
        ) => analysis.fieldAnalyses.filter((f) => f.dataType === dataType),
      } as const;
    }),
    dependencies: [],
  },
) {}
