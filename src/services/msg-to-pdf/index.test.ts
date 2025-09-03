import { describe, expect, it } from "vitest";
import { type MsgToPdfConfig, MsgToPdfError } from "./index.js";

describe("MsgToPdfService", () => {
  describe("MsgToPdfError", () => {
    it("should create error with correct properties", () => {
      const error = new MsgToPdfError(
        "ReadError",
        "File not found",
        new Error("Original error"),
      );

      expect(error._tag).toBe("MsgToPdfError");
      expect(error.type).toBe("ReadError");
      expect(error.message).toBe("File not found");
      expect(error.cause).toBeInstanceOf(Error);
    });
  });

  describe("MsgToPdfConfig", () => {
    it("should accept valid configuration", () => {
      const config: MsgToPdfConfig = {
        gotenbergUrl: "http://localhost:3001",
        pdfFormat: "A4",
        landscape: false,
        scale: 1.0,
        marginTop: "1in",
        marginBottom: "1in",
        marginLeft: "1in",
        marginRight: "1in",
      };

      expect(config.pdfFormat).toBe("A4");
      expect(config.landscape).toBe(false);
      expect(config.scale).toBe(1.0);
    });

    it("should accept partial configuration", () => {
      const config: MsgToPdfConfig = {
        pdfFormat: "Letter",
      };

      expect(config.pdfFormat).toBe("Letter");
      expect(config.gotenbergUrl).toBeUndefined();
    });
  });
});
