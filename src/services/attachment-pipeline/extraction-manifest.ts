import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";

// ============================================================================
// Types
// ============================================================================

/**
 * Manifest entry for an extracted file - preserves agency/year association
 * This is used later when building the Agency/Year hierarchy
 */
export interface ExtractedFileManifestEntry {
  /** Google Drive file ID of the uploaded file */
  readonly fileId: string;
  /** File name as uploaded to Google Drive */
  readonly fileName: string;
  /** Agency name this file belongs to */
  readonly agencyName: string;
  /** Year determined from the original zip's metadata */
  readonly determinedYear: number;
  /** Original zip file ID this was extracted from */
  readonly sourceZipFileId: string;
  /** Original zip file name */
  readonly sourceZipFileName: string;
  /** Path within the zip (e.g., "2018/subfolder/file.pdf") */
  readonly zipPath: string;
  /** Whether this came from a nested zip */
  readonly fromNestedZip: boolean;
  /** Timestamp when extracted */
  readonly extractedAt: string;
}

/**
 * Full manifest of all extracted files
 */
export interface ExtractionManifest {
  readonly version: 1;
  readonly lastUpdated: string;
  readonly entries: readonly ExtractedFileManifestEntry[];
}

// Error type for manifest operations
export class ExtractionManifestError extends Schema.TaggedError<ExtractionManifestError>()(
  "ExtractionManifestError",
  {
    message: Schema.String,
    type: Schema.String,
    details: Schema.optional(Schema.String),
  },
) {}

const MANIFEST_PATH = "data/extraction-manifest.json";

// ============================================================================
// Service
// ============================================================================

export class ExtractionManifestService extends Effect.Service<ExtractionManifestService>()(
  "ExtractionManifestService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      /**
       * Load the current manifest from disk
       * Returns empty manifest if file doesn't exist
       */
      const load = (): Effect.Effect<
        ExtractionManifest,
        ExtractionManifestError
      > =>
        Effect.gen(function* () {
          const readResult = yield* Effect.either(
            fs.readFileString(MANIFEST_PATH),
          );

          if (readResult._tag === "Left") {
            // File doesn't exist, return empty manifest
            return {
              version: 1,
              lastUpdated: new Date().toISOString(),
              entries: [],
            } satisfies ExtractionManifest;
          }

          const parsed = yield* Effect.try({
            try: () => JSON.parse(readResult.right) as ExtractionManifest,
            catch: (error) =>
              new ExtractionManifestError({
                message: "Failed to parse manifest JSON",
                type: "PARSE_ERROR",
                details: String(error),
              }),
          });

          return parsed;
        });

      /**
       * Save the manifest to disk
       */
      const save = (
        manifest: ExtractionManifest,
      ): Effect.Effect<void, ExtractionManifestError> =>
        Effect.gen(function* () {
          yield* fs
            .makeDirectory("data", { recursive: true })
            .pipe(Effect.ignore);

          yield* fs
            .writeFileString(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
            .pipe(
              Effect.mapError(
                (error) =>
                  new ExtractionManifestError({
                    message: "Failed to write manifest",
                    type: "WRITE_ERROR",
                    details: String(error),
                  }),
              ),
            );
        });

      /**
       * Add new entries to the manifest
       * If entries for the same source zip already exist, they are replaced
       */
      const addEntries = (
        newEntries: readonly ExtractedFileManifestEntry[],
      ): Effect.Effect<ExtractionManifest, ExtractionManifestError> =>
        Effect.gen(function* () {
          const current = yield* load();

          // Get unique source zip IDs from new entries
          const newZipIds = new Set(newEntries.map((e) => e.sourceZipFileId));

          // Filter out existing entries for re-extracted zips
          const filteredExisting = current.entries.filter(
            (e) => !newZipIds.has(e.sourceZipFileId),
          );

          const updatedManifest: ExtractionManifest = {
            version: 1,
            lastUpdated: new Date().toISOString(),
            entries: [...filteredExisting, ...newEntries],
          };

          yield* save(updatedManifest);

          return updatedManifest;
        });

      /**
       * Get all entries for a specific agency
       */
      const getEntriesByAgency = (
        agencyName: string,
      ): Effect.Effect<
        readonly ExtractedFileManifestEntry[],
        ExtractionManifestError
      > =>
        Effect.gen(function* () {
          const manifest = yield* load();
          return manifest.entries.filter((e) => e.agencyName === agencyName);
        });

      /**
       * Get all entries grouped by agency
       */
      const getEntriesGroupedByAgency = (): Effect.Effect<
        Map<string, ExtractedFileManifestEntry[]>,
        ExtractionManifestError
      > =>
        Effect.gen(function* () {
          const manifest = yield* load();
          const grouped = new Map<string, ExtractedFileManifestEntry[]>();

          for (const entry of manifest.entries) {
            const existing = grouped.get(entry.agencyName) ?? [];
            existing.push(entry);
            grouped.set(entry.agencyName, existing);
          }

          return grouped;
        });

      /**
       * Get statistics about the manifest
       */
      const getStats = () =>
        Effect.gen(function* () {
          const manifest = yield* load();

          const uniqueAgencies = new Set(
            manifest.entries.map((e) => e.agencyName),
          );
          const uniqueZips = new Set(
            manifest.entries.map((e) => e.sourceZipFileId),
          );
          const nestedCount = manifest.entries.filter(
            (e) => e.fromNestedZip,
          ).length;

          return {
            totalFiles: manifest.entries.length,
            uniqueAgencies: uniqueAgencies.size,
            uniqueSourceZips: uniqueZips.size,
            filesFromNestedZips: nestedCount,
            lastUpdated: manifest.lastUpdated,
          };
        });

      /**
       * Check if a zip has already been extracted
       */
      const isZipExtracted = (
        zipFileId: string,
      ): Effect.Effect<boolean, ExtractionManifestError> =>
        Effect.gen(function* () {
          const manifest = yield* load();
          return manifest.entries.some((e) => e.sourceZipFileId === zipFileId);
        });

      /**
       * Get all extracted zip file IDs
       */
      const getExtractedZipIds = (): Effect.Effect<
        Set<string>,
        ExtractionManifestError
      > =>
        Effect.gen(function* () {
          const manifest = yield* load();
          return new Set(manifest.entries.map((e) => e.sourceZipFileId));
        });

      return {
        load,
        save,
        addEntries,
        getEntriesByAgency,
        getEntriesGroupedByAgency,
        getStats,
        isZipExtracted,
        getExtractedZipIds,
        MANIFEST_PATH,
      };
    }),
    dependencies: [NodeContext.layer],
  },
) {}
