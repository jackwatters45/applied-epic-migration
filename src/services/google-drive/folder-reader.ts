import { Effect, Schema } from "effect";
import { GoogleDriveAuthService } from "./auth.js";
import { type GoogleDriveFile, GoogleDriveFileService } from "./file.js";
import { FolderDeterminationStrategy } from "./folder-strategy.js";

// Error types for folder reading orchestration
export class FolderReadError extends Schema.TaggedError<FolderReadError>()(
  "FolderReadError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// Types for folder reading results
export interface FolderContent {
  readonly folderId: string;
  readonly folderName: string;
  readonly files: readonly GoogleDriveFile[];
  readonly subfolders: readonly GoogleDriveFile[];
}

export interface FolderReadOptions {
  readonly folderId?: string;
  readonly folderName?: string;
  readonly includeSubfolders?: boolean;
  readonly recursive?: boolean;
  readonly maxDepth?: number;
}

export interface FolderReadResult {
  readonly success: boolean;
  readonly content: readonly FolderContent[];
  readonly totalFiles: number;
  readonly totalFolders: number;
  readonly message: string;
}

// Folder Reader Orchestrator Service
export class FolderReaderOrchestrator extends Effect.Service<FolderReaderOrchestrator>()(
  "FolderReaderOrchestrator",
  {
    effect: Effect.gen(function* () {
      const fileService = yield* GoogleDriveFileService;
      const folderStrategy = yield* FolderDeterminationStrategy;

      const readFolder = (
        folderId: string,
        options: FolderReadOptions = {},
      ): Effect.Effect<FolderContent, FolderReadError> =>
        Effect.gen(function* () {
          // Get all files and folders in the specified folder
          const allItems = yield* Effect.mapError(
            fileService.listFiles(folderId),
            (error) =>
              new FolderReadError({
                message: `Failed to list folder contents: ${error.message}`,
                status: 500,
              }),
          );

          // Separate files from folders
          const files = allItems.filter(
            (item) => item.mimeType !== "application/vnd.google-apps.folder",
          );
          const subfolders = allItems.filter(
            (item) => item.mimeType === "application/vnd.google-apps.folder",
          );

          // Get folder name if not provided
          let folderName = options.folderName;
          if (!folderName && allItems.length > 0) {
            // Try to get folder details from the first item's parent
            const firstItem = allItems[0];
            if (firstItem.parents.length > 0) {
              const parentFolderId = firstItem.parents[0];
              const parentItems = yield* Effect.mapError(
                fileService.listFiles(),
                (error) =>
                  new FolderReadError({
                    message: `Failed to get parent folder info: ${error.message}`,
                    status: 500,
                  }),
              );
              const parentFolder = parentItems.find(
                (item) => item.id === parentFolderId,
              );
              folderName = parentFolder?.name || folderId;
            }
          }

          return {
            folderId,
            folderName: folderName || folderId,
            files,
            subfolders,
          };
        });

      const readFolderRecursive = (
        folderId: string,
        options: FolderReadOptions = {},
        currentDepth = 0,
      ): Effect.Effect<FolderContent[], FolderReadError> =>
        Effect.gen(function* () {
          const maxDepth = options.maxDepth ?? 3;
          if (currentDepth >= maxDepth) {
            return [];
          }

          // Read current folder
          const currentFolder = yield* readFolder(folderId, options);
          const results: FolderContent[] = [currentFolder];

          // Recursively read subfolders if enabled
          if (options.recursive && options.includeSubfolders) {
            for (const subfolder of currentFolder.subfolders) {
              const subfolderResults = yield* readFolderRecursive(
                subfolder.id,
                options,
                currentDepth + 1,
              );
              results.push(...subfolderResults);
            }
          }

          return results;
        });

      const readFolderByName = (
        folderName: string,
        options: FolderReadOptions = {},
      ): Effect.Effect<FolderContent, FolderReadError> =>
        Effect.gen(function* () {
          // First, find the folder by name
          const allItems = yield* Effect.mapError(
            fileService.listFiles(),
            (error) =>
              new FolderReadError({
                message: `Failed to search for folder: ${error.message}`,
                status: 500,
              }),
          );

          const targetFolder = allItems.find(
            (item) =>
              item.mimeType === "application/vnd.google-apps.folder" &&
              item.name === folderName,
          );

          if (!targetFolder) {
            return yield* Effect.fail(
              new FolderReadError({
                message: `Folder '${folderName}' not found`,
                status: 404,
              }),
            );
          }

          // Read the found folder
          return yield* readFolder(targetFolder.id, { ...options, folderName });
        });

      const readAllAccountFolders = (
        accountId: string,
        options: FolderReadOptions = {},
      ): Effect.Effect<FolderContent[], FolderReadError> =>
        Effect.gen(function* () {
          // Use folder strategy to determine the account folder
          const folderResult = yield* Effect.mapError(
            folderStrategy.determineFolder({
              accountId,
              fileName: "",
              fileType: "",
              uploadDate: new Date(),
            }),
            (error) =>
              new FolderReadError({
                message: `Failed to determine account folder: ${error.message}`,
                status: 500,
              }),
          );

          // Read the account folder (and subfolders if requested)
          if (options.recursive) {
            return yield* readFolderRecursive(folderResult.folderId, options);
          }
          const folderContent = yield* readFolder(folderResult.folderId, {
            ...options,
            folderName: folderResult.folderName,
          });
          return [folderContent];
        });

      const getFolderSummary = (
        contents: readonly FolderContent[],
      ): Effect.Effect<FolderReadResult, FolderReadError> =>
        Effect.sync(() => {
          const totalFiles = contents.reduce(
            (sum, folder) => sum + folder.files.length,
            0,
          );
          const totalFolders = contents.reduce(
            (sum, folder) => sum + folder.subfolders.length,
            0,
          );

          return {
            success: true,
            content: contents,
            totalFiles,
            totalFolders,
            message: `Successfully read ${contents.length} folder(s) with ${totalFiles} file(s) and ${totalFolders} subfolder(s)`,
          };
        });

      return {
        // Read a specific folder by ID
        readFolderById: (folderId: string, options?: FolderReadOptions) =>
          Effect.gen(function* () {
            const content = yield* readFolder(folderId, options);
            return yield* getFolderSummary([content]);
          }),

        // Read a specific folder by name
        readFolderByName: (folderName: string, options?: FolderReadOptions) =>
          Effect.gen(function* () {
            const content = yield* readFolderByName(folderName, options);
            return yield* getFolderSummary([content]);
          }),

        // Read all folders for a specific account
        readAccountFolders: (accountId: string, options?: FolderReadOptions) =>
          Effect.gen(function* () {
            const contents = yield* readAllAccountFolders(accountId, options);
            return yield* getFolderSummary(contents);
          }),

        // Read folder recursively with subfolders
        readFolderRecursive: (folderId: string, options?: FolderReadOptions) =>
          Effect.gen(function* () {
            const contents = yield* readFolderRecursive(folderId, {
              ...options,
              recursive: true,
              includeSubfolders: true,
            });
            return yield* getFolderSummary(contents);
          }),

        // List all root-level folders
        listRootFolders: () =>
          Effect.gen(function* () {
            const allItems = yield* Effect.mapError(
              fileService.listFiles(),
              (error) =>
                new FolderReadError({
                  message: `Failed to list root folders: ${error.message}`,
                  status: 500,
                }),
            );

            const rootFolders = allItems.filter(
              (item) => item.mimeType === "application/vnd.google-apps.folder",
            );

            return {
              success: true,
              content: rootFolders.map((folder) => ({
                folderId: folder.id,
                folderName: folder.name,
                files: [], // Root folders listing doesn't include files
                subfolders: [],
              })),
              totalFiles: 0,
              totalFolders: rootFolders.length,
              message: `Found ${rootFolders.length} root folder(s)`,
            };
          }),

        // Search for folders by name pattern
        searchFolders: (pattern: string) =>
          Effect.gen(function* () {
            const allItems = yield* Effect.mapError(
              fileService.listFiles(),
              (error) =>
                new FolderReadError({
                  message: `Failed to search folders: ${error.message}`,
                  status: 500,
                }),
            );

            const regex = new RegExp(pattern, "i");
            const matchingFolders = allItems.filter(
              (item) =>
                item.mimeType === "application/vnd.google-apps.folder" &&
                regex.test(item.name),
            );

            return {
              success: true,
              content: matchingFolders.map((folder) => ({
                folderId: folder.id,
                folderName: folder.name,
                files: [],
                subfolders: [],
              })),
              totalFiles: 0,
              totalFolders: matchingFolders.length,
              message: `Found ${matchingFolders.length} folder(s) matching pattern '${pattern}'`,
            };
          }),
      } as const;
    }),
    dependencies: [
      GoogleDriveAuthService.Default,
      GoogleDriveFileService.Default,
      FolderDeterminationStrategy.Default,
    ],
  },
) {}
