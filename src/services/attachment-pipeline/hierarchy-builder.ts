import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List, Schema } from "effect";
import { ConfigService } from "../../lib/config.js";
import type { OrganizedByAgency } from "../../lib/type.js";
import { GoogleDriveFileService } from "../google-drive/file.js";
import { ProgressLoggerService } from "../lib/progress.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a created folder in the hierarchy
 */
export interface CreatedFolder {
  readonly id: string;
  readonly name: string;
  readonly parentId: string;
  readonly path: string; // e.g., "Agency Name/2021"
}

/**
 * Hierarchy structure for an agency
 */
export interface AgencyHierarchy {
  readonly agencyName: string;
  readonly agencyFolderId: string;
  readonly yearFolders: Map<number, string>; // year -> folderId
}

/**
 * Result of building the hierarchy
 */
export interface HierarchyBuildResult {
  readonly timestamp: string;
  readonly totalAgencies: number;
  readonly totalYearFolders: number;
  readonly createdAgencyFolders: number;
  readonly createdYearFolders: number;
  readonly reusedAgencyFolders: number;
  readonly reusedYearFolders: number;
  readonly hierarchies: readonly AgencyHierarchy[];
  readonly errors: readonly string[];
}

/**
 * Manifest entry for hierarchy - tracks folder creation for rollback
 */
export interface HierarchyManifestEntry {
  readonly folderId: string;
  readonly folderName: string;
  readonly parentId: string;
  readonly folderType: "agency" | "year";
  readonly agencyName: string;
  readonly year?: number | undefined;
  readonly createdAt: string;
}

/**
 * Full hierarchy manifest
 */
export interface HierarchyManifest {
  readonly version: 1;
  readonly lastUpdated: string;
  readonly entries: readonly HierarchyManifestEntry[];
}

export interface BuildOptions {
  /** Maximum number of agencies to process (for testing) */
  readonly limit?: number | undefined;
  /** Only process specific agencies */
  readonly filterAgencies?: readonly string[] | undefined;
  /** Dry run - don't actually create folders */
  readonly dryRun?: boolean | undefined;
}

// Error type for hierarchy operations
export class AttachmentHierarchyError extends Schema.TaggedError<AttachmentHierarchyError>()(
  "AttachmentHierarchyError",
  {
    message: Schema.String,
    type: Schema.String,
    details: Schema.optional(Schema.String),
  },
) {}

const MANIFEST_PATH = "data/hierarchy-manifest.json";

// ============================================================================
// Service
// ============================================================================

