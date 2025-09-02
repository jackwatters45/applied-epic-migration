import * as fs from "node:fs";
import * as path from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AuthService } from "./auth.js";
import { DownloadError, FileSystemError, NetworkError } from "./lib/errors.js";
import type { Attachment } from "./lib/types.js";

// File download service interface
export interface DownloadService {
  downloadAttachment: (
    attachment: Attachment,
    outputPath: string,
  ) => Effect.Effect<
    DownloadResult,
    DownloadError | FileSystemError | NetworkError
  >;
  downloadAttachmentById: (
    attachmentId: string,
    outputPath: string,
  ) => Effect.Effect<
    DownloadResult,
    DownloadError | FileSystemError | NetworkError
  >;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  size?: number;
  message: string;
}

// File download service implementation
class DownloadServiceImpl implements DownloadService {
  downloadAttachment(
    attachment: Attachment,
    outputPath: string,
  ): Effect.Effect<
    DownloadResult,
    DownloadError | FileSystemError | NetworkError
  > {
    return Effect.gen(function* () {
      if (!attachment.file.url) {
        return yield* Effect.fail(
          new DownloadError({
            message: "Attachment does not have a download URL",
            status: 400,
            attachmentId: attachment.id,
          }),
        );
      }

      // Generate filename
      const extension = attachment.file.extension || "";
      const fileName = `${attachment.description}${extension ? `.${extension}` : ""}`;
      const fullPath = path.resolve(outputPath, fileName);

      // Ensure output directory exists
      const outputDir = path.dirname(fullPath);
      yield* Effect.tryPromise({
        try: () => fs.promises.mkdir(outputDir, { recursive: true }),
        catch: (error) =>
          new FileSystemError({
            message: `Failed to create output directory: ${error}`,
            status: 0,
            path: outputDir,
          }),
      });

      // Download the file
      const response = yield* Effect.tryPromise({
        try: () => fetch(attachment.file.url!),
        catch: (error) =>
          new NetworkError({
            message: `Failed to download file: ${error}`,
            status: 0,
          }),
      });

      if (!response.ok) {
        return yield* Effect.fail(
          new DownloadError({
            message: `Failed to download file: ${response.statusText}`,
            status: response.status,
            attachmentId: attachment.id,
          }),
        );
      }

      // Get the file content
      const arrayBuffer = yield* Effect.tryPromise({
        try: () => response.arrayBuffer(),
        catch: (error) =>
          new DownloadError({
            message: `Failed to read file content: ${error}`,
            status: 0,
            attachmentId: attachment.id,
          }),
      });

      // Write to file
      yield* Effect.tryPromise({
        try: () => fs.promises.writeFile(fullPath, Buffer.from(arrayBuffer)),
        catch: (error) =>
          new FileSystemError({
            message: `Failed to write file: ${error}`,
            status: 0,
            path: fullPath,
          }),
      });

      return {
        success: true,
        filePath: fullPath,
        fileName,
        size: arrayBuffer.byteLength,
        message: `Successfully downloaded ${fileName}`,
      };
    });
  }

  downloadAttachmentById(
    attachmentId: string,
    _outputPath: string,
  ): Effect.Effect<
    DownloadResult,
    DownloadError | FileSystemError | NetworkError
  > {
    return Effect.gen(function* () {
      // This would need the AttachmentsService to get the attachment first
      // For now, return an error
      return yield* Effect.fail(
        new DownloadError({
          message: "downloadAttachmentById is not yet implemented",
          status: 501,
          attachmentId,
        }),
      );
    });
  }
}

// Context tag for dependency injection
export const DownloadService = Context.GenericTag<DownloadService>(
  "@services/DownloadService",
);

// Layer for providing the download service
export const DownloadServiceLive = Layer.effect(
  DownloadService,
  Effect.gen(function* () {
    yield* AuthService; // Dependency is available but not used currently
    return new DownloadServiceImpl();
  }),
);
