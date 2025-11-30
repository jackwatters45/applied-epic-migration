import { FileSystem, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List, Schema } from "effect";
import * as yauzl from "yauzl-promise";
import { ConfigService } from "../../lib/config.js";
import type { Attachment, OrganizedByAgency } from "../../lib/type.js";
import { GoogleDriveFileService } from "../google-drive/file.js";
import { ProgressLoggerService } from "../lib/progress.js";
import {
  type ExtractedFileManifestEntry,
  ExtractionManifestService,
} from "./extraction-manifest.js";
import { AttachmentHierarchyService } from "./hierarchy-builder.js";

// ============================================================================
// Types
// ============================================================================

export interface ExtractedFile {
  /** Original path within the zip */
  readonly zipPath: string;
  /** Local temp path where file was extracted */
  readonly localPath: string;
  /** File size in bytes */
  readonly size: number;
  /** Whether this was from a nested zip */
  readonly fromNestedZip: boolean;
  /** Parent zip name if from nested zip */
  readonly parentZip?: string | undefined;
}

/** Info about an uploaded file with its metadata */
export interface UploadedFileInfo {
  /** Google Drive file ID */
  readonly fileId: string;
  /** File name as uploaded */
  readonly fileName: string;
  /** Path within the zip */
  readonly zipPath: string;
  /** Whether from nested zip */
  readonly fromNestedZip: boolean;
}

export interface ZipExtractionResult {
  /** Google Drive file ID of the original zip */
  readonly fileId: string;
  /** Display name of the zip file */
  readonly fileName: string;
  /** Agency this zip belongs to */
  readonly agencyName: string;
  /** Year determined from attachment metadata */
  readonly determinedYear: number;
  /** Files extracted from the zip */
  readonly extractedFiles: readonly ExtractedFile[];
  /** Uploaded files with their Google Drive IDs and metadata */
  readonly uploadedFiles: readonly UploadedFileInfo[];
  /** Whether the original zip was archived */
  readonly archived: boolean;
  /** Any errors encountered */
  readonly errors: readonly string[];
}

export interface ExtractionReport {
  readonly timestamp: string;
  readonly totalZips: number;
  readonly successfulExtractions: number;
  readonly failedExtractions: number;
  readonly totalFilesExtracted: number;
  readonly totalFilesUploaded: number;
  readonly nestedZipsProcessed: number;
  readonly results: readonly ZipExtractionResult[];
  readonly errors: readonly string[];
}

export interface ExtractOptions {
  /** Maximum number of zips to process (for testing) */
  readonly limit?: number | undefined;
  /** Only process zips from specific agencies */
  readonly filterAgencies?: readonly string[] | undefined;
  /** Dry run - don't actually upload or archive */
  readonly dryRun?: boolean | undefined;
  /** Archive folder ID - where to move processed zips */
  readonly archiveFolderId?: string | undefined;
}

// Error type for zip extraction
export class ZipExtractorError extends Schema.TaggedError<ZipExtractorError>()(
  "ZipExtractorError",
  {
    message: Schema.String,
    type: Schema.String,
    fileId: Schema.optional(Schema.String),
    details: Schema.optional(Schema.String),
  },
) {}

// ============================================================================
// Service
// ============================================================================

