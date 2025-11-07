import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { GoogleDriveAuthService } from "./auth.js";
import { GoogleDriveFileService } from "./file.js";
import { FolderReaderOrchestrator } from "./folder-reader.js";

// Main runnable script to authenticate with Google Drive and read a file by ID
const runGoogleDriveFileReader = (fileId: string) =>
  Effect.gen(function* () {
    console.log("🔐 Starting Google Drive authentication...");

    // Step 1: Authenticate with Google Drive
    const authService = yield* GoogleDriveAuthService;
    yield* authService.getAuthenticatedClient();
    console.log("✅ Authentication successful!");

    // Step 2: Get service account email for verification
    const serviceEmail = yield* authService.getServiceAccountEmail();
    console.log(`📧 Service account: ${serviceEmail}`);

    // Step 3: Read the specific file by ID
    console.log(`📁 Reading file with ID: ${fileId}`);
    const fileService = yield* GoogleDriveFileService;

    // Get file details
    const files = yield* fileService.listFiles();
    const targetFile = files.find((file) => file.id === fileId);

    if (!targetFile) {
      console.log(`❌ File with ID '${fileId}' not found`);
      console.log("📋 Available files:");
      files.forEach((file, index) => {
        console.log(
          `  ${index + 1}. ${file.name} (${file.id}) - ${file.mimeType}`,
        );
      });
      return;
    }

    console.log("✅ File found!");
    console.log(`📄 Name: ${targetFile.name}`);
    console.log(`🆔 ID: ${targetFile.id}`);
    console.log(`📋 Type: ${targetFile.mimeType}`);
    console.log(`📏 Size: ${targetFile.size || "Unknown"}`);
    console.log(`📅 Modified: ${targetFile.modifiedTime || "Unknown"}`);
    console.log(`📁 Parents: ${targetFile.parents.join(", ")}`);

    // Step 4: If it's a folder, list its contents
    if (targetFile.mimeType === "application/vnd.google-apps.folder") {
      console.log("📂 This is a folder, listing contents...");

      const folderReader = yield* FolderReaderOrchestrator;
      const folderContent = yield* folderReader.readFolderById(fileId);

      if (folderContent.success) {
        console.log(
          `📁 Folder contains ${folderContent.totalFiles} file(s) and ${folderContent.totalFolders} subfolder(s)`,
        );

        folderContent.content.forEach((content) => {
          console.log(`\n📂 Folder: ${content.folderName}`);

          if (content.files.length > 0) {
            console.log("📄 Files:");
            content.files.forEach((file) => {
              console.log(`  - ${file.name} (${file.id})`);
            });
          }

          if (content.subfolders.length > 0) {
            console.log("📁 Subfolders:");
            content.subfolders.forEach((folder) => {
              console.log(`  - ${folder.name} (${folder.id})`);
            });
          }
        });
      }
    }

    console.log("✅ Operation completed successfully!");
  });

// Create the complete layer with all dependencies
const GoogleDriveLayer = Layer.mergeAll(
  GoogleDriveAuthService.Default,
  GoogleDriveFileService.Default,
  FolderReaderOrchestrator.Default,
  NodeContext.layer,
);

// Main execution function
export const executeGoogleDriveFileReader = (fileId: string) =>
  Effect.runPromise(
    runGoogleDriveFileReader(fileId).pipe(
      Effect.provide(GoogleDriveLayer),
      Effect.catchAll((error) => {
        console.error("❌ Error:", error.message);
        if ("status" in error && error.status) {
          console.error(`Status: ${error.status}`);
        }
        return Effect.void;
      }),
    ),
  );

// CLI execution
if (import.meta.main) {
  const fileId = process.argv[2];

  if (!fileId) {
    console.log("Usage: bun run google-drive-file-reader.ts <file-id>");
    console.log("");
    console.log(
      "Example: bun run google-drive-file-reader.ts 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    );
    process.exit(1);
  }

  executeGoogleDriveFileReader(fileId)
    .then(() => {
      console.log("\n🎉 Program completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Program failed:", error);
      process.exit(1);
    });
}
