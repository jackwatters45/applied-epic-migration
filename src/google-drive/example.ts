import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { GoogleDriveAuthService, GoogleDriveAuthServiceLive } from "./auth.js";
import { GoogleDriveFileService, GoogleDriveFileServiceLive } from "./file.js";

// Example program using Google Drive services
const exampleProgram = Effect.gen(function* () {
  const authService = yield* GoogleDriveAuthService;
  const fileService = yield* GoogleDriveFileService;

  console.log("🔍 Authenticating with Google Drive...");

  // Get authenticated client
  yield* authService.getAuthenticatedClient();

  console.log("✅ Successfully authenticated with Google Drive");

  console.log("📁 Listing files from Google Drive...");

  // List files
  const files = yield* fileService.listFiles();

  console.log(`📄 Found ${files.length} files:`);
  files.forEach((file) => {
    console.log(`  - ${file.name} (${file.mimeType})`);
  });

  return {
    success: true,
    message: "Google Drive operations completed successfully",
  };
});

// Create the application layer with proper dependency chain
const AppLayer = Layer.merge(
  GoogleDriveAuthServiceLive,
  Layer.provide(GoogleDriveFileServiceLive, GoogleDriveAuthServiceLive),
);

// Run the example program
Effect.runPromise(Effect.provide(exampleProgram, AppLayer))
  .then((result) => {
    console.log("🎉 Example completed:", result);
  })
  .catch((error) => {
    console.error("💥 Example failed:", error);
    process.exit(1);
  });
