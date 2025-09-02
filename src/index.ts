import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AttachmentsService, AttachmentsServiceLive } from "./attachments.js";
import { AuthService, AuthServiceLive } from "./auth.js";
import { ConfigService } from "./config.js";
import { DownloadService, DownloadServiceLive } from "./download.js";
import type { ListAttachmentsParams } from "./types.js";

// Create the main application layer
const AppLayer = Layer.merge(
  AuthServiceLive,
  Layer.merge(
    Layer.provide(AttachmentsServiceLive, AuthServiceLive),
    Layer.provide(DownloadServiceLive, AuthServiceLive),
  ),
);

// Example usage program
const exampleProgram = Effect.gen(function* () {
  const configService = ConfigService.getInstance();
  const authService = yield* AuthService;
  const attachmentsService = yield* AttachmentsService;
  const downloadService = yield* DownloadService;

  // Configure credentials (in production, use environment variables)
  configService.setCredentials({
    clientId: process.env.APPLIED_EPIC_CLIENT_ID || "your-client-id",
    clientSecret:
      process.env.APPLIED_EPIC_CLIENT_SECRET || "your-client-secret",
    baseUrl: "https://api.mock.myappliedproducts.com",
  });

  // Set to production if needed
  // configService.setEnvironment(true)

  console.log("🔐 Authenticating with Applied Epic API...");

  // Get access token
  yield* authService.getAccessToken();
  console.log("✅ Authentication successful");

  console.log("📋 Listing attachments...");

  // List attachments with optional filters
  const params: ListAttachmentsParams = {
    limit: 10,
    clientAccessible: true,
    active_status: "active",
  };

  const attachmentsResponse = yield* attachmentsService.listAttachments(params);
  console.log(`📄 Found ${attachmentsResponse.total} attachments`);

  // Process first few attachments
  const attachments = attachmentsResponse._embedded.attachments.slice(0, 3);

  for (const attachment of attachments) {
    console.log(`\n📎 Processing attachment: ${attachment.description}`);
    console.log(`   ID: ${attachment.id}`);
    console.log(`   Active: ${attachment.active}`);
    console.log(`   Client Accessible: ${attachment.clientAccessible}`);
    console.log(`   File Status: ${attachment.file.status}`);

    // Download the attachment if it has a URL
    if (attachment.file.url) {
      console.log("⬇️  Downloading attachment...");

      const downloadResult = yield* downloadService.downloadAttachment(
        attachment,
        "./downloads",
      );

      if (downloadResult.success) {
        console.log(`✅ Downloaded: ${downloadResult.fileName}`);
        console.log(`   Size: ${downloadResult.size} bytes`);
        console.log(`   Saved to: ${downloadResult.filePath}`);
      } else {
        console.log(`❌ Download failed: ${downloadResult.message}`);
      }
    } else {
      console.log("⚠️  No download URL available for this attachment");
    }
  }

  console.log("\n🎉 Processing complete!");
});

// For now, use the program directly without error handling
const mainProgram = exampleProgram;

// Run the program
Effect.runPromise(Effect.provide(mainProgram, AppLayer)).catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});
