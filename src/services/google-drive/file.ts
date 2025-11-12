import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { type drive_v3, google } from "googleapis";
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
  useCache?: boolean;
};

// Google Drive File Service
export class GoogleDriveFileService extends Effect.Service<GoogleDriveFileService>()(
  "GoogleDriveFileService",
  {
    effect: Effect.gen(function* () {
      const authService = yield* GoogleDriveAuthService;

      return {
        listFiles: (params: ListParams = {}) =>
          Effect.gen(function* () {
            const {
              parentId = "root",
              sharedDriveId,
              useCache = false,
            } = params;

            const cacheKey = `list-files-${parentId || "root"}-${sharedDriveId || "default"}`;

            if (useCache) {
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
                : `parents in '${parentId}' and trashed=false`;

            const listParams: drive_v3.Params$Resource$Files$List = {
              q: query,
              pageSize: 100,
              fields: "files(id,name,mimeType,parents,size,modifiedTime)",
              orderBy: "name",
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            };

            if (sharedDriveId) {
              listParams.driveId = sharedDriveId;
              listParams.corpora = "drive";
            }

            const response = yield* Effect.tryPromise({
              try: () => drive.files.list(listParams),
              catch: (error) =>
                new GoogleDriveFileError({
                  message: `Failed to list files: ${error}`,
                }),
            });

            const files = response.data.files || [];
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

            if (useCache) {
              yield* Effect.ignore(writeCache(cacheKey, result));
            }

            return result;
          }),

        listFolders: (params: ListParams = {}) =>
          Effect.gen(function* () {
            const { parentId, sharedDriveId, useCache = false } = params;

            const cacheKey = `list-folders-${parentId || "root"}-${sharedDriveId || "default"}`;

            if (useCache) {
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

            if (useCache) {
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

// Cache helper functions
const readCache = (
  cacheKey: string,
): Effect.Effect<GoogleDriveFile[], GoogleDriveFileError> =>
  Effect.tryPromise({
    try: async () => {
      const cachePath = join(process.cwd(), "cache", `${cacheKey}.json`);
      const cachedData = await readFile(cachePath, "utf-8");
      return JSON.parse(cachedData) as GoogleDriveFile[];
    },
    catch: (error) =>
      new GoogleDriveFileError({
        message: `Failed to read cache: ${error}`,
      }),
  });

const writeCache = (
  cacheKey: string,
  data: GoogleDriveFile[],
): Effect.Effect<void, GoogleDriveFileError> =>
  Effect.tryPromise({
    try: async () => {
      const cachePath = join(process.cwd(), "cache", `${cacheKey}.json`);
      await writeFile(cachePath, JSON.stringify(data, null, 2));
    },
    catch: (error) =>
      new GoogleDriveFileError({
        message: `Failed to write cache: ${error}`,
      }),
  });
