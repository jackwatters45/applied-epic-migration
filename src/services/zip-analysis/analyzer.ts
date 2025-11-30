import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List, Schema } from "effect";
import { ConfigService } from "../../lib/config.js";
import type { Attachment, OrganizedByAgency } from "../../lib/type.js";
import { GoogleDriveFileService } from "../google-drive/file.js";
import { ProgressLoggerService } from "../lib/progress.js";
import { type ZipContents, ZipInspectorService } from "./inspector.js";

// ============================================================================
// Types
// ============================================================================

export interface ZipAnalysisResult {
  readonly fileId: string;
  readonly fileName: string;
  readonly agencyName: string;
  readonly determinedYear: number;
  readonly zipContents: ZipContents;
  /** Whether the metadata year matches a year folder in the zip */
  readonly yearMatch: boolean;
  /** Classification of zip structure */
  readonly classification:
    | "single_year_folder"
    | "multiple_year_folders"
    | "flat_files_only"
    | "mixed_content"
    | "non_year_folders";
}

export interface ZipAnalysisReport {
  readonly timestamp: string;
  readonly totalZips: number;
  readonly summary: {
    readonly singleYearFolder: number;
    readonly multipleYearFolders: number;
    readonly flatFilesOnly: number;
    readonly mixedContent: number;
    readonly nonYearFolders: number;
  };
  readonly yearMatchAnalysis: {
    readonly metadataMatchesZipFolder: number;
    readonly metadataDiffersFromZipFolder: number;
  };
  readonly details: readonly ZipAnalysisResult[];
  readonly errors: readonly string[];
}

export interface AnalyzeOptions {
  /** Maximum number of zips to analyze (for testing) */
  readonly limit?: number | undefined;
  /** Only analyze zips from specific agencies */
  readonly filterAgencies?: readonly string[] | undefined;
}

