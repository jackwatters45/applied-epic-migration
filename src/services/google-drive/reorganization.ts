import { Effect, Schema } from "effect";
import type { AttachmentData } from "../../lib/type.js";
import { GoogleDriveAuthService } from "./auth.js";
import { GoogleDriveFileService } from "./file.js";

// Extended attachment type with year resolution
export interface OrganizedAttachment extends AttachmentData {
  readonly key: string;
  readonly determinedYear: number;
}

// Error types for Google Drive reorganization
export class GoogleDriveReorganizationError extends Schema.TaggedError<GoogleDriveReorganizationError>()(
  "GoogleDriveReorganizationError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// Types for reorganization
export interface ReorganizationResult {
  readonly success: boolean;
  readonly totalFiles: number;
  readonly processedFiles: number;
  readonly failedFiles: number;
  readonly errors: readonly string[];
}

export interface TargetFolderStructure {
  readonly clientName: string;
  readonly year: number;
  readonly folderPath: string[];
}

export interface FolderCreationResult {
  readonly folderId: string;
  readonly folderPath: string[];
  readonly created: readonly string[];
  readonly existing: readonly string[];
}

// Google Drive Reorganization Service
export class GoogleDriveReorganizationService extends Effect.Service<GoogleDriveReorganizationService>()(
  "GoogleDriveReorganizationService",
  {
    effect: Effect.gen(function* () {
      const fileService = yield* GoogleDriveFileService;
      const authService = yield* GoogleDriveAuthService;

      // Helper to normalize year (2018-2023 map to 2023)
      const normalizeYear = (year: number): number => {
        return year >= 2018 && year <= 2023 ? 2023 : year;
      };

      // Determine target folder structure for an attachment
      const determineTargetStructure = (
        attachment: OrganizedAttachment,
      ): TargetFolderStructure => {
        const clientName = attachment.key || "UnknownClient";
        const year = normalizeYear(
          attachment.determinedYear || new Date().getFullYear(),
        );

        // Default to just Client/Year structure without product classification
        const folderPath = [clientName, year.toString()];

        return {
          clientName,
          year,
          folderPath,
        };
      };

      // Create folder structure recursively
      const createFolderStructure = (
        structure: TargetFolderStructure,
        rootFolderId = "root",
      ): Effect.Effect<FolderCreationResult, GoogleDriveReorganizationError> =>
        Effect.gen(function* () {
          const created: string[] = [];
          const existing: string[] = [];
          let currentParentId = rootFolderId;

          for (const folderName of structure.folderPath) {
            // Check if folder already exists
            const existingFiles = yield* Effect.mapError(
              fileService.listFiles({ parentId: currentParentId }),
              (error) =>
                new GoogleDriveReorganizationError({
                  message: `Failed to list files in parent folder: ${error.message}`,
                }),
            );

            const existingFolder = existingFiles.find(
              (file) =>
                file.mimeType === "application/vnd.google-apps.folder" &&
                file.name === folderName,
            );

            if (existingFolder) {
              existing.push(folderName);
              currentParentId = existingFolder.id;
            } else {
              // Create new folder
              const result = yield* Effect.mapError(
                fileService.createFolder(folderName, currentParentId),
                (error) =>
                  new GoogleDriveReorganizationError({
                    message: `Failed to create folder '${folderName}': ${error.message}`,
                  }),
              );

              created.push(folderName);
              currentParentId = result.folderId;
            }
          }

          return {
            folderId: currentParentId,
            folderPath: structure.folderPath,
            created,
            existing,
          } as const;
        });

      // Process a single attachment
      const processAttachment = (
        attachment: OrganizedAttachment,
        rootFolderId = "root",
        dryRun = false,
      ): Effect.Effect<
        {
          success: boolean;
          attachment: OrganizedAttachment;
          targetPath: string[];
        },
        GoogleDriveReorganizationError
      > =>
        Effect.gen(function* () {
          // Determine target structure
          const targetStructure = determineTargetStructure(attachment);

          if (!dryRun) {
            // Create folder structure
            yield* createFolderStructure(targetStructure, rootFolderId);
          }

          // For now, we'll just return the target path since we don't have the actual Google Drive file ID
          // In a real implementation, you'd need to map the attachment to its Google Drive file
          return {
            success: true,
            attachment,
            targetPath: targetStructure.folderPath,
          } as const;
        });

      // Process all attachments
      const processAttachments = (
        attachments: readonly OrganizedAttachment[],
        options: { dryRun?: boolean; rootFolderId?: string } = {},
      ): Effect.Effect<ReorganizationResult, GoogleDriveReorganizationError> =>
        Effect.gen(function* () {
          const { dryRun = false, rootFolderId = "root" } = options;
          const errors: string[] = [];
          let processedCount = 0;

          // Process each attachment
          yield* Effect.forEach(
            attachments,
            (attachment) =>
              Effect.gen(function* () {
                const result = yield* Effect.catchAll(
                  processAttachment(attachment, rootFolderId, dryRun),
                  (error) =>
                    Effect.sync(() => {
                      const errorMsg = `Failed to process attachment '${attachment.formatted.description}': ${error.message}`;
                      errors.push(errorMsg);
                      console.error(errorMsg);
                      return {
                        success: false,
                        attachment,
                        error: errorMsg,
                      } as const;
                    }),
                );

                if (dryRun && result.success && "targetPath" in result) {
                  console.log(
                    `[DRY RUN] Would move '${attachment.formatted.description}' to: ${result.targetPath.join("/")}`,
                  );
                }

                processedCount++;
                return result;
              }),
            { concurrency: 10 }, // Process up to 10 attachments concurrently
          );

          return {
            success: errors.length === 0,
            totalFiles: attachments.length,
            processedFiles: processedCount,
            failedFiles: errors.length,
            errors,
          } as const;
        });

      return {
        // Process attachments with year resolution
        processOrganizedAttachments: (
          organizedAttachments: Map<string, readonly OrganizedAttachment[]>,
          options: { dryRun?: boolean; rootFolderId?: string } = {},
        ) =>
          Effect.gen(function* () {
            // Flatten all attachments from the organized map
            const allAttachments = Array.from(
              organizedAttachments.values(),
            ).flat();

            console.log(
              `Processing ${allAttachments.length} attachments for reorganization...`,
            );

            if (options.dryRun) {
              console.log("=== DRY RUN MODE - No files will be moved ===");
            }

            const result = yield* processAttachments(allAttachments, options);

            console.log("\n=== Reorganization Summary ===");
            console.log(`Total files: ${result.totalFiles}`);
            console.log(`Processed: ${result.processedFiles}`);
            console.log(`Failed: ${result.failedFiles}`);

            if (result.errors.length > 0) {
              console.log("\nErrors encountered:");
              result.errors.forEach((error) => {
                console.log(`  - ${error}`);
              });
            }

            return result;
          }),

        // Get service account info for verification
        getServiceAccountInfo: () =>
          Effect.gen(function* () {
            const email = yield* authService.getServiceAccountEmail();
            return {
              serviceAccountEmail: email,
              message:
                "Verify this service account has access to source and target folders",
            };
          }),

        // Helper to normalize year
        normalizeYear,
      } as const;
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      GoogleDriveAuthService.Default,
    ],
  },
) {}
