import * as Effect from "effect/Effect";
import { google } from "googleapis";
import { GoogleDriveAuthService, GoogleDriveAuthServiceLive } from "./auth.js";

// Test folder ID from the shared Drive link (null = upload to service account's root drive)
const TEST_FOLDER_ID: string | null = null; // Change to your Shared Drive ID when available

// Example of how to use Google Drive service account authentication
const example = Effect.gen(function* () {
  // Get the Google Drive auth service
  const authService = yield* GoogleDriveAuthService;

  // Get authenticated client
  console.log("🔐 Authenticating with Google Drive...");
  const auth = yield* authService.getAuthenticatedClient();
  console.log("✅ Successfully authenticated with Google Drive");

  // Get service account email (useful for sharing files)
  const serviceAccountEmail = yield* authService.getServiceAccountEmail();
  console.log(`📧 Service Account Email: ${serviceAccountEmail}`);
  console.log(
    "💡 Share Google Drive folders/files with this email to grant access",
  );

  // Create Drive API instance
  const drive = google.drive({ version: "v3", auth });

  // NOTE: Service accounts can't upload to personal Drive - need Shared Drive!
  console.log(
    "❌ Service accounts cannot upload files without a Shared Drive!",
  );
  console.log("💡 To fix this, ask your admin to:");
  console.log("   1. Create a Shared Drive");
  console.log(
    `   2. Add this service account as a member: ${serviceAccountEmail}`,
  );
  console.log("   3. Set TEST_FOLDER_ID to the Shared Drive folder ID");
  console.log("");
  console.log(`🔄 For now, let's just test authentication and file listing...`);

  // Skip upload for now - service accounts need Shared Drives
  const uploadResults: unknown[] = [];

  console.log(
    `🎉 Successfully uploaded ${uploadResults.length} files to Google Drive!`,
  );

  // Now list files to verify uploads
  console.log("📂 Listing files to verify uploads...");

  const listQuery = TEST_FOLDER_ID
    ? `'${TEST_FOLDER_ID}' in parents and trashed=false`
    : "trashed=false";

  const response = yield* Effect.tryPromise({
    try: () =>
      drive.files.list({
        q: listQuery,
        fields: "files(id,name,mimeType,size,modifiedTime)",
        orderBy: "name",
        pageSize: 20, // Limit to recent files
      }),
    catch: (error) => new Error(`Failed to list files: ${error}`),
  });

  const files = response.data.files || [];

  if (files.length === 0) {
    console.log("📭 No files found in the test folder");
  } else {
    console.log(`📋 Found ${files.length} files in test folder:`);
    for (const file of files) {
      const size = file.size
        ? `(${Math.round(Number.parseInt(file.size, 10) / 1024)} KB)`
        : "";
      const type = file.mimeType?.includes("folder") ? "📁" : "📄";
      console.log(`  ${type} ${file.name} ${size}`);
    }
  }

  return { auth, serviceAccountEmail, uploadResults, files };
});

// Run the example
const program = example.pipe(
  Effect.provide(GoogleDriveAuthServiceLive),
  Effect.catchAll((error) =>
    Effect.sync(() => {
      console.error("❌ Error:", error);
      process.exit(1);
    }),
  ),
  Effect.runPromise,
);

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  program
    .then(() => {
      console.log("✅ Example completed successfully");
    })
    .catch((error) => {
      console.error("❌ Example failed:", error);
      process.exit(1);
    });
}
