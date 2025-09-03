import * as fs from "node:fs";
import * as path from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  type AuthenticationError,
  DownloadError,
  FileSystemError,
  NetworkError,
  type ParseError,
} from "../../lib/errors.js";
import type { Attachment } from "../../lib/types.js";
import { AuthService } from "./auth.js";

// File download service interface
export interface DownloadService {
  downloadAttachment: (
    attachment: Attachment,
    outputPath: string,
  ) => Effect.Effect<
    DownloadResult,
    | DownloadError
    | FileSystemError
    | NetworkError
    | AuthenticationError
    | ParseError
  >;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  size?: number;
  message: string;
}

// Create download service implementation
const createDownloadService = (authService: AuthService): DownloadService => ({
  downloadAttachment: (attachment: Attachment, outputPath: string) =>
    Effect.gen(function* () {
      if (!attachment.file.url) {
        return yield* Effect.fail(
          new DownloadError({
            message: "Attachment does not have a download URL",
            status: 400,
            attachmentId: attachment.id,
          }),
        );
      }

      // Generate filename - use file name if available, otherwise use description
      const extension = attachment.file.extension || "";
      const baseName =
        attachment.file.name ||
        attachment.description ||
        `attachment_${attachment.id}`;
      // Clean the filename (remove any path separators or invalid characters)
      const cleanBaseName = baseName.replace(/[/\\:*?"<>|]/g, "_");
      const fileName =
        extension && !cleanBaseName.endsWith(extension)
          ? `${cleanBaseName}${extension}`
          : cleanBaseName;
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

      // Get auth token for file download
      const token = yield* authService.getAccessToken();

      // Download the file with timeout and auth header
      const response = yield* Effect.tryPromise({
        try: async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

          try {
            const res = await fetch(attachment.file.url!, {
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${token.access_token}`,
                "User-Agent": "Applied-Epic-Migration-Tool/1.0",
              },
            });
            clearTimeout(timeoutId);
            return res;
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        },
        catch: (error) => {
          const message =
            error instanceof Error && error.name === "AbortError"
              ? "Download timeout (30 seconds)"
              : error instanceof Error
                ? `Failed to download file: ${error.message}`
                : `Failed to download file: ${String(error)}`;
          return new NetworkError({
            message,
            status: 0,
          });
        },
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
    }),
});

// Context tag for dependency injection
export const DownloadService = Context.GenericTag<DownloadService>(
  "@services/DownloadService",
);

// Layer for providing the download service
export const DownloadServiceLive = Layer.effect(
  DownloadService,
  Effect.gen(function* () {
    const authService = yield* AuthService;
    return createDownloadService(authService);
  }),
);
