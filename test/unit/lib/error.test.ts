import { describe, expect, it } from "@effect/vitest";
import {
  ApiError,
  type AppError,
  AuthenticationError,
  DateError,
  DownloadError,
  FileSystemError,
  NetworkError,
  ParseError,
  ValidationError,
} from "../../../src/lib/error.js";

describe("Lib Error Tests", () => {
  describe("AuthenticationError", () => {
    it("should create AuthenticationError with required fields", () => {
      const error = new AuthenticationError({
        message: "Authentication failed",
        status: 401,
      });

      expect(error._tag).toBe("AuthenticationError");
      expect(error.message).toBe("Authentication failed");
      expect(error.status).toBe(401);
    });

    it("should be instance of AuthenticationError", () => {
      const error = new AuthenticationError({
        message: "Auth error",
        status: 401,
      });

      expect(error).toBeInstanceOf(AuthenticationError);
    });
  });

  describe("NetworkError", () => {
    it("should create NetworkError with required fields", () => {
      const error = new NetworkError({
        message: "Network timeout",
        status: 503,
      });

      expect(error._tag).toBe("NetworkError");
      expect(error.message).toBe("Network timeout");
      expect(error.status).toBe(503);
    });
  });

  describe("ParseError", () => {
    it("should create ParseError with required fields", () => {
      const error = new ParseError({
        message: "Invalid JSON",
        status: 400,
      });

      expect(error._tag).toBe("ParseError");
      expect(error.message).toBe("Invalid JSON");
      expect(error.status).toBe(400);
    });
  });

  describe("DownloadError", () => {
    it("should create DownloadError with required fields", () => {
      const error = new DownloadError({
        message: "Download failed",
        status: 500,
        attachmentId: "att_123",
      });

      expect(error._tag).toBe("DownloadError");
      expect(error.message).toBe("Download failed");
      expect(error.status).toBe(500);
      expect(error.attachmentId).toBe("att_123");
    });

    it("should create DownloadError without optional attachmentId", () => {
      const error = new DownloadError({
        message: "Download failed",
        status: 500,
      });

      expect(error.attachmentId).toBeUndefined();
    });
  });

  describe("FileSystemError", () => {
    it("should create FileSystemError with required fields", () => {
      const error = new FileSystemError({
        message: "File not found",
        status: 404,
        path: "/path/to/file.txt",
      });

      expect(error._tag).toBe("FileSystemError");
      expect(error.message).toBe("File not found");
      expect(error.status).toBe(404);
      expect(error.path).toBe("/path/to/file.txt");
    });

    it("should create FileSystemError without optional path", () => {
      const error = new FileSystemError({
        message: "Permission denied",
        status: 403,
      });

      expect(error.path).toBeUndefined();
    });
  });

  describe("ValidationError", () => {
    it("should create ValidationError with required fields", () => {
      const error = new ValidationError({
        message: "Invalid input",
        status: 422,
      });

      expect(error._tag).toBe("ValidationError");
      expect(error.message).toBe("Invalid input");
      expect(error.status).toBe(422);
    });
  });

  describe("ApiError", () => {
    it("should create ApiError with required fields", () => {
      const error = new ApiError({
        type: "INVALID_REQUEST",
        title: "Bad Request",
        status: 400,
        detail: "The request format is invalid",
      });

      expect(error._tag).toBe("ApiError");
      expect(error.type).toBe("INVALID_REQUEST");
      expect(error.title).toBe("Bad Request");
      expect(error.status).toBe(400);
      expect(error.detail).toBe("The request format is invalid");
    });
  });

  describe("DateError", () => {
    it("should create DateError with required fields", () => {
      const error = new DateError({
        message: "Invalid date format",
        status: 400,
      });

      expect(error._tag).toBe("DateError");
      expect(error.message).toBe("Invalid date format");
      expect(error.status).toBe(400);
    });
  });

  describe("AppError union type", () => {
    it("should accept all error types", () => {
      const errors: AppError[] = [
        new AuthenticationError({ message: "Auth error", status: 401 }),
        new NetworkError({ message: "Network error", status: 503 }),
        new ParseError({ message: "Parse error", status: 400 }),
        new DownloadError({ message: "Download error", status: 500 }),
        new FileSystemError({ message: "File error", status: 404 }),
        new ValidationError({ message: "Validation error", status: 422 }),
        new ApiError({
          type: "API_ERROR",
          title: "API Error",
          status: 500,
          detail: "Details",
        }),
        new DateError({ message: "Date error", status: 400 }),
      ];

      expect(errors).toHaveLength(8);
      errors.forEach((error) => {
        expect(error.message).toBeDefined();
        expect(error.status).toBeDefined();
        expect(error._tag).toBeDefined();
      });
    });
  });

  describe("Error discrimination", () => {
    it("should discriminate errors by _tag", () => {
      const authError = new AuthenticationError({
        message: "Auth",
        status: 401,
      });
      const networkError = new NetworkError({
        message: "Network",
        status: 503,
      });

      if (authError._tag === "AuthenticationError") {
        expect(authError.status).toBe(401);
      }

      if (networkError._tag === "NetworkError") {
        expect(networkError.status).toBe(503);
      }
    });
  });
});
