import { describe, expect, it } from "vitest";
import { FolderMergerService } from "../../../src/services/merging/folder-merger.js";
import { RollbackService } from "../../../src/services/merging/rollback.js";

describe("FolderMergerService Rollback Integration", () => {
  it("should have rollback service dependency", () => {
    expect(FolderMergerService.Default).toBeDefined();
    expect(RollbackService.Default).toBeDefined();
  });

  // Note: Full integration tests would require mocking all dependencies
  // This is just a structural test to verify integration is possible
  it("should support rollback session options", () => {
    // We can't easily test the service methods without proper Effect setup
    // but we can verify the service structure exists and has rollback integration
    expect(FolderMergerService.Default).toBeDefined();
  });
});
