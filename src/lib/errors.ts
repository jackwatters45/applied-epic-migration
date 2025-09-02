import { Data } from "effect";

// Authentication errors
export class AuthenticationError extends Data.TaggedError(
  "AuthenticationError",
)<{
  readonly message: string;
  readonly status: number;
}> {}

// Network errors
export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly message: string;
  readonly status: number;
}> {}

// Parse errors
export class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string;
  readonly status: number;
}> {}

// Download errors
export class DownloadError extends Data.TaggedError("DownloadError")<{
  readonly message: string;
  readonly status: number;
  readonly attachmentId?: string;
}> {}

// File system errors
export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  readonly message: string;
  readonly status: number;
  readonly path?: string;
}> {}

// Validation errors
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly status: number;
}> {}

// Union type for all application errors
export type AppError =
  | AuthenticationError
  | NetworkError
  | ParseError
  | DownloadError
  | FileSystemError
  | ValidationError;
