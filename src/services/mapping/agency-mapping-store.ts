import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";

const MAPPINGS_FILE_PATH = "data/agency-mappings.json";

// Types
export type MatchType = "exact" | "auto" | "manual";

export interface AgencyMapping {
  readonly folderId: string;
  readonly folderName: string;
  readonly confidence: number;
  readonly matchType: MatchType;
  readonly reasoning: string;
  readonly matchedAt: string;
  readonly reviewedAt?: string;
}

export type AgencyMappings = Record<string, AgencyMapping>;

// Error type
export class AgencyMappingStoreError extends Schema.TaggedError<AgencyMappingStoreError>()(
  "AgencyMappingStoreError",
  {
    message: Schema.String,
    type: Schema.String,
  },
) {}

// Service
export class AgencyMappingStoreService extends Effect.Service<AgencyMappingStoreService>()(
  "AgencyMappingStoreService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      // In-memory cache
      let cache: AgencyMappings | null = null;

      // Load mappings from file
      const load = () =>
        Effect.gen(function* () {
          if (cache) return cache;

          const exists = yield* fs.exists(MAPPINGS_FILE_PATH);
          if (!exists) {
            cache = {};
            return cache;
          }

          const data = yield* fs.readFileString(MAPPINGS_FILE_PATH);
          cache = JSON.parse(data) as AgencyMappings;
          return cache;
        }).pipe(
          Effect.catchAll(() => {
            cache = {};
            return Effect.succeed(cache);
          }),
        );

      // Save mappings to file
      const save = () =>
        Effect.gen(function* () {
          if (!cache) return;
          yield* fs.writeFileString(
            MAPPINGS_FILE_PATH,
            JSON.stringify(cache, null, 2),
          );
        });

      // Get mapping for a single agency
      const get = (agencyName: string) =>
        Effect.gen(function* () {
          const mappings = yield* load();
          return mappings[agencyName] ?? null;
        });

      // Set mapping for a single agency
      const set = (agencyName: string, mapping: AgencyMapping) =>
        Effect.gen(function* () {
          yield* load();
          if (cache) {
            cache[agencyName] = mapping;
          }
          yield* save();
        });

      // Get all unmapped agencies from a list
      const getUnmapped = (allAgencies: string[]) =>
        Effect.gen(function* () {
          const mappings = yield* load();
          return allAgencies.filter((agency) => !mappings[agency]);
        });

      // Get mappings needing review (<90% confidence)
      const getPendingReview = () =>
        Effect.gen(function* () {
          const mappings = yield* load();
          return Object.entries(mappings)
            .filter(([_, mapping]) => mapping.confidence < 90)
            .map(([agencyName, mapping]) => ({ agencyName, ...mapping }));
        });

      // Get all mappings
      const getAll = () => load();

      // Clear cache (force reload on next access)
      const clearCache = () =>
        Effect.sync(() => {
          cache = null;
        });

      return {
        load,
        save,
        get,
        set,
        getUnmapped,
        getPendingReview,
        getAll,
        clearCache,
      } as const;
    }),
    dependencies: [NodeContext.layer],
  },
) {}
