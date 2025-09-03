import * as fs from "node:fs";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { google } from "googleapis";
import { type GoogleDriveAuthError, GoogleDriveAuthService } from "./auth.js";

// Error type for Google Drive file operations
export class GoogleDriveFileError {
  readonly _tag = "GoogleDriveFileError";
  constructor(
    readonly message: string,
    readonly status?: number,
  ) {}
}

// Types for file operations
export interface UploadResult {
  success: boolean;
  fileId: string;
  fileName: string;
  message: string;
}

export interface MoveFileResult {
  success: boolean;
  fileId: string;
  message: string;
}

export interface CreateFolderResult {
  success: boolean;
  folderId: string;
  folderName: string;
  message: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  size?: string;
  modifiedTime?: string;
}

// Google Drive file service interface
export interface GoogleDriveFileService {
  listFiles: (
    parentId?: string,
  ) => Effect.Effect<
    GoogleDriveFile[],
    GoogleDriveFileError | GoogleDriveAuthError
  >;

  uploadFile: (
    filePath: string,
    fileName: string,
    parentId?: string,
  ) => Effect.Effect<UploadResult, GoogleDriveFileError | GoogleDriveAuthError>;

  moveFile: (
    fileId: string,
    newParentId: string,
  ) => Effect.Effect<
    MoveFileResult,
    GoogleDriveFileError | GoogleDriveAuthError
  >;

  createFolder: (
    folderName: string,
    parentId?: string,
  ) => Effect.Effect<
    CreateFolderResult,
    GoogleDriveFileError | GoogleDriveAuthError
  >;
}

// Google Drive file service implementation using functional approach
const createGoogleDriveFileService = (
  authService: GoogleDriveAuthService,
): GoogleDriveFileService => ({
  listFiles: (parentId = "root") =>
    Effect.gen(function* () {
      const authClient = yield* authService.getAuthenticatedClient();
      const drive = google.drive({ version: "v3", auth: authClient });

      const query =
        parentId === "root"
          ? "trashed=false"
          : `parents in '${parentId}' and trashed=false`;

      const response = yield* Effect.tryPromise({
        try: () =>
          drive.files.list({
            q: query,
            pageSize: 100,
            fields: "files(id,name,mimeType,parents,size,modifiedTime)",
            orderBy: "name",
          }),
        catch: (error) =>
          new GoogleDriveFileError(`Failed to list files: ${error}`),
      });

      const files = response.data.files || [];
      return files.map((file) => {
        const result: GoogleDriveFile = {
          id: file.id || "",
          name: file.name || "",
          mimeType: file.mimeType || "",
          parents: file.parents || [],
        };

        if (file.size) result.size = file.size;
        if (file.modifiedTime) result.modifiedTime = file.modifiedTime;

        return result;
      });
    }),

  uploadFile: (filePath, fileName, parentId = "root") =>
    Effect.gen(function* () {
      const authClient = yield* authService.getAuthenticatedClient();
      const drive = google.drive({ version: "v3", auth: authClient });

      const fileMetadata = {
        name: fileName,
        parents: [parentId],
      };

      const media = {
        body: fs.createReadStream(filePath),
      };

      const response = yield* Effect.tryPromise({
        try: () =>
          drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: "id,name",
          }),
        catch: (error) =>
          new GoogleDriveFileError(`Failed to upload file: ${error}`),
      });

      return {
        success: true,
        fileId: response.data.id!,
        fileName: response.data.name!,
        message: `File '${fileName}' uploaded successfully`,
      };
    }),

  moveFile: (fileId, newParentId) =>
    Effect.gen(function* () {
      const authClient = yield* authService.getAuthenticatedClient();
      const drive = google.drive({ version: "v3", auth: authClient });

      // First get the current parents
      const getResponse = yield* Effect.tryPromise({
        try: () =>
          drive.files.get({
            fileId: fileId,
            fields: "parents",
          }),
        catch: (error) =>
          new GoogleDriveFileError(`Failed to get file info: ${error}`),
      });

      const previousParents = getResponse.data.parents?.join(",") || "";

      // Move the file
      const response = yield* Effect.tryPromise({
        try: () =>
          drive.files.update({
            fileId: fileId,
            addParents: newParentId,
            removeParents: previousParents,
            fields: "id",
          }),
        catch: (error) =>
          new GoogleDriveFileError(`Failed to move file: ${error}`),
      });

      return {
        success: true,
        fileId: response.data.id!,
        message: "File moved successfully",
      };
    }),

  createFolder: (folderName, parentId = "root") =>
    Effect.gen(function* () {
      const authClient = yield* authService.getAuthenticatedClient();
      const drive = google.drive({ version: "v3", auth: authClient });

      const folderMetadata = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      };

      const response = yield* Effect.tryPromise({
        try: () =>
          drive.files.create({
            requestBody: folderMetadata,
            fields: "id,name",
          }),
        catch: (error) =>
          new GoogleDriveFileError(`Failed to create folder: ${error}`),
      });

      return {
        success: true,
        folderId: response.data.id!,
        folderName: response.data.name!,
        message: `Folder '${folderName}' created successfully`,
      };
    }),
});

// Context tag for dependency injection
export const GoogleDriveFileService =
  Context.GenericTag<GoogleDriveFileService>(
    "@services/GoogleDriveFileService",
  );

// Layer for providing the file service
export const GoogleDriveFileServiceLive = Layer.effect(
  GoogleDriveFileService,
  Effect.gen(function* () {
    const authService = yield* GoogleDriveAuthService;
    return createGoogleDriveFileService(authService);
  }),
);
