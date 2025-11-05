import * as fs from "node:fs";
import { Effect, Schema } from "effect";
import { google } from "googleapis";
import { GoogleDriveAuthService } from "./auth.js";

// Error type for Google Drive file operations
export class GoogleDriveFileError extends Schema.TaggedError<GoogleDriveFileError>()(
  "GoogleDriveFileError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// Types for file operations
export interface UploadResult {
  readonly success: boolean;
  readonly fileId: string;
  readonly fileName: string;
  readonly message: string;
}

export interface MoveFileResult {
  readonly success: boolean;
  readonly fileId: string;
  readonly message: string;
}

export interface CreateFolderResult {
  readonly success: boolean;
  readonly folderId: string;
  readonly folderName: string;
  readonly message: string;
}

export interface GoogleDriveFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly parents: readonly string[];
  readonly size?: string;
  readonly modifiedTime?: string;
}

// Google Drive File Service
export class GoogleDriveFileService extends Effect.Service<GoogleDriveFileService>()(
  "GoogleDriveFileService",
  {
    effect: Effect.gen(function* () {
      const authService = yield* GoogleDriveAuthService;

      return {
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
                new GoogleDriveFileError({
                  message: `Failed to list files: ${error}`,
                }),
            });

            const files = response.data.files || [];
            return files.map(
              (file): GoogleDriveFile => ({
                id: file.id || "",
                name: file.name || "",
                mimeType: file.mimeType || "",
                parents: file.parents || [],
                ...(file.size && { size: file.size }),
                ...(file.modifiedTime && { modifiedTime: file.modifiedTime }),
              }),
            );
          }),

        uploadFile: (filePath: string, fileName: string, parentId = "root") =>
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
                new GoogleDriveFileError({
                  message: `Failed to upload file: ${error}`,
                }),
            });

            return {
              success: true,
              fileId: response.data.id!,
              fileName: response.data.name!,
              message: `File '${fileName}' uploaded successfully`,
            } as const;
          }),

        moveFile: (fileId: string, newParentId: string) =>
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
                new GoogleDriveFileError({
                  message: `Failed to get file info: ${error}`,
                }),
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
                new GoogleDriveFileError({
                  message: `Failed to move file: ${error}`,
                }),
            });

            return {
              success: true,
              fileId: response.data.id!,
              message: "File moved successfully",
            } as const;
          }),

        createFolder: (folderName: string, parentId = "root") =>
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
                new GoogleDriveFileError({
                  message: `Failed to create folder: ${error}`,
                }),
            });

            return {
              success: true,
              folderId: response.data.id!,
              folderName: response.data.name!,
              message: `Folder '${folderName}' created successfully`,
            } as const;
          }),
      } as const;
    }),
    dependencies: [GoogleDriveAuthService.Default],
  },
) {}
