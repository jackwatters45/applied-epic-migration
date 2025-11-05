import { Effect, Schema } from "effect";
import { type GoogleDriveFile, GoogleDriveFileService } from "./file.js";

// Error types
export class FolderStrategyError extends Schema.TaggedError<FolderStrategyError>()(
  "FolderStrategyError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// Types for folder strategy
export interface FileMetadata {
  readonly accountId: string;
  readonly fileName: string;
  readonly fileType: string;
  readonly uploadDate: Date;
}

export interface FolderDeterminationResult {
  readonly folderId: string;
  readonly folderName: string;
  readonly reason: string;
}

export interface GoogleDriveFolder {
  readonly id: string;
  readonly name: string;
  readonly parents: readonly string[];
}

// Folder determination strategy service
export class FolderDeterminationStrategy extends Effect.Service<FolderDeterminationStrategy>()(
  "FolderDeterminationStrategy",
  {
    effect: Effect.gen(function* () {
      const fileService = yield* GoogleDriveFileService;

      const findAccountFolder = (
        accountId: string,
      ): Effect.Effect<GoogleDriveFolder | null, FolderStrategyError> =>
        Effect.gen(function* () {
          const files = yield* Effect.mapError(
            fileService.listFiles(),
            (error) =>
              new FolderStrategyError({
                message: `Failed to list files: ${error.message}`,
              }),
          );

          const folderName = `Account-${accountId}`;
          const folder = files.find(
            (file: GoogleDriveFile) =>
              file.mimeType === "application/vnd.google-apps.folder" &&
              file.name === folderName,
          );

          if (folder) {
            return {
              id: folder.id,
              name: folder.name,
              parents: folder.parents,
            };
          }

          return null;
        });

      const createAccountFolder = (
        accountId: string,
      ): Effect.Effect<GoogleDriveFolder, FolderStrategyError> =>
        Effect.gen(function* () {
          const folderName = `Account-${accountId}`;

          const result = yield* Effect.mapError(
            fileService.createFolder(folderName),
            (error) =>
              new FolderStrategyError({
                message: `Failed to create account folder: ${error.message}`,
              }),
          );

          return {
            id: result.folderId,
            name: result.folderName,
            parents: ["root"],
          };
        });

      const findDateFolder = (
        folderName: string,
      ): Effect.Effect<GoogleDriveFolder | null, FolderStrategyError> =>
        Effect.gen(function* () {
          const files = yield* Effect.mapError(
            fileService.listFiles(),
            (error) =>
              new FolderStrategyError({
                message: `Failed to list files: ${error.message}`,
              }),
          );

          const folder = files.find(
            (file: GoogleDriveFile) =>
              file.mimeType === "application/vnd.google-apps.folder" &&
              file.name === folderName,
          );

          if (folder) {
            return {
              id: folder.id,
              name: folder.name,
              parents: folder.parents,
            };
          }

          return null;
        });

      const createDateFolder = (
        folderName: string,
      ): Effect.Effect<GoogleDriveFolder, FolderStrategyError> =>
        Effect.gen(function* () {
          const result = yield* Effect.mapError(
            fileService.createFolder(folderName),
            (error) =>
              new FolderStrategyError({
                message: `Failed to create date folder: ${error.message}`,
              }),
          );

          return {
            id: result.folderId,
            name: result.folderName,
            parents: ["root"],
          };
        });

      return {
        determineFolder: (fileMetadata: FileMetadata) =>
          Effect.gen(function* () {
            // Account-based strategy
            const existingFolder = yield* findAccountFolder(
              fileMetadata.accountId,
            );

            if (existingFolder) {
              return {
                folderId: existingFolder.id,
                folderName: existingFolder.name,
                reason: "Found existing account folder",
              } as const;
            }

            // If not found, create new folder for this account
            const newFolder = yield* createAccountFolder(
              fileMetadata.accountId,
            );

            return {
              folderId: newFolder.id,
              folderName: newFolder.name,
              reason: "Created new account folder",
            } as const;
          }),

        // Alternative date-based strategy
        determineDateFolder: (fileMetadata: FileMetadata) =>
          Effect.gen(function* () {
            const year = fileMetadata.uploadDate.getFullYear();
            const month = String(
              fileMetadata.uploadDate.getMonth() + 1,
            ).padStart(2, "0");
            const folderName = `${year}-${month}`;

            // First, try to find existing folder for this date
            const existingFolder = yield* findDateFolder(folderName);

            if (existingFolder) {
              return {
                folderId: existingFolder.id,
                folderName: existingFolder.name,
                reason: "Found existing date-based folder",
              } as const;
            }

            // If not found, create new folder for this date
            const newFolder = yield* createDateFolder(folderName);

            return {
              folderId: newFolder.id,
              folderName: newFolder.name,
              reason: "Created new date-based folder",
            } as const;
          }),
      } as const;
    }),
    dependencies: [GoogleDriveFileService.Default],
  },
) {}
