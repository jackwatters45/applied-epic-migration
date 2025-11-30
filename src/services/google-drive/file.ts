import { join } from "node:path";
import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schedule, Schema } from "effect";
import { type drive_v3, google } from "googleapis";
import { CacheMode } from "src/lib/type.js";
import { GoogleDriveAuthService } from "./auth.js";
import { fetchAllPages } from "./pagination.js";

// Error type for Google Drive file operations
export class GoogleDriveFileError extends Schema.TaggedError<GoogleDriveFileError>()(
  "GoogleDriveFileError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// Types for file operations
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

export interface ListOptions {
  readonly parentId?: string;
  readonly sharedDriveId?: string;
}

type ListParams = {
  sharedDriveId?: string;
  parentId?: string;
  cacheMode?: CacheMode;
};

interface SearchParams {
  /** File name to search for (exact match) */
  readonly fileName: string;
  /** Optional parent folder ID to search within */
  readonly parentId?: string | undefined;
  /** Optional shared drive ID */
  readonly sharedDriveId?: string | undefined;
}

// Google Drive File Service
export class GoogleDriveFileService extends Effect.Service<GoogleDriveFileService>()(
  "GoogleDriveFileService",
  {
    effect: Effect.gen(function* () {
      const authService = yield* GoogleDriveAuthService;
      const fs = yield* FileSystem.FileSystem;

      // Cache helper functions using Effect FileSystem
      const readCache = (
        cacheKey: string,
      ): Effect.Effect<GoogleDriveFile[], GoogleDriveFileError> =>
        Effect.gen(function* () {
          const cachePath = join(process.cwd(), ".cache", `${cacheKey}.json`);
          const cachedData = yield* fs.readFileString(cachePath, "utf8").pipe(
            Effect.mapError(
              (error) =>
                new GoogleDriveFileError({
                  message: `Failed to read cache: ${error}`,
                }),
            ),
          );
          return JSON.parse(cachedData) as GoogleDriveFile[];
        });

      const writeCache = (
        cacheKey: string,
        data: GoogleDriveFile[],
      ): Effect.Effect<void, GoogleDriveFileError> =>
        Effect.gen(function* () {
          const cacheDir = join(process.cwd(), ".cache");
          const cachePath = join(cacheDir, `${cacheKey}.json`);

          // Ensure cache directory exists
          yield* fs
            .makeDirectory(cacheDir, { recursive: true })
            .pipe(Effect.ignore);

          yield* fs
            .writeFileString(cachePath, JSON.stringify(data, null, 2))
            .pipe(
              Effect.mapError(
                (error) =>
                  new GoogleDriveFileError({
                    message: `Failed to write cache: ${error}`,
                  }),
              ),
            );
        });

      return {
        listFiles: (params: ListParams = {}) =>
          Effect.gen(function* () {
            const {
              parentId = "root",
              sharedDriveId,
              cacheMode = CacheMode.READ_WRITE,
            } = params;

            const cacheKey = `list-files-${parentId || "root"}-${sharedDriveId || "default"}`;

            if (
              cacheMode === CacheMode.READ_WRITE ||
              cacheMode === CacheMode.READ
            ) {
              const cachedResult = yield* Effect.either(readCache(cacheKey));
              if (cachedResult._tag === "Right") {
                return cachedResult.right;
              }
            }

            const authClient = yield* authService.getAuthenticatedClient();
            const drive = google.drive({ version: "v3", auth: authClient });

            const query =
              parentId === "root"
                ? "trashed=false"
                : `'${parentId}' in parents and trashed=false`;

            const listParams: drive_v3.Params$Resource$Files$List = {
              q: query,
              pageSize: 1000,
              fields:
                "nextPageToken,files(id,name,mimeType,parents,size,modifiedTime)",
              orderBy: "name",
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            };

            if (sharedDriveId) {
              listParams.driveId = sharedDriveId;
              listParams.corpora = "drive";
            }

            const files = yield* fetchAllPages(drive, listParams, {
              showProgress: true,
            });

            const result = files.map(
              (file): GoogleDriveFile => ({
                id: file.id || "",
                name: file.name || "",
                mimeType: file.mimeType || "",
                parents: file.parents || [],
                ...(file.size && { size: file.size }),
                ...(file.modifiedTime && { modifiedTime: file.modifiedTime }),
              }),
            );

            if (
              cacheMode === CacheMode.READ_WRITE ||
              cacheMode === CacheMode.WRITE
            ) {
              yield* Effect.ignore(writeCache(cacheKey, result));
            }

            return result;
          }),

        listFolders: (params: ListParams = {}) =>
          Effect.gen(function* () {
            const {
              parentId,
              sharedDriveId,
              cacheMode = CacheMode.READ_WRITE,
            } = params;

            const cacheKey = `list-folders-${parentId || "root"}-${sharedDriveId || "default"}`;

            if (
              cacheMode === CacheMode.READ_WRITE ||
              cacheMode === CacheMode.READ
            ) {
              const cachedResult = yield* Effect.either(readCache(cacheKey));
              if (cachedResult._tag === "Right") {
                return cachedResult.right;
              }
            }

            const authClient = yield* authService.getAuthenticatedClient();
            const drive = google.drive({ version: "v3", auth: authClient });

            let query =
              "mimeType='application/vnd.google-apps.folder' and trashed=false";

            if (parentId && parentId !== "root") {
              query = `parents in '${parentId}' and ${query}`;
            }

            const listParams: drive_v3.Params$Resource$Files$List = {
              q: query,
              pageSize: 100,
              fields:
                "nextPageToken,files(id,name,mimeType,parents,size,modifiedTime)",
              orderBy: "folder,name",
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            };

            if (sharedDriveId) {
              listParams.driveId = sharedDriveId;
              listParams.corpora = "drive";
            }

            const allFolders = yield* fetchAllPages(drive, listParams, {
              showProgress: true,
            });

            const result = allFolders.map(
              (file): GoogleDriveFile => ({
                id: file.id || "",
                name: file.name || "",
                mimeType: file.mimeType || "",
                parents: file.parents || [],
                ...(file.size && { size: file.size }),
                ...(file.modifiedTime && { modifiedTime: file.modifiedTime }),
              }),
            );

            if (
              cacheMode === CacheMode.READ_WRITE ||
              cacheMode === CacheMode.WRITE
            ) {
              yield* Effect.ignore(writeCache(cacheKey, result));
            }

            return result;
          }),

        moveFile: (fileId: string, newParentId: string) =>
          Effect.gen(function* () {
            const authClient = yield* authService.getAuthenticatedClient();
            const drive = google.drive({ version: "v3", auth: authClient });

            // First get current parents
            const getResponse = yield* Effect.tryPromise({
              try: () =>
                drive.files.get({
                  fileId: fileId,
                  supportsAllDrives: true,
                  fields: "parents",
                }),
              catch: (error) =>
                new GoogleDriveFileError({
                  message: `Failed to get file info: ${error}`,
                }),
            });

            const previousParents = getResponse.data.parents?.join(",") || "";

            // Move the file with retry policy for transient failures
            const moveResponse = yield* Effect.retry(
              Effect.tryPromise({
                try: () =>
                  drive.files.update({
                    fileId: fileId,
                    addParents: newParentId,
                    removeParents: previousParents,
                    supportsAllDrives: true,
                    fields: "id",
                  }),
                catch: (error) =>
                  new GoogleDriveFileError({
                    message: `Failed to move file: ${error}`,
                  }),
              }),
              Schedule.addDelay(Schedule.recurs(5), () => "1 second"),
            );

            return {
              success: true,
              fileId: moveResponse.data.id!,
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

        trashFile: (fileId: string) =>
          Effect.gen(function* () {
            const authClient = yield* authService.getAuthenticatedClient();
            const drive = google.drive({ version: "v3", auth: authClient });

            yield* Effect.tryPromise({
              try: () =>
                drive.files.update({
                  fileId,
                  requestBody: {
                    trashed: true,
                  },
                  supportsAllDrives: true,
                  fields: "id,name,trashed",
                }),
              catch: (error) =>
                new GoogleDriveFileError({
                  message: `Failed to trash file/folder ${fileId}: ${error}`,
                }),
            });
          }),

        deleteFile: (fileId: string) =>
          Effect.gen(function* () {
            const authClient = yield* authService.getAuthenticatedClient();
            const drive = google.drive({ version: "v3", auth: authClient });

            yield* Effect.tryPromise({
              try: async () =>
                await drive.files.delete({
                  fileId,
                  supportsAllDrives: true,
                }),
              catch: (error) =>
                new GoogleDriveFileError({
                  message: `Failed to delete file/folder ${fileId}: ${error}`,
                }),
            });
          }),

        getFileMetadata: (fileId: string) =>
          Effect.gen(function* () {
            const authClient = yield* authService.getAuthenticatedClient();
            const drive = google.drive({ version: "v3", auth: authClient });

            const response = yield* Effect.tryPromise({
              try: () =>
                drive.files.get({
                  fileId,
                  supportsAllDrives: true,
                  fields: "id,name,mimeType,parents,properties,appProperties",
                }),
              catch: (error) =>
                new GoogleDriveFileError({
                  message: `Failed to get file metadata: ${error}`,
                }),
            });

            return {
              id: response.data.id || "",
              name: response.data.name || "",
              mimeType: response.data.mimeType || "",
              parents: response.data.parents || [],
              properties: response.data.properties || {},
              appProperties: response.data.appProperties || {},
            };
          }),

        updateFileMetadata: (
          fileId: string,
          metadata: {
            properties?: Record<string, string>;
            name?: string;
          },
        ) =>
          Effect.gen(function* () {
            const authClient = yield* authService.getAuthenticatedClient();
            const drive = google.drive({ version: "v3", auth: authClient });

            yield* Effect.tryPromise({
              try: () =>
                drive.files.update({
                  fileId,
                  requestBody: {
                    ...(metadata.properties && {
                      properties: metadata.properties,
                    }),
                    ...(metadata.name && { name: metadata.name }),
                  },
                  supportsAllDrives: true,
                  fields: "id,name,properties",
                }),
              catch: (error) =>
                new GoogleDriveFileError({
                  message: `Failed to update file metadata: ${error}`,
                }),
            });
          }),

        downloadFile: (fileId: string) =>
          Effect.gen(function* () {
            const authClient = yield* authService.getAuthenticatedClient();
            const drive = google.drive({ version: "v3", auth: authClient });

            const response = yield* Effect.tryPromise({
              try: () =>
                drive.files.get(
                  {
                    fileId,
                    alt: "media",
                    supportsAllDrives: true,
                  },
                  { responseType: "arraybuffer" },
                ),
              catch: (error) =>
                new GoogleDriveFileError({
                  message: `Failed to download file ${fileId}: ${error}`,
                }),
            });

            return new Uint8Array(response.data as ArrayBuffer);
          }),

        /**
         * Upload a file to Google Drive
         */
        uploadFile: (params: {
          fileName: string;
          content: Uint8Array;
          parentId: string;
          mimeType?: string | undefined;
        }) =>
          Effect.gen(function* () {
            const authClient = yield* authService.getAuthenticatedClient();
            const drive = google.drive({ version: "v3", auth: authClient });

            const { Readable } = yield* Effect.promise(
              () => import("node:stream"),
            );

            const response = yield* Effect.tryPromise({
              try: () =>
                drive.files.create({
                  requestBody: {
                    name: params.fileName,
                    parents: [params.parentId],
                  },
                  media: {
                    mimeType: params.mimeType || "application/octet-stream",
                    body: Readable.from(Buffer.from(params.content)),
                  },
                  fields: "id,name",
                  supportsAllDrives: true,
                }),
              catch: (error) =>
                new GoogleDriveFileError({
                  message: `Failed to upload file ${params.fileName}: ${error}`,
                }),
            });

            return {
              id: response.data.id || "",
              name: response.data.name || "",
            };
          }),

        /**
         * Search for files by name, optionally within a specific folder.
         * Returns all matching files (there may be multiple with the same name).
         */
        searchFiles: (params: SearchParams) =>
          Effect.gen(function* () {
            const { fileName, parentId, sharedDriveId } = params;

            const authClient = yield* authService.getAuthenticatedClient();
            const drive = google.drive({ version: "v3", auth: authClient });

            // Build query - escape single quotes in filename
            const escapedName = fileName.replace(/'/g, "\\'");
            let query = `name='${escapedName}' and trashed=false`;

            if (parentId) {
              query = `'${parentId}' in parents and ${query}`;
            }

            const listParams: drive_v3.Params$Resource$Files$List = {
              q: query,
              pageSize: 100,
              fields:
                "nextPageToken,files(id,name,mimeType,parents,size,modifiedTime)",
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            };

            if (sharedDriveId) {
              listParams.driveId = sharedDriveId;
              listParams.corpora = "drive";
            }

            const allFiles = yield* fetchAllPages(drive, listParams);

            return allFiles.map(
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
      } as const;
    }),
    dependencies: [GoogleDriveAuthService.Default, NodeContext.layer],
  },
) {}
