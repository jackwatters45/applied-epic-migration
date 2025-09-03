import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { type GoogleDriveFile, GoogleDriveFileService } from "./file.js";

// Error types
export class FolderStrategyError {
  readonly _tag = "FolderStrategyError";
  constructor(
    readonly message: string,
    readonly status?: number,
  ) {}
}

// Types for folder strategy
export interface FileMetadata {
  accountId: string;
  fileName: string;
  fileType: string;
  uploadDate: Date;
}

export interface FolderDeterminationResult {
  folderId: string;
  folderName: string;
  reason: string;
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
  parents: string[];
}

// Folder determination strategy interface
export interface FolderDeterminationStrategy {
  determineFolder: (
    fileMetadata: FileMetadata,
  ) => Effect.Effect<FolderDeterminationResult, FolderStrategyError>;
}

// Helper functions for account-based folder strategy
const findAccountFolder = (
  fileService: GoogleDriveFileService,
  accountId: string,
): Effect.Effect<GoogleDriveFolder | null, FolderStrategyError> =>
  Effect.gen(function* () {
    const files = yield* Effect.mapError(
      fileService.listFiles(),
      (error) =>
        new FolderStrategyError(`Failed to list files: ${error.message}`),
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
  fileService: GoogleDriveFileService,
  accountId: string,
): Effect.Effect<GoogleDriveFolder, FolderStrategyError> =>
  Effect.gen(function* () {
    const folderName = `Account-${accountId}`;

    const result = yield* Effect.mapError(
      fileService.createFolder(folderName),
      (error) =>
        new FolderStrategyError(
          `Failed to create account folder: ${error.message}`,
        ),
    );

    return {
      id: result.folderId,
      name: result.folderName,
      parents: ["root"],
    };
  });

// Create account-based folder strategy
const createAccountBasedFolderStrategy = (
  fileService: GoogleDriveFileService,
): FolderDeterminationStrategy => ({
  determineFolder: (fileMetadata: FileMetadata) =>
    Effect.gen(function* () {
      // First, try to find existing folder for this account
      const existingFolder = yield* findAccountFolder(
        fileService,
        fileMetadata.accountId,
      );

      if (existingFolder) {
        return {
          folderId: existingFolder.id,
          folderName: existingFolder.name,
          reason: "Found existing account folder",
        };
      }

      // If not found, create new folder for this account
      const newFolder = yield* createAccountFolder(
        fileService,
        fileMetadata.accountId,
      );

      return {
        folderId: newFolder.id,
        folderName: newFolder.name,
        reason: "Created new account folder",
      };
    }),
});

// Helper functions for date-based folder strategy
const findDateFolder = (
  fileService: GoogleDriveFileService,
  folderName: string,
): Effect.Effect<GoogleDriveFolder | null, FolderStrategyError> =>
  Effect.gen(function* () {
    const files = yield* Effect.mapError(
      fileService.listFiles(),
      (error) =>
        new FolderStrategyError(`Failed to list files: ${error.message}`),
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
  fileService: GoogleDriveFileService,
  folderName: string,
): Effect.Effect<GoogleDriveFolder, FolderStrategyError> =>
  Effect.gen(function* () {
    const result = yield* Effect.mapError(
      fileService.createFolder(folderName),
      (error) =>
        new FolderStrategyError(
          `Failed to create date folder: ${error.message}`,
        ),
    );

    return {
      id: result.folderId,
      name: result.folderName,
      parents: ["root"],
    };
  });

// Create date-based folder strategy
const createDateBasedFolderStrategy = (
  fileService: GoogleDriveFileService,
): FolderDeterminationStrategy => ({
  determineFolder: (fileMetadata: FileMetadata) =>
    Effect.gen(function* () {
      const year = fileMetadata.uploadDate.getFullYear();
      const month = String(fileMetadata.uploadDate.getMonth() + 1).padStart(
        2,
        "0",
      );
      const folderName = `${year}-${month}`;

      // First, try to find existing folder for this date
      const existingFolder = yield* findDateFolder(fileService, folderName);

      if (existingFolder) {
        return {
          folderId: existingFolder.id,
          folderName: existingFolder.name,
          reason: "Found existing date-based folder",
        };
      }

      // If not found, create new folder for this date
      const newFolder = yield* createDateFolder(fileService, folderName);

      return {
        folderId: newFolder.id,
        folderName: newFolder.name,
        reason: "Created new date-based folder",
      };
    }),
});

// Context tags for dependency injection
export const FolderDeterminationStrategy =
  Context.GenericTag<FolderDeterminationStrategy>(
    "@services/FolderDeterminationStrategy",
  );

// Layer implementations for each strategy
export const AccountBasedFolderStrategyLive = Layer.effect(
  FolderDeterminationStrategy,
  Effect.gen(function* () {
    const fileService = yield* GoogleDriveFileService;
    return createAccountBasedFolderStrategy(fileService);
  }),
);

export const DateBasedFolderStrategyLive = Layer.effect(
  FolderDeterminationStrategy,
  Effect.gen(function* () {
    const fileService = yield* GoogleDriveFileService;
    return createDateBasedFolderStrategy(fileService);
  }),
);
