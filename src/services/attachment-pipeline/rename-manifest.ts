import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";

// ============================================================================
// Types
// ============================================================================

/**
 * Manifest entry for a renamed file - enables rollback and tracking
 */
export interface RenamedFileManifestEntry {
  /** Google Drive file ID */
  readonly fileId: string;
  /** Original UUID-based filename */
  readonly originalName: string;
  /** New human-readable filename */
  readonly newName: string;
  /** Agency name this file belongs to */
  readonly agencyName: string;
  /** Year determined from metadata */
  readonly determinedYear: number;
  /** Timestamp when renamed */
  readonly renamedAt: string;
}

/**
 * Full manifest of all renamed files
 */
export interface RenameManifest {
  readonly version: 1;
  readonly lastUpdated: string;
  readonly entries: readonly RenamedFileManifestEntry[];
}

// Error type for manifest operations
export class RenameManifestError extends Schema.TaggedError<RenameManifestError>()(
  "RenameManifestError",
  {
    message: Schema.String,
    type: Schema.String,
    details: Schema.optional(Schema.String),
  },
) {}

const MANIFEST_PATH = "data/rename-manifest.json";

// ============================================================================
// Service
// ============================================================================

export class RenameManifestService extends Effect.Service<RenameManifestService>()(
  "RenameManifestService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      /**
       * Load the current manifest from disk
       * Returns empty manifest if file doesn't exist
       */
      const load = (): Effect.Effect<RenameManifest, RenameManifestError> =>
        Effect.gen(function* () {
          const readResult = yield* Effect.either(
            fs.readFileString(MANIFEST_PATH),
          );

          if (readResult._tag === "Left") {
            return {
              version: 1,
              lastUpdated: new Date().toISOString(),
              entries: [],
            } satisfies RenameManifest;
          }

          const parsed = yield* Effect.try({
            try: () => JSON.parse(readResult.right) as RenameManifest,
            catch: (error) =>
              new RenameManifestError({
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
        manifest: RenameManifest,
      ): Effect.Effect<void, RenameManifestError> =>
        Effect.gen(function* () {
          yield* fs
            .makeDirectory("data", { recursive: true })
            .pipe(Effect.ignore);

          yield* fs
            .writeFileString(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
            .pipe(
              Effect.mapError(
                (error) =>
                  new RenameManifestError({
                    message: "Failed to write manifest",
                    type: "WRITE_ERROR",
                    details: String(error),
                  }),
              ),
            );
        });

      /**
       * Add new entries to the manifest
       * If an entry for the same file ID already exists, it is replaced
       */
      const addEntries = (
        newEntries: readonly RenamedFileManifestEntry[],
      ): Effect.Effect<RenameManifest, RenameManifestError> =>
        Effect.gen(function* () {
          const current = yield* load();

          // Get file IDs from new entries
          const newFileIds = new Set(newEntries.map((e) => e.fileId));

          // Filter out existing entries for re-renamed files
          const filteredExisting = current.entries.filter(
            (e) => !newFileIds.has(e.fileId),
          );

          const updatedManifest: RenameManifest = {
            version: 1,
            lastUpdated: new Date().toISOString(),
            entries: [...filteredExisting, ...newEntries],
          };

          yield* save(updatedManifest);

          return updatedManifest;
        });

      /**
       * Get all renamed file IDs (to skip already-renamed files)
       */
      const getRenamedFileIds = (): Effect.Effect<
        Set<string>,
        RenameManifestError
      > =>
        Effect.gen(function* () {
          const manifest = yield* load();
          return new Set(manifest.entries.map((e) => e.fileId));
        });

      /**
       * Get entries for rollback (returns original names)
       */
      const getEntriesForRollback = (): Effect.Effect<
        readonly RenamedFileManifestEntry[],
        RenameManifestError
      > =>
        Effect.gen(function* () {
          const manifest = yield* load();
          return manifest.entries;
        });

      /**
       * Remove entries after successful rollback
       */
      const removeEntries = (
        fileIds: readonly string[],
      ): Effect.Effect<RenameManifest, RenameManifestError> =>
        Effect.gen(function* () {
          const current = yield* load();
          const idsToRemove = new Set(fileIds);

          const updatedManifest: RenameManifest = {
            version: 1,
            lastUpdated: new Date().toISOString(),
            entries: current.entries.filter((e) => !idsToRemove.has(e.fileId)),
          };

          yield* save(updatedManifest);

          return updatedManifest;
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

          return {
            totalRenamed: manifest.entries.length,
            uniqueAgencies: uniqueAgencies.size,
            lastUpdated: manifest.lastUpdated,
          };
        });

      return {
        load,
        save,
        addEntries,
        getRenamedFileIds,
        getEntriesForRollback,
        removeEntries,
        getStats,
        MANIFEST_PATH,
      };
    }),
    dependencies: [NodeContext.layer],
  },
) {}