export class ZipExtractorService extends Effect.Service<ZipExtractorService>()(
  "ZipExtractorService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;
      const progress = yield* ProgressLoggerService;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const config = yield* ConfigService;
      const manifestService = yield* ExtractionManifestService;
      const hierarchyService = yield* AttachmentHierarchyService;

      const attachmentsFolderId = yield* config.attachmentsFolderId;
      const sharedDriveId = yield* config.sharedClientDriveId;

      /**
       * Check if an attachment is a zip file
       */
      const isZipFile = (attachment: Attachment): boolean => {
        const ext = attachment.formatted.fileExtension.toLowerCase();
        return ext === ".zip" || ext === "zip";
      };

      /**
       * Get the Google Drive filename for an attachment (UUID-based name)
       */
      const getGoogleDriveFileName = (attachment: Attachment): string => {
        const newPath = attachment.formatted.newPath;
        const fileName = newPath.split("\\").pop() || newPath;
        return fileName;
      };

      /**
       * Get the display filename for an attachment
       */
      const getDisplayFileName = (attachment: Attachment): string => {
        const description = attachment.formatted.description;
        const extension = attachment.formatted.fileExtension.toLowerCase();
        if (description.toLowerCase().endsWith(extension)) {
          return description;
        }
        return `${description}${extension}`;
      };

      /**
       * Find the Google Drive file ID by searching for the file
       */
      const findGoogleDriveFileId = (fileName: string) =>
        Effect.gen(function* () {
          const searchResults = yield* googleDrive.searchFiles({
            fileName,
            parentId: attachmentsFolderId,
            sharedDriveId,
          });

          if (searchResults.length === 0) {
            return yield* Effect.fail(
              new ZipExtractorError({
                message: `File not found in Google Drive: ${fileName}`,
                type: "FILE_NOT_FOUND",
                details: `Searched in attachments folder: ${attachmentsFolderId}`,
              }),
            );
          }

          if (searchResults.length > 1) {
            yield* progress.logItem(
              `  WARNING: Found ${searchResults.length} files named "${fileName}", using first match`,
            );
          }

          return searchResults[0].id;
        });

      /**
       * Create a temporary directory for extraction
       */
      const createTempDir = (prefix: string) =>
        Effect.gen(function* () {
          const tempBase = path.join(process.cwd(), ".tmp");
          yield* fs
            .makeDirectory(tempBase, { recursive: true })
            .pipe(Effect.ignore);

          const tempDir = path.join(tempBase, `${prefix}-${Date.now()}`);
          yield* fs.makeDirectory(tempDir, { recursive: true });

          return tempDir;
        });

      /**
       * Clean up a temporary directory
       */
      const cleanupTempDir = (tempDir: string) =>
        fs.remove(tempDir, { recursive: true }).pipe(Effect.ignore);

      /**
       * Extract a zip buffer to a temporary directory, recursively extracting nested zips
       */
      const extractZipRecursive = (
        buffer: Uint8Array,
        tempDir: string,
        parentZip?: string,
      ): Effect.Effect<ExtractedFile[], ZipExtractorError> =>
        Effect.gen(function* () {
          const zipFile = yield* Effect.tryPromise({
            try: () => yauzl.fromBuffer(Buffer.from(buffer)),
            catch: (error) =>
              new ZipExtractorError({
                message: "Failed to open zip buffer",
                type: "OPEN_ERROR",
                details: String(error),
              }),
          });

          const extractedFiles: ExtractedFile[] = [];
          const nestedZips: { path: string; buffer: Buffer }[] = [];

          yield* Effect.tryPromise({
            try: async () => {
              for await (const entry of zipFile) {
                // Skip directories
                if (entry.filename.endsWith("/")) {
                  continue;
                }

                // Create directory structure
                const filePath = path.join(tempDir, entry.filename);
                const fileDir = path.dirname(filePath);
                await fs
                  .makeDirectory(fileDir, { recursive: true })
                  .pipe(Effect.ignore, Effect.runPromise);

                // Read the file content
                const stream = await entry.openReadStream();
                const chunks: Buffer[] = [];

                await new Promise<void>((resolve, reject) => {
                  stream.on("data", (chunk: Buffer) => chunks.push(chunk));
                  stream.on("end", () => resolve());
                  stream.on("error", reject);
                });

                const fileBuffer = Buffer.concat(chunks);

                // Check if this is a nested zip
                const isNestedZip = entry.filename
                  .toLowerCase()
                  .endsWith(".zip");

                if (isNestedZip) {
                  // Queue for recursive extraction
                  nestedZips.push({ path: entry.filename, buffer: fileBuffer });
                } else {
                  // Write the file
                  await fs
                    .writeFile(filePath, new Uint8Array(fileBuffer))
                    .pipe(Effect.runPromise);

                  extractedFiles.push({
                    zipPath: entry.filename,
                    localPath: filePath,
                    size: entry.uncompressedSize,
                    fromNestedZip: parentZip !== undefined,
                    parentZip,
                  });
                }
              }

              await zipFile.close();
            },
            catch: (error) =>
              new ZipExtractorError({
                message: "Failed to extract zip entries",
                type: "EXTRACT_ERROR",
                details: String(error),
              }),
          });

          // Process nested zips recursively
          for (const nestedZip of nestedZips) {
            yield* progress.logItem(
              `    Extracting nested zip: ${nestedZip.path}`,
            );

            const nestedFiles = yield* extractZipRecursive(
              new Uint8Array(nestedZip.buffer),
              tempDir,
              nestedZip.path,
            );

            extractedFiles.push(...nestedFiles);
          }

          return extractedFiles;
        });

      /**
       * Get or create a folder path in Google Drive (e.g., "2021/subfolder")
       * Returns the folder ID of the deepest folder.
       * Uses and updates the provided cache to avoid creating duplicate folders.
       */
      const getOrCreateFolderPath = (
        parentFolderId: string,
        folderPath: string,
        cache: Map<string, string>,
      ): Effect.Effect<string, ZipExtractorError> =>
        Effect.gen(function* () {
          if (!folderPath || folderPath === ".") {
            return parentFolderId;
          }

          // Check cache first
          if (cache.has(folderPath)) {
            return cache.get(folderPath)!;
          }

          const parts = folderPath.split("/").filter((p) => p.length > 0);
          let currentParentId = parentFolderId;
          let currentPath = "";

          for (const folderName of parts) {
            // Build the path incrementally
            currentPath = currentPath
              ? `${currentPath}/${folderName}`
              : folderName;

            // Check cache for this intermediate path
            if (cache.has(currentPath)) {
              currentParentId = cache.get(currentPath)!;
              continue;
            }

            // Search for existing folder
            const existingFolders = yield* googleDrive
              .searchFiles({
                fileName: folderName,
                parentId: currentParentId,
                sharedDriveId,
              })
              .pipe(
                Effect.mapError(
                  (e) =>
                    new ZipExtractorError({
                      message: `Failed to search for folder ${folderName}: ${e.message}`,
                      type: "FOLDER_SEARCH_ERROR",
                    }),
                ),
              );

            const existingFolder = existingFolders.find(
              (f) => f.mimeType === "application/vnd.google-apps.folder",
            );

            if (existingFolder) {
              currentParentId = existingFolder.id;
            } else {
              // Create the folder
              const result = yield* googleDrive
                .createFolder(folderName, currentParentId)
                .pipe(
                  Effect.mapError(
                    (e) =>
                      new ZipExtractorError({
                        message: `Failed to create folder ${folderName}: ${e.message}`,
                        type: "FOLDER_CREATE_ERROR",
                      }),
                  ),
                );
              currentParentId = result.folderId;
            }

            // Cache the intermediate path
            cache.set(currentPath, currentParentId);
          }

          return currentParentId;
        });

      /**
       * Upload extracted files to Google Drive concurrently, preserving folder structure
       * Returns uploaded file info with metadata for the manifest
       */
      const uploadExtractedFiles = (
        extractedFiles: readonly ExtractedFile[],
        targetFolderId: string,
        dryRun: boolean,
      ) =>
        Effect.gen(function* () {
          if (dryRun) {
            for (const file of extractedFiles) {
              yield* progress.logItem(
                `    [DRY RUN] Would upload: ${file.zipPath}`,
              );
            }
            return {
              uploadedFiles: [] as UploadedFileInfo[],
              errors: [] as string[],
            };
          }

          // Group files by their parent folder path to create folders first
          const folderPaths = new Set<string>();
          for (const file of extractedFiles) {
            const dirPath = path.dirname(file.zipPath);
            if (dirPath && dirPath !== ".") {
              folderPaths.add(dirPath);
            }
          }

          // Create folder structure (sequentially to avoid race conditions)
          // The cache is shared across all folder creations to reuse parent folders
          const folderIdCache = new Map<string, string>();
          folderIdCache.set("", targetFolderId);
          folderIdCache.set(".", targetFolderId);

          // Sort paths so parent folders are created before children
          for (const folderPath of Array.from(folderPaths).sort()) {
            yield* getOrCreateFolderPath(
              targetFolderId,
              folderPath,
              folderIdCache,
            );
          }

          const CONCURRENCY = 10;

          yield* progress.logItem(
            `    Uploading ${extractedFiles.length} files (concurrency: ${CONCURRENCY})...`,
          );

          const uploadOne = (file: ExtractedFile) =>
            Effect.gen(function* () {
              const fileName = path.basename(file.zipPath);
              const dirPath = path.dirname(file.zipPath);
              const parentId = folderIdCache.get(dirPath) ?? targetFolderId;

              const fileContent = yield* fs.readFile(file.localPath);

              const result = yield* googleDrive.uploadFile({
                fileName,
                content: fileContent,
                parentId,
              });

              return {
                success: true as const,
                uploadedFile: {
                  fileId: result.id,
                  fileName: result.name,
                  zipPath: file.zipPath,
                  fromNestedZip: file.fromNestedZip,
                } satisfies UploadedFileInfo,
              };
            }).pipe(
              Effect.catchAll((error) =>
                Effect.succeed({
                  success: false as const,
                  zipPath: file.zipPath,
                  error: String(error),
                }),
              ),
            );

          const results = yield* Effect.all(extractedFiles.map(uploadOne), {
            concurrency: CONCURRENCY,
          });

          const uploadedFiles: UploadedFileInfo[] = [];
          const errors: string[] = [];

          for (const result of results) {
            if (result.success) {
              uploadedFiles.push(result.uploadedFile);
            } else {
              errors.push(
                `Failed to upload ${result.zipPath}: ${result.error}`,
              );
            }
          }

          yield* progress.logItem(
            `    Uploaded ${uploadedFiles.length}/${extractedFiles.length} files`,
          );

          return { uploadedFiles, errors };
        });

      /**
       * Archive a processed zip file by moving it to the archive folder
       */
      const archiveZip = (
        fileId: string,
        archiveFolderId: string,
        dryRun: boolean,
      ) =>
        Effect.gen(function* () {
          if (dryRun) {
            yield* progress.logItem(
              `    [DRY RUN] Would archive zip to: ${archiveFolderId}`,
            );
            return true;
          }

          const result = yield* Effect.either(
            googleDrive.moveFile(fileId, archiveFolderId),
          );

          if (result._tag === "Right") {
            yield* progress.logItem("    Archived original zip");
            return true;
          }

          yield* progress.logItem(`    Failed to archive: ${result.left}`);
          return false;
        });

      /**
       * Create archive folder if it doesn't exist
       */
      const getOrCreateArchiveFolder = (parentFolderId: string) =>
        Effect.gen(function* () {
          const archiveFolderName = "_archived_zips";

          // Search for existing archive folder
          const existingFolders = yield* googleDrive.searchFiles({
            fileName: archiveFolderName,
            parentId: parentFolderId,
            sharedDriveId,
          });

          const archiveFolder = existingFolders.find(
            (f) => f.mimeType === "application/vnd.google-apps.folder",
          );

          if (archiveFolder) {
            return archiveFolder.id;
          }

          // Create the archive folder
          const result = yield* googleDrive.createFolder(
            archiveFolderName,
            parentFolderId,
          );
          yield* progress.logItem(
            `Created archive folder: ${archiveFolderName}`,
          );

          return result.folderId;
        });

      /**
       * Extract a single zip file
       */
      const extractZip = (
        attachment: Attachment,
        options: ExtractOptions & {
          /** Pre-loaded hierarchy map for target folder lookup */
          hierarchyMap?: Map<
            string,
            { agencyFolderId: string; yearFolders: Map<number, string> }
          >;
        },
      ) =>
        Effect.gen(function* () {
          const displayFileName = getDisplayFileName(attachment);
          const googleDriveFileName = getGoogleDriveFileName(attachment);

          yield* progress.logItem(`  Processing: ${displayFileName}`);

          // Find the file in Google Drive
          const googleDriveFileId =
            yield* findGoogleDriveFileId(googleDriveFileName);

          // Determine target folder - use hierarchy if available, otherwise fall back to root
          let targetFolderId = attachmentsFolderId;

          if (options.hierarchyMap) {
            const agencyHierarchy = options.hierarchyMap.get(
              attachment.agencyName,
            );
            if (agencyHierarchy) {
              const yearFolderId = agencyHierarchy.yearFolders.get(
                attachment.determinedYear,
              );
              if (yearFolderId) {
                targetFolderId = yearFolderId;
                yield* progress.logItem(
                  `    Target: ${attachment.agencyName}/${attachment.determinedYear}`,
                );
              } else if (agencyHierarchy.agencyFolderId) {
                // Fall back to agency folder if year folder doesn't exist
                targetFolderId = agencyHierarchy.agencyFolderId;
                yield* progress.logItem(
                  `    Target: ${attachment.agencyName} (no year folder for ${attachment.determinedYear})`,
                );
              }
            } else {
              yield* progress.logItem(
                `    WARNING: No hierarchy found for ${attachment.agencyName}, using root folder`,
              );
            }
          }

          // Download the zip file
          yield* progress.logItem("    Downloading zip...");
          const buffer = yield* googleDrive.downloadFile(googleDriveFileId);

          // Create temp directory
          const tempDir = yield* createTempDir(
            `zip-${googleDriveFileId.slice(0, 8)}`,
          );

          const result: ZipExtractionResult = yield* Effect.acquireUseRelease(
            Effect.succeed(tempDir),
            (dir) =>
              Effect.gen(function* () {
                // Extract all files (including nested zips)
                yield* progress.logItem("    Extracting files...");
                const extractedFiles = yield* extractZipRecursive(buffer, dir);

                yield* progress.logItem(
                  `    Extracted ${extractedFiles.length} files (${extractedFiles.filter((f) => f.fromNestedZip).length} from nested zips)`,
                );

                // Upload extracted files to target folder (Agency/Year if hierarchy exists)
                const { uploadedFiles, errors } = yield* uploadExtractedFiles(
                  extractedFiles,
                  targetFolderId,
                  options.dryRun ?? false,
                );

                // Archive the original zip
                let archived = false;
                if (options.dryRun) {
                  yield* progress.logItem(
                    "    [DRY RUN] Would archive original zip",
                  );
                  archived = true;
                } else if (options.archiveFolderId) {
                  archived = yield* archiveZip(
                    googleDriveFileId,
                    options.archiveFolderId,
                    false,
                  );
                } else {
                  yield* progress.logItem(
                    "    WARNING: No archive folder ID, zip not archived",
                  );
                }

                return {
                  fileId: googleDriveFileId,
                  fileName: displayFileName,
                  agencyName: attachment.agencyName,
                  determinedYear: attachment.determinedYear,
                  extractedFiles,
                  uploadedFiles,
                  archived,
                  errors,
                } satisfies ZipExtractionResult;
              }),
            (dir) => cleanupTempDir(dir),
          );

          return result;
        });

      /**
       * Extract all zip files from organized attachments
       */
      const extractAllZips = (
        attachments: OrganizedByAgency,
        options: ExtractOptions = {},
      ) =>
        Effect.gen(function* () {
          // Collect all zip attachments
          const allZips: Attachment[] = [];

          for (const [agencyName, agencyAttachments] of HashMap.entries(
            attachments,
          )) {
            if (
              options.filterAgencies &&
              !options.filterAgencies.includes(agencyName)
            ) {
              continue;
            }

            for (const attachment of List.toArray(agencyAttachments)) {
              if (isZipFile(attachment)) {
                allZips.push(attachment);
              }
            }
          }

          yield* progress.logItem(
            `Found ${allZips.length} zip files to extract`,
          );

          // Apply limit if specified
          const zipsToProcess = options.limit
            ? allZips.slice(0, options.limit)
            : allZips;

          if (options.limit && allZips.length > options.limit) {
            yield* progress.logItem(
              `LIMIT MODE: Processing only ${zipsToProcess.length}/${allZips.length} zips`,
            );
          }

          if (options.dryRun) {
            yield* progress.logItem(
              "DRY RUN MODE: No files will be uploaded or archived",
            );
          }

          // Load hierarchy map to determine target folders for extracted files
          yield* progress.logItem("Loading hierarchy map...");
          const hierarchyMap = yield* hierarchyService.getHierarchyMap();
          yield* progress.logItem(
            `Loaded hierarchy for ${hierarchyMap.size} agencies`,
          );

          // Get or create archive folder
          let archiveFolderId = options.archiveFolderId;
          if (!archiveFolderId && !options.dryRun) {
            archiveFolderId =
              yield* getOrCreateArchiveFolder(attachmentsFolderId);
            yield* progress.logItem(`Archive folder ID: ${archiveFolderId}`);
          }

          yield* progress.startTask(
            "Extracting zip files",
            zipsToProcess.length,
          );

          const results: ZipExtractionResult[] = [];
          const errors: string[] = [];
          let nestedZipsProcessed = 0;

          for (let i = 0; i < zipsToProcess.length; i++) {
            const attachment = zipsToProcess[i];
            const fileName = getDisplayFileName(attachment);

            yield* progress.logProgress(i + 1, `Extracting: ${fileName}`);

            const extractResult = yield* Effect.either(
              extractZip(attachment, {
                ...options,
                archiveFolderId,
                hierarchyMap,
              }),
            );

            if (extractResult._tag === "Right") {
              results.push(extractResult.right);
              nestedZipsProcessed +=
                extractResult.right.extractedFiles.filter(
                  (f) => f.fromNestedZip,
                ).length > 0
                  ? 1
                  : 0;
            } else {
              const errorMsg = `Failed to extract ${fileName}: ${String(extractResult.left)}`;
              errors.push(errorMsg);
              yield* progress.logItem(`  ERROR: ${errorMsg}`);
            }
          }

          yield* progress.complete();

          // Calculate summary
          const report: ExtractionReport = {
            timestamp: new Date().toISOString(),
            totalZips: zipsToProcess.length,
            successfulExtractions: results.length,
            failedExtractions: errors.length,
            totalFilesExtracted: results.reduce(
              (sum, r) => sum + r.extractedFiles.length,
              0,
            ),
            totalFilesUploaded: results.reduce(
              (sum, r) => sum + r.uploadedFiles.length,
              0,
            ),
            nestedZipsProcessed,
            results,
            errors,
          };

          // Write report to file
          yield* fs
            .makeDirectory("logs", { recursive: true })
            .pipe(Effect.ignore);
          yield* fs.writeFileString(
            "logs/zip-extraction-report.json",
            JSON.stringify(report, null, 2),
          );

          // Build manifest entries for extracted files
          const extractedAt = new Date().toISOString();
          const manifestEntries: ExtractedFileManifestEntry[] = [];

          for (const result of results) {
            for (const uploaded of result.uploadedFiles) {
              manifestEntries.push({
                fileId: uploaded.fileId,
                fileName: uploaded.fileName,
                agencyName: result.agencyName,
                determinedYear: result.determinedYear,
                sourceZipFileId: result.fileId,
                sourceZipFileName: result.fileName,
                zipPath: uploaded.zipPath,
                fromNestedZip: uploaded.fromNestedZip,
                extractedAt,
              });
            }
          }

          // Save to manifest (handles merging with existing entries)
          const manifest = yield* manifestService.addEntries(manifestEntries);

          // Log summary
          yield* progress.logItem("");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem("ZIP EXTRACTION SUMMARY");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem(`Total zips processed: ${report.totalZips}`);
          yield* progress.logItem(
            `Successful: ${report.successfulExtractions}`,
          );
          yield* progress.logItem(`Failed: ${report.failedExtractions}`);
          yield* progress.logItem(
            `Files extracted: ${report.totalFilesExtracted}`,
          );
          yield* progress.logItem(
            `Files uploaded: ${report.totalFilesUploaded}`,
          );
          yield* progress.logItem(
            `Nested zips processed: ${report.nestedZipsProcessed}`,
          );
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem(
            "Report written to: logs/zip-extraction-report.json",
          );
          yield* progress.logItem(
            `Manifest written to: ${manifestService.MANIFEST_PATH} (${manifest.entries.length} total entries)`,
          );

          return report;
        });

      return {
        extractAllZips,
        extractZip,
        isZipFile,
      };
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      ProgressLoggerService.Default,
      ConfigService.Default,
      ExtractionManifestService.Default,
      AttachmentHierarchyService.Default,
      NodeContext.layer,
    ],
  },
) {}
