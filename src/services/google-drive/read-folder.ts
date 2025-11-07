import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { GoogleDriveAuthService } from "./auth.js";
import { GoogleDriveFileService } from "./file.js";
import { FolderReaderOrchestrator } from "./folder-reader.js";

// Specific workflow to read files from a known folder
const readFilesFromFolder = (folderId: string) =>
  Effect.gen(function* () {
    console.log("🔐 Starting Google Drive authentication...");

    // Step 1: Authenticate
    const authService = yield* GoogleDriveAuthService;
    yield* authService.getAuthenticatedClient();
    console.log("✅ Authentication successful!");

    // Step 2: Get service account email
    const serviceEmail = yield* authService.getServiceAccountEmail();
    console.log(`📧 Service account: ${serviceEmail}`);

    // Step 3: Verify folder exists first
    console.log(`📁 Verifying folder exists: ${folderId}`);

    const fileService = yield* GoogleDriveFileService;
    const allFiles = yield* fileService.listFiles();
    const targetFolder = allFiles.find((file) => file.id === folderId);

    if (!targetFolder) {
      console.log(
        `❌ Folder with ID '${folderId}' not found or not accessible`,
      );
      console.log("📋 Available folders:");
      const availableFolders = allFiles.filter(
        (file) => file.mimeType === "application/vnd.google-apps.folder",
      );

      if (availableFolders.length === 0) {
        console.log(
          "  No folders found - service account may not have access to any folders",
        );
      } else {
        availableFolders.forEach((folder, index) => {
          console.log(`  ${index + 1}. ${folder.name} (${folder.id})`);
        });
      }

      console.log("\n🔧 Troubleshooting:");
      console.log("  1. Verify the folder ID is correct");
      console.log(
        "  2. Ensure service account has permission to access this folder",
      );
      console.log(
        `  3. Share the folder with: ${yield* authService.getServiceAccountEmail()}`,
      );
      console.log(
        "  4. Check if folder is in a shared drive the service account can access",
      );
      return;
    }

    console.log(`✅ Folder found: ${targetFolder.name}`);

    // Step 4: Read files from the specific folder
    console.log(`📁 Reading files from folder: ${folderId}`);

    const folderReader = yield* FolderReaderOrchestrator;
    const result = yield* folderReader.readFolderById(folderId);

    if (!result.success) {
      console.log(`❌ Failed to read folder: ${result.message}`);
      console.log(`🔍 Error details: ${JSON.stringify(result, null, 2)}`);
      return;
    }

    if (result.totalFiles === 0 && result.totalFolders === 0) {
      console.log("⚠️  Folder appears to be empty or inaccessible");
      console.log("🔍 This could indicate:");
      console.log("   - Folder is actually empty");
      console.log(
        "   - Service account lacks read permissions for this folder",
      );
      console.log("   - Folder is in a restricted/shared drive");
      console.log("   - API query is filtering out files incorrectly");
      console.log(
        `\n🔧 Try sharing the folder with: ${yield* authService.getServiceAccountEmail()}`,
      );
      return;
    }

    console.log("✅ Successfully read folder contents!");
    console.log(
      `📊 Summary: ${result.totalFiles} file(s), ${result.totalFolders} subfolder(s)`,
    );

    // Step 4: Display all files
    if (result.content.length > 0) {
      console.log("\n📄 Files found:");

      result.content.forEach((folderContent) => {
        if (folderContent.files.length > 0) {
          console.log(`\n📂 Folder: ${folderContent.folderName}`);
          folderContent.files.forEach((file, index) => {
            console.log(`  ${index + 1}. ${file.name}`);
            console.log(`     🆔 ID: ${file.id}`);
            console.log(`     📋 Type: ${file.mimeType}`);
            console.log(`     📏 Size: ${file.size || "Unknown"}`);
            console.log(`     📅 Modified: ${file.modifiedTime || "Unknown"}`);
            console.log("");
          });
        }
      });
    } else {
      console.log("📭 No files found in this folder");
    }

    // Step 5: Display subfolders
    const allSubfolders = result.content.flatMap(
      (content) => content.subfolders,
    );
    if (allSubfolders.length > 0) {
      console.log("\n📁 Subfolders found:");
      allSubfolders.forEach((folder, index) => {
        console.log(`  ${index + 1}. ${folder.name}`);
        console.log(`     🆔 ID: ${folder.id}`);
        console.log(`     📅 Modified: ${folder.modifiedTime || "Unknown"}`);
        console.log("");
      });
    }

    console.log("✅ Folder reading completed!");
  });

// Create the complete layer
const GoogleDriveLayer = Layer.mergeAll(
  GoogleDriveAuthService.Default,
  GoogleDriveFileService.Default,
  FolderReaderOrchestrator.Default,
  NodeContext.layer,
);

// Main execution function
export const executeFolderReader = (folderId: string) =>
  Effect.runPromise(
    readFilesFromFolder(folderId).pipe(
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
  const folderId = process.argv[2];

  if (!folderId) {
    console.log("Usage: bun run read-folder.ts <folder-id>");
    console.log("");
    console.log(
      "Example: bun run read-folder.ts 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    );
    process.exit(1);
  }

  executeFolderReader(folderId)
    .then(() => {
      console.log("\n🎉 Folder reading completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Program failed:", error);
      process.exit(1);
    });
}
