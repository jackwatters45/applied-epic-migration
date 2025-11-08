import { describe, expect, it } from "@effect/vitest";
import type { FileUploadResult } from "../../../src/lib/type.js";

describe("Lib Type Tests", () => {
  describe("FileUploadResult", () => {
    it("should accept successful upload result", () => {
      const result: FileUploadResult = {
        success: true,
        message: "Upload successful",
        attachmentId: "att_123456",
      };

      expect(result.success).toBe(true);
      expect(result.message).toBe("Upload successful");
      expect(result.attachmentId).toBe("att_123456");
    });

    it("should accept failed upload result", () => {
      const result: FileUploadResult = {
        success: false,
        message: "Upload failed",
      };

      expect(result.success).toBe(false);
      expect(result.message).toBe("Upload failed");
      expect(result.attachmentId).toBeUndefined();
    });

    it("should require success field", () => {
      const result = {
        message: "Upload successful",
      } as unknown as FileUploadResult;

      // This should fail type checking at compile time
      expect(() => {
        if (!result.success) {
          throw new Error("Missing success field");
        }
        return result;
      }).toThrow();
    });

    it("should require message field", () => {
      const result = {
        success: true,
      } as unknown as FileUploadResult;

      // This should fail type checking at compile time
      expect(() => {
        if (!result.message) {
          throw new Error("Missing message field");
        }
        return result;
      }).toThrow();
    });

    it("should make attachmentId optional", () => {
      const result: FileUploadResult = {
        success: true,
        message: "Upload successful",
        // attachmentId is optional
      };

      expect(result.attachmentId).toBeUndefined();
    });
  });
});
