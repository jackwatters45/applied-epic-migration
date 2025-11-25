import { describe, expect, it } from "vitest";
import { FolderMergerError } from "../../../src/services/merging/folder-merger.js";

describe("FolderMergerError", () => {
  it("should create a verification failed error correctly", () => {
    const error = new FolderMergerError({
      message: "Move verification failed for source folder abc123",
      type: "VERIFICATION_FAILED",
      sourceId: "abc123",
      targetId: "def456",
      missingItemsCount: 2,
      remainingItemsCount: 1,
      details:
        "Missing items: [file1.txt, file2.txt], Remaining items: [file3.txt]",
    });

    expect(error._tag).toBe("FolderMergerError");
    expect(error.message).toBe(
      "Move verification failed for source folder abc123",
    );
    expect(error.type).toBe("VERIFICATION_FAILED");
    expect(error.sourceId).toBe("abc123");
    expect(error.targetId).toBe("def456");
    expect(error.missingItemsCount).toBe(2);
    expect(error.remainingItemsCount).toBe(1);
    expect(error.details).toBe(
      "Missing items: [file1.txt, file2.txt], Remaining items: [file3.txt]",
    );
  });

  it("should create an error with minimal required fields", () => {
    const error = new FolderMergerError({
      message: "Generic merge error",
      type: "GENERIC_ERROR",
    });

    expect(error._tag).toBe("FolderMergerError");
    expect(error.message).toBe("Generic merge error");
    expect(error.type).toBe("GENERIC_ERROR");
    expect(error.sourceId).toBeUndefined();
    expect(error.targetId).toBeUndefined();
    expect(error.missingItemsCount).toBeUndefined();
    expect(error.remainingItemsCount).toBeUndefined();
    expect(error.details).toBeUndefined();
  });
});
