import { Effect, Schema } from "effect";
import * as yauzl from "yauzl-promise";

// ============================================================================
// Types
// ============================================================================

export interface ZipEntry {
  readonly path: string;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly compressedSize: number;
}

export interface ZipContents {
  /** Top-level folders in the zip (e.g., ["2019", "2020"]) */
  readonly topLevelFolders: readonly string[];
  /** Top-level files in the zip (files not in any folder) */
  readonly topLevelFiles: readonly string[];
  /** All entries in the zip */
  readonly entries: readonly ZipEntry[];
  /** Total number of files (not directories) */
  readonly totalFiles: number;
  /** Total uncompressed size in bytes */
  readonly totalSize: number;
  /** Years detected from folder names (e.g., [2019, 2020]) */
  readonly detectedYears: readonly number[];
}

// Error type for zip inspection
export class ZipInspectorError extends Schema.TaggedError<ZipInspectorError>()(
  "ZipInspectorError",
  {
    message: Schema.String,
    type: Schema.String,
    details: Schema.optional(Schema.String),
  },
) {}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a string is a valid year (4 digits, reasonable range)
 */
const isYearFolder = (name: string): number | null => {
  const yearMatch = name.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = Number.parseInt(yearMatch[1], 10);
    // Reasonable year range for documents
    if (year >= 1990 && year <= 2100) {
      return year;
    }
  }
  return null;
};

/**
 * Extract the top-level folder or file name from a path
 */
const getTopLevel = (
  path: string,
): { name: string; isTopLevelFile: boolean } => {
  // Remove trailing slash if present
  const cleanPath = path.replace(/\/$/, "");
  const parts = cleanPath.split("/");

  if (parts.length === 1) {
    // This is a top-level item
    return { name: parts[0], isTopLevelFile: !path.endsWith("/") };
  }

  // Return the first part (top-level folder)
  return { name: parts[0], isTopLevelFile: false };
};

// ============================================================================
// Service
// ============================================================================

export class ZipInspectorService extends Effect.Service<ZipInspectorService>()(
  "ZipInspectorService",
  {
    effect: Effect.gen(function* () {
      return {
        /**
         * Inspect a zip file from a Uint8Array buffer and return its contents structure
         */
        inspectZipBuffer: (buffer: Uint8Array) =>
          Effect.gen(function* () {
            const zipFile = yield* Effect.tryPromise({
              try: () => yauzl.fromBuffer(Buffer.from(buffer)),
              catch: (error) =>
                new ZipInspectorError({
                  message: "Failed to open zip buffer",
                  type: "OPEN_ERROR",
                  details: String(error),
                }),
            });

            const entries: ZipEntry[] = [];
            const topLevelFoldersSet = new Set<string>();
            const topLevelFilesSet = new Set<string>();

            yield* Effect.tryPromise({
              try: async () => {
                for await (const entry of zipFile) {
                  const isDirectory = entry.filename.endsWith("/");

                  entries.push({
                    path: entry.filename,
                    isDirectory,
                    size: entry.uncompressedSize,
                    compressedSize: entry.compressedSize,
                  });

                  // Track top-level items
                  const { name, isTopLevelFile } = getTopLevel(entry.filename);
                  if (name) {
                    if (isTopLevelFile) {
                      topLevelFilesSet.add(name);
                    } else {
                      topLevelFoldersSet.add(name);
                    }
                  }
                }

                await zipFile.close();
              },
              catch: (error) =>
                new ZipInspectorError({
                  message: "Failed to read zip entries",
                  type: "READ_ERROR",
                  details: String(error),
                }),
            });

            const topLevelFolders = Array.from(topLevelFoldersSet).sort();
            const topLevelFiles = Array.from(topLevelFilesSet).sort();

            // Detect years from folder names
            const detectedYears = topLevelFolders
              .map(isYearFolder)
              .filter((year): year is number => year !== null)
              .sort();

            // Calculate totals
            const fileEntries = entries.filter((e) => !e.isDirectory);
            const totalFiles = fileEntries.length;
            const totalSize = fileEntries.reduce((sum, e) => sum + e.size, 0);

            const contents: ZipContents = {
              topLevelFolders,
              topLevelFiles,
              entries,
              totalFiles,
              totalSize,
              detectedYears,
            };

            return contents;
          }),
      };
    }),
  },
) {}