// Error type for zip analysis
export class ZipAnalyzerError extends Schema.TaggedError<ZipAnalyzerError>()(
  "ZipAnalyzerError",
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

export class ZipAnalyzerService extends Effect.Service<ZipAnalyzerService>()(
  "ZipAnalyzerService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;
      const inspector = yield* ZipInspectorService;
      const progress = yield* ProgressLoggerService;
      const fs = yield* FileSystem.FileSystem;
      const config = yield* ConfigService;

      // Get the attachments folder ID where all attachment files are stored
      const attachmentsFolderId = yield* config.attachmentsFolderId;
      // Get the shared drive ID (attachments are in the same shared drive as clients)
      const sharedDriveId = yield* config.sharedClientDriveId;

      /**
       * Check if an attachment is a zip file
       */
      const isZipFile = (attachment: Attachment): boolean => {
        const ext = attachment.formatted.fileExtension.toLowerCase();
        return ext === ".zip" || ext === "zip";
      };

      /**
       * Classify the zip structure
       */
      const classifyZip = (
        contents: ZipContents,
      ): ZipAnalysisResult["classification"] => {
        const hasYearFolders = contents.detectedYears.length > 0;
        const hasNonYearFolders =
          contents.topLevelFolders.length > contents.detectedYears.length;
        const hasTopLevelFiles = contents.topLevelFiles.length > 0;

        if (hasTopLevelFiles && !hasYearFolders && !hasNonYearFolders) {
          return "flat_files_only";
        }

        if (
          hasYearFolders &&
          contents.detectedYears.length === 1 &&
          !hasNonYearFolders &&
          !hasTopLevelFiles
        ) {
          return "single_year_folder";
        }

        if (
          hasYearFolders &&
          contents.detectedYears.length > 1 &&
          !hasNonYearFolders &&
          !hasTopLevelFiles
        ) {
          return "multiple_year_folders";
        }

        if (!hasYearFolders && hasNonYearFolders) {
          return "non_year_folders";
        }

        return "mixed_content";
      };

      /**
       * Get the display filename for an attachment (user-friendly name from description)
       */
      const getDisplayFileName = (attachment: Attachment): string => {
        const description = attachment.formatted.description;
        const extension = attachment.formatted.fileExtension.toLowerCase();

        // If description already ends with the extension, don't add it again
        if (description.toLowerCase().endsWith(extension)) {
          return description;
        }

        // Otherwise, append the extension
        return `${description}${extension}`;
      };

      /**
       * Get the Google Drive filename for an attachment (UUID-based name from newPath)
       * Files in Google Drive are named with the UUID, e.g., "64bc845d-fcbf-4e42-9152-8fa38efdef7e.zip"
       */
      const getGoogleDriveFileName = (attachment: Attachment): string => {
        // newPath format: "\\IGOCINC-01\\64bc845d-fcbf-4e42-9152-8fa38efdef7e.zip"
        const newPath = attachment.formatted.newPath;
        // Extract just the filename from the path
        const fileName = newPath.split("\\").pop() || newPath;
        return fileName;
      };

      /**
       * Find the Google Drive file ID by searching for the file by name
       * Searches in the attachments folder where all attachment files are stored
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
              new ZipAnalyzerError({
                message: `File not found in Google Drive: ${fileName}`,
                type: "FILE_NOT_FOUND",
                details: `Searched in attachments folder: ${attachmentsFolderId}`,
              }),
            );
          }

          // If multiple files found, use the first one but log a warning
          if (searchResults.length > 1) {
            yield* progress.logItem(
              `  WARNING: Found ${searchResults.length} files named "${fileName}", using first match`,
            );
          }

          return searchResults[0].id;
        });

      /**
       * Analyze a single zip file
       */
      const analyzeZip = (attachment: Attachment) =>
        Effect.gen(function* () {
          const displayFileName = getDisplayFileName(attachment);
          const googleDriveFileName = getGoogleDriveFileName(attachment);

          // Find the file in Google Drive by its UUID-based name (in attachments folder)
          const googleDriveFileId =
            yield* findGoogleDriveFileId(googleDriveFileName);

          // Download the zip file using the Google Drive file ID
          const buffer = yield* googleDrive.downloadFile(googleDriveFileId);

          // Inspect the zip contents
          const zipContents = yield* inspector.inspectZipBuffer(buffer);

          // Check if metadata year matches a year in the zip
          const yearMatch = zipContents.detectedYears.includes(
            attachment.determinedYear,
          );

          // Classify the structure
          const classification = classifyZip(zipContents);

          const result: ZipAnalysisResult = {
            fileId: googleDriveFileId,
            fileName: displayFileName,
            agencyName: attachment.agencyName,
            determinedYear: attachment.determinedYear,
            zipContents,
            yearMatch,
            classification,
          };

          return result;
        });

      /**
       * Analyze all zip files in the organized attachments
       */
      const analyzeZips = (
        attachments: OrganizedByAgency,
        options: AnalyzeOptions = {},
      ) =>
        Effect.gen(function* () {
          // Collect all zip attachments
          const allZips: Attachment[] = [];

          for (const [agencyName, agencyAttachments] of HashMap.entries(
            attachments,
          )) {
            // Filter by agency if specified
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
            `Found ${allZips.length} zip files to analyze`,
          );

          // Apply limit if specified
          const zipsToAnalyze = options.limit
            ? allZips.slice(0, options.limit)
            : allZips;

          if (options.limit && allZips.length > options.limit) {
            yield* progress.logItem(
              `LIMIT MODE: Analyzing only ${zipsToAnalyze.length}/${allZips.length} zips`,
            );
          }

          yield* progress.startTask(
            "Analyzing zip files",
            zipsToAnalyze.length,
          );

          const results: ZipAnalysisResult[] = [];
          const errors: string[] = [];

          for (let i = 0; i < zipsToAnalyze.length; i++) {
            const attachment = zipsToAnalyze[i];
            const fileName = getDisplayFileName(attachment);

            yield* progress.logProgress(i + 1, `Analyzing: ${fileName}`);

            const analyzeResult = yield* Effect.either(analyzeZip(attachment));

            if (analyzeResult._tag === "Right") {
              results.push(analyzeResult.right);
              yield* progress.logItem(
                `  ${fileName}: ${analyzeResult.right.classification} (years: ${analyzeResult.right.zipContents.detectedYears.join(", ") || "none"})`,
              );
            } else {
              const errorMsg = `Failed to analyze ${fileName}: ${String(analyzeResult.left)}`;
              errors.push(errorMsg);
              yield* progress.logItem(`  ERROR: ${errorMsg}`);
            }
          }

          yield* progress.complete();

          // Calculate summary statistics
          const summary = {
            singleYearFolder: results.filter(
              (r) => r.classification === "single_year_folder",
            ).length,
            multipleYearFolders: results.filter(
              (r) => r.classification === "multiple_year_folders",
            ).length,
            flatFilesOnly: results.filter(
              (r) => r.classification === "flat_files_only",
            ).length,
            mixedContent: results.filter(
              (r) => r.classification === "mixed_content",
            ).length,
            nonYearFolders: results.filter(
              (r) => r.classification === "non_year_folders",
            ).length,
          };

          const yearMatchAnalysis = {
            metadataMatchesZipFolder: results.filter((r) => r.yearMatch).length,
            metadataDiffersFromZipFolder: results.filter((r) => !r.yearMatch)
              .length,
          };

          const report: ZipAnalysisReport = {
            timestamp: new Date().toISOString(),
            totalZips: results.length,
            summary,
            yearMatchAnalysis,
            details: results,
            errors,
          };

          // Write report to file
          yield* fs
            .makeDirectory("logs", { recursive: true })
            .pipe(Effect.ignore);
          yield* fs.writeFileString(
            "logs/zip-analysis-report.json",
            JSON.stringify(report, null, 2),
          );

          // Log summary
          yield* progress.logItem("");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem("ZIP ANALYSIS SUMMARY");
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem(`Total zips analyzed: ${results.length}`);
          yield* progress.logItem(
            `  Single year folder: ${summary.singleYearFolder}`,
          );
          yield* progress.logItem(
            `  Multiple year folders: ${summary.multipleYearFolders}`,
          );
          yield* progress.logItem(
            `  Flat files only: ${summary.flatFilesOnly}`,
          );
          yield* progress.logItem(`  Mixed content: ${summary.mixedContent}`);
          yield* progress.logItem(
            `  Non-year folders: ${summary.nonYearFolders}`,
          );
          yield* progress.logItem("");
          yield* progress.logItem("Year Match Analysis:");
          yield* progress.logItem(
            `  Metadata matches zip folder: ${yearMatchAnalysis.metadataMatchesZipFolder}`,
          );
          yield* progress.logItem(
            `  Metadata differs from zip folder: ${yearMatchAnalysis.metadataDiffersFromZipFolder}`,
          );
          yield* progress.logItem("=".repeat(60));
          yield* progress.logItem(
            "Report written to: logs/zip-analysis-report.json",
          );

          return report;
        });

      return {
        analyzeZips,
        analyzeZip,
        isZipFile,
      };
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      ZipInspectorService.Default,
      ProgressLoggerService.Default,
      ConfigService.Default,
      NodeContext.layer,
    ],
  },
) {}
