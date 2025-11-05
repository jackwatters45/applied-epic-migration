import { Effect, Schema } from "effect";
import { GoogleDriveFileService } from "../google-drive/file.js";

// Error types
export class FolderScannerError extends Schema.TaggedError<FolderScannerError>()(
  "FolderScannerError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

export interface FileMetadata {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly size?: string;
  readonly modifiedTime?: string;
  readonly createdTime?: string;
  readonly extractedDate?: Date;
}

// Folder Scanner Service
export class FolderScannerService extends Effect.Service<FolderScannerService>()(
  "FolderScannerService",
  {
    effect: Effect.gen(function* () {
      yield* GoogleDriveFileService;

      return {
        scanSourceDirectory: (_sourceFolderId: string) =>
          Effect.gen(function* () {
            // TODO: Implement scanning logic
            return [] as FileMetadata[];
          }),

        extractDatesFromMetadata: (files: readonly FileMetadata[]) =>
          Effect.gen(function* () {
            // TODO: Implement date extraction logic
            return files;
          }),

        filterFilesByPattern: (
          files: readonly FileMetadata[],
          _pattern: string,
        ) =>
          Effect.gen(function* () {
            // TODO: Implement file filtering logic
            return files;
          }),
      } as const;
    }),
    dependencies: [GoogleDriveFileService.Default],
  },
) {}
