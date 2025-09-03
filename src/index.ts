import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AttachmentsService, AttachmentsServiceLive } from "./attachments.js";
import { DownloadService, DownloadServiceLive } from "./download.js";
import { AuthService, AuthServiceLive } from "./lib/auth.js";
import { ConfigService } from "./lib/config.js";

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

  // Configuration is loaded from environment variables:
  // APPLIED_EPIC_CLIENT_ID, APPLIED_EPIC_CLIENT_SECRET, APPLIED_EPIC_ENV
  const config = configService.getConfig();

  if (!configService.validateCredentials()) {
    console.log("⚠️  No credentials configured. Using mock API.");
    console.log(
      "   Set APPLIED_EPIC_CLIENT_ID and APPLIED_EPIC_CLIENT_SECRET to use real API.",
    );
  }

  console.log(`🌍 Using ${config.baseUrl}`);
  console.log("🔐 Authenticating with Applied Epic API...");

  // Get access token
  yield* authService.getAccessToken();
  console.log("✅ Authentication successful");

  console.log("📋 Listing attachments...");

  // Default params for listing attachments
  const params = {
    embed: "folder,account,organizations,accessLevel",
    limit: 100,
    active_status: "active,inactive",
    fileStatus: "OK",
  };

  console.log("📝 Request params:", params);

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

    // Skip inactive or quarantined files
    if (!attachment.active || attachment.file.status !== "OK") {
      console.log("⏭️  Skipping (inactive or invalid status)");
      continue;
    }

    // Get individual attachment details (includes download URL)
    console.log("📥 Fetching attachment details...");
    const fullAttachment = yield* attachmentsService.getAttachment(
      attachment.id,
    );

    // Download the attachment if it has a URL
    if (fullAttachment.file?.url) {
      console.log(`   URL: ${fullAttachment.file.url}`);
      console.log(
        `   Extension: ${fullAttachment.file.extension || "unknown"}`,
      );
      console.log(`   Size: ${fullAttachment.file.size || "unknown"} bytes`);

      console.log("⬇️  Downloading file...");

      const downloadResult = yield* Effect.either(
        downloadService.downloadAttachment(
          fullAttachment,
          "/Users/jw/Desktop/applied-epic-migration",
        ),
      );

      if (downloadResult._tag === "Right") {
        const result = downloadResult.right;
        if (result.success) {
          console.log(`✅ Downloaded: ${result.fileName}`);
          console.log(`   Size: ${result.size} bytes`);
          console.log(`   Saved to: ${result.filePath}`);
        } else {
          console.log(`❌ Download failed: ${result.message}`);
        }
      } else {
        const error = downloadResult.left;
        console.log(`⚠️  Download error: ${error.message || "Unknown error"}`);
        // Continue processing other attachments even if one fails
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
