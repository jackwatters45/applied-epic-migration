import { Effect, Layer } from "effect";
import { ConfigService } from "./lib/config.js";
import { GoogleDriveAuthService } from "./services/google-drive/auth.js";

// Example usage program
const exampleProgram = Effect.gen(function* () {
  const config = yield* ConfigService;
  const authService = yield* GoogleDriveAuthService;

  console.log("🔧 Configuration loaded successfully");
  console.log(
    `📁 Google Drive Key Path: ${config.googleDrive.serviceAccountKeyPath}`,
  );
  console.log(
    `🔐 Google Drive Scopes: ${config.googleDrive.scopes.join(", ")}`,
  );

  console.log("\n🔐 Testing Google Drive authentication...");

  // Test authentication
  yield* authService.getAuthenticatedClient();
  console.log("✅ Successfully authenticated with Google Drive");

  // Get service account email
  const serviceAccountEmail = yield* authService.getServiceAccountEmail();
  console.log(`📧 Service Account Email: ${serviceAccountEmail}`);

  console.log("\n🎉 Google Drive service test complete!");
});

const mainLayer = Layer.mergeAll(
  GoogleDriveAuthService.Default,
  ConfigService.Default,
);

// Run the program
Effect.runPromise(exampleProgram.pipe(Effect.provide(mainLayer))).catch(
  (error: unknown) => {
    console.error("💥 Unexpected error:", error);
    process.exit(1);
  },
);