export class AttachmentHierarchyService extends Effect.Service<AttachmentHierarchyService>()(
  "AttachmentHierarchyService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;
      const progress = yield* ProgressLoggerService;
      const fs = yield* FileSystem.FileSystem;
      const config = yield* ConfigService;

      const attachmentsFolderId = yield* config.attachmentsFolderId;
      const sharedDriveId = yield* config.sharedClientDriveId;

      /**
       * Load existing hierarchy manifest
       */
      const loadManifest = (): Effect.Effect<
        HierarchyManifest,
        AttachmentHierarchyError
      > =>
        Effect.gen(function* () {
          const readResult = yield* Effect.either(
            fs.readFileString(MANIFEST_PATH),
          );

          if (readResult._tag === "Left") {
            return {
              version: 1,
              lastUpdated: new Date().toISOString(),
              entries: [],
            } satisfies HierarchyManifest;
          }

          const parsed = yield* Effect.try({
            try: () => JSON.parse(readResult.right) as HierarchyManifest,
            catch: (error) =>
              new AttachmentHierarchyError({
                message: "Failed to parse manifest JSON",
                type: "PARSE_ERROR",
                details: String(error),
              }),
          });

          return parsed;
        });

      /**
       * Save hierarchy manifest
       */
      const saveManifest = (
        manifest: HierarchyManifest,
      ): Effect.Effect<void, AttachmentHierarchyError> =>
        Effect.gen(function* () {
          yield* fs
            .makeDirectory("data", { recursive: true })
            .pipe(Effect.ignore);

          yield* fs
            .writeFileString(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
            .pipe(
              Effect.mapError(
                (error) =>
                  new AttachmentHierarchyError({
                    message: "Failed to write manifest",
                    type: "WRITE_ERROR",
                    details: String(error),
                  }),
              ),
            );
        });

      /**
       * Get or create an agency folder
       */
      const getOrCreateAgencyFolder = (
        agencyName: string,
        dryRun: boolean,
      ): Effect.Effect<
        { id: string; created: boolean },
        AttachmentHierarchyError
      > =>
        Effect.gen(function* () {
          // Search for existing folder
          const existingFolders = yield* googleDrive
            .searchFiles({
              fileName: agencyName,
              parentId: attachmentsFolderId,
              sharedDriveId,
            })
            .pipe(
              Effect.mapError(
                (e) =>
                  new AttachmentHierarchyError({
                    message: `Failed to search for agency folder: ${e.message}`,
                    type: "SEARCH_ERROR",
                  }),
              ),
            );

          const existingFolder = existingFolders.find(
            (f) => f.mimeType === "application/vnd.google-apps.folder",
          );

          if (existingFolder) {
            return { id: existingFolder.id, created: false };
          }

          if (dryRun) {
            return { id: `dry-run-agency-${agencyName}`, created: true };
          }

          // Create the folder
          const result = yield* googleDrive
            .createFolder(agencyName, attachmentsFolderId)
            .pipe(
              Effect.mapError(
                (e) =>
                  new AttachmentHierarchyError({
                    message: `Failed to create agency folder: ${e.message}`,
                    type: "CREATE_ERROR",
                  }),
              ),
            );

          return { id: result.folderId, created: true };
        });

      /**
       * Get or create a year folder within an agency folder
       */
      const getOrCreateYearFolder = (
        agencyFolderId: string,
        year: number,
        dryRun: boolean,
      ): Effect.Effect<
        { id: string; created: boolean },
        AttachmentHierarchyError
      > =>
        Effect.gen(function* () {
          const yearName = String(year);

          // If parent is a dry-run placeholder, the year folder can't exist yet
          // since the parent doesn't exist - assume it would be created
          if (agencyFolderId.startsWith("dry-run-")) {
            return { id: `dry-run-year-${year}`, created: true };
          }

          // Search for existing folder
          const existingFolders = yield* googleDrive
            .searchFiles({
              fileName: yearName,
              parentId: agencyFolderId,
              sharedDriveId,
            })
            .pipe(
              Effect.mapError(
                (e) =>
                  new AttachmentHierarchyError({
                    message: `Failed to search for year folder: ${e.message}`,
                    type: "SEARCH_ERROR",
                  }),
              ),
            );

          const existingFolder = existingFolders.find(
            (f) => f.mimeType === "application/vnd.google-apps.folder",
          );

          if (existingFolder) {
            return { id: existingFolder.id, created: false };
          }

          if (dryRun) {
            return { id: `dry-run-year-${year}`, created: true };
          }

          // Create the folder
          const result = yield* googleDrive
            .createFolder(yearName, agencyFolderId)
            .pipe(
              Effect.mapError(
                (e) =>
                  new AttachmentHierarchyError({
                    message: `Failed to create year folder: ${e.message}`,
                    type: "CREATE_ERROR",
                  }),
              ),
            );

          return { id: result.folderId, created: true };
        });

      /**
       * Build hierarchy for all agencies from organized attachments
       */
      const buildHierarchy = (
        attachments: OrganizedByAgency,
        options: BuildOptions = {},
      ) =>
        Effect.gen(function* () {
          // Collect unique agency/year combinations
          const agencyYears = new Map<string, Set<number>>();

          for (const [agencyName, agencyAttachments] of HashMap.entries(
            attachments,
          )) {
            if (
              options.filterAgencies &&
              !options.filterAgencies.includes(agencyName)
            ) {
              continue;
            }

            const years = new Set<number>();
            for (const attachment of List.toArray(agencyAttachments)) {
              years.add(attachment.determinedYear);
            }
            agencyYears.set(agencyName, years);
          }

          yield* progress.logItem(
            `Found ${agencyYears.size} agencies with attachments`,
          );

          // Apply limit if specified
          const agencyNames = Array.from(agencyYears.keys());
          const agenciesToProcess = options.limit
            ? agencyNames.slice(0, options.limit)
            : agencyNames;

          if (options.limit && agencyNames.length > options.limit) {
            yield* progress.logItem(
              `LIMIT MODE: Processing only ${agenciesToProcess.length}/${agencyNames.length} agencies`,
            );
          }

          if (options.dryRun) {
            yield* progress.logItem("DRY RUN MODE: No folders will be created");
          }

          yield* progress.startTask(
            "Building hierarchy",
            agenciesToProcess.length,
          );

          const hierarchies: AgencyHierarchy[] = [];
          const manifestEntries: HierarchyManifestEntry[] = [];
          const errors: string[] = [];
          const createdAt = new Date().toISOString();

          let createdAgencyFolders = 0;
          let createdYearFolders = 0;
          let reusedAgencyFolders = 0;
          let reusedYearFolders = 0;

          for (let i = 0; i < agenciesToProcess.length; i++) {
            const agencyName = agenciesToProcess[i];
            const years = agencyYears.get(agencyName) ?? new Set();

            yield* progress.logProgress(
              i + 1,
              `${agencyName} (${years.size} years)`,
            );

            // Get or create agency folder
            const agencyResult = yield* Effect.either(
              getOrCreateAgencyFolder(agencyName, options.dryRun ?? false),
            );

            if (agencyResult._tag === "Left") {
              errors.push(
                `Failed to create agency folder for ${agencyName}: ${agencyResult.left}`,
              );
              continue;
            }

            const { id: agencyFolderId, created: agencyCreated } =
              agencyResult.right;

            if (agencyCreated) {
              createdAgencyFolders++;
              if (!options.dryRun) {
                manifestEntries.push({
                  folderId: agencyFolderId,
                  folderName: agencyName,
                  parentId: attachmentsFolderId,
                  folderType: "agency",
                  agencyName,
                  createdAt,
                });
              }
              yield* progress.logItem(`  Created agency folder: ${agencyName}`);
            } else {
              reusedAgencyFolders++;
            }

            // Create year folders
            const yearFolders = new Map<number, string>();

            for (const year of Array.from(years).sort()) {
              const yearResult = yield* Effect.either(
                getOrCreateYearFolder(
                  agencyFolderId,
                  year,
                  options.dryRun ?? false,
                ),
              );

              if (yearResult._tag === "Left") {
                errors.push(
                  `Failed to create year folder ${year} for ${agencyName}: ${yearResult.left}`,
                );
                continue;
              }

              const { id: yearFolderId, created: yearCreated } =
                yearResult.right;
              yearFolders.set(year, yearFolderId);

              if (yearCreated) {
                createdYearFolders++;
                if (!options.dryRun) {
                  manifestEntries.push({
                    folderId: yearFolderId,
                    folderName: String(year),
                    parentId: agencyFolderId,
                    folderType: "year",
                    agencyName,
                    year,
                    createdAt,
                  });
                }
                yield* progress.logItem(`    Created year folder: ${year}`);
              } else {
                reusedYearFolders++;
              }
            }

            hierarchies.push({
              agencyName,
              agencyFolderId,
              yearFolders,
            });
          }

          yield* progress.complete();

          // Save manifest entries
          if (manifestEntries.length > 0) {
            const currentManifest = yield* loadManifest();
            const updatedManifest: HierarchyManifest = {
              version: 1,
              lastUpdated: createdAt,
              entries: [...currentManifest.entries, ...manifestEntries],
            };
            yield* saveManifest(updatedManifest);
          }

          // Build result
          const result: HierarchyBuildResult = {
            timestamp: createdAt,
            totalAgencies: hierarchies.length,
            totalYearFolders: hierarchies.reduce(
              (sum, h) => sum + h.yearFolders.size,
              0,
            ),
            createdAgencyFolders,
            createdYearFolders,
            reusedAgencyFolders,
            reusedYearFolders,
            hierarchies,
            errors,
          };

          // Write report to file
          yield* fs
            .makeDirectory("logs", { recursive: true })
            .pipe(Effect.ignore);

          // Convert Map to object for JSON serialization
          const serializableHierarchies = hierarchies.map((h) => ({
            ...h,
            yearFolders: Object.fromEntries(h.yearFolders),
          }));

          yield* fs.writeFileString(
            "logs/hierarchy-build-report.json",
            JSON.stringify(
              { ...result, hierarchies: serializableHierarchies },
              null,
              2,
            ),
          );

          // Log summary
          yield* progress.logItem("");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem("HIERARCHY BUILD SUMMARY");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem(`Total agencies: ${result.totalAgencies}`);
          yield* progress.logItem(
            `Total year folders: ${result.totalYearFolders}`,
          );
          yield* progress.logItem(
            `Created agency folders: ${result.createdAgencyFolders}`,
          );
          yield* progress.logItem(
            `Created year folders: ${result.createdYearFolders}`,
          );
          yield* progress.logItem(
            `Reused agency folders: ${result.reusedAgencyFolders}`,
          );
          yield* progress.logItem(
            `Reused year folders: ${result.reusedYearFolders}`,
          );
          yield* progress.logItem(`Errors: ${result.errors.length}`);
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem(
            "Report written to: logs/hierarchy-build-report.json",
          );
          yield* progress.logItem(`Manifest written to: ${MANIFEST_PATH}`);

          return result;
        });

      /**
       * Get the hierarchy map for looking up folder IDs
       * Returns a map of agencyName -> { agencyFolderId, yearFolders: Map<year, folderId> }
       */
      const getHierarchyMap = () =>
        Effect.gen(function* () {
          const manifest = yield* loadManifest();

          const hierarchyMap = new Map<string, AgencyHierarchy>();

          // Group by agency
          for (const entry of manifest.entries) {
            let hierarchy = hierarchyMap.get(entry.agencyName);

            if (!hierarchy) {
              hierarchy = {
                agencyName: entry.agencyName,
                agencyFolderId: "",
                yearFolders: new Map(),
              };
              hierarchyMap.set(entry.agencyName, hierarchy);
            }

            if (entry.folderType === "agency") {
              hierarchyMap.set(entry.agencyName, {
                ...hierarchy,
                agencyFolderId: entry.folderId,
              });
            } else if (
              entry.folderType === "year" &&
              entry.year !== undefined
            ) {
              hierarchy.yearFolders.set(entry.year, entry.folderId);
            }
          }

          return hierarchyMap;
        });

      return {
        buildHierarchy,
        getHierarchyMap,
        loadManifest,
        MANIFEST_PATH,
      };
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      ProgressLoggerService.Default,
      ConfigService.Default,
      NodeContext.layer,
    ],
  },
) {}
