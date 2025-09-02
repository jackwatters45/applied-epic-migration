import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AttachmentsService, AttachmentsServiceLive } from "./attachments.js";
import { AuthServiceLive } from "./auth.js";
import { DownloadService, DownloadServiceLive } from "./download.js";
import type { ListAttachmentsParams } from "./lib/types.js";

// Create the application layer
export const AppLayer = Layer.mergeAll(
  AuthServiceLive,
  AttachmentsServiceLive,
  DownloadServiceLive,
);

/**
 * Simple function to download all accessible attachments for a specific account
 */
export const downloadAccountAttachments = (
  accountId: string,
  outputPath = "./downloads",
) =>
  Effect.gen(function* () {
    const attachmentsService = yield* AttachmentsService;
    const downloadService = yield* DownloadService;

    console.log(`🔍 Finding attachments for account: ${accountId}`);

    // List attachments for the specific account
    const params: ListAttachmentsParams = {
      account: accountId,
      clientAccessible: true,
      active_status: "active",
      limit: 100, // Adjust as needed
    };

    const attachmentsResponse =
      yield* attachmentsService.listAttachments(params);

    if (attachmentsResponse.total === 0) {
      console.log("📭 No attachments found for this account");
      return { downloaded: 0, skipped: 0, errors: 0 };
    }

    console.log(`📄 Found ${attachmentsResponse.total} attachments`);

    let downloaded = 0;
    let skipped = 0;
    let errors = 0;

    for (const attachment of attachmentsResponse._embedded.attachments) {
      try {
        if (attachment.file.url && attachment.file.status === "OK") {
          console.log(`⬇️  Downloading: ${attachment.description}`);

          const result = yield* downloadService.downloadAttachment(
            attachment,
            outputPath,
          );

          if (result.success) {
            console.log(`✅ Downloaded: ${result.fileName}`);
            downloaded++;
          } else {
            console.log(`❌ Failed: ${result.message}`);
            errors++;
          }
        } else {
          console.log(
            `⏭️  Skipped: ${attachment.description} (no URL or invalid status)`,
          );
          skipped++;
        }
      } catch (error) {
        console.log(`❌ Error processing ${attachment.description}:`, error);
        errors++;
      }
    }

    console.log("\n📊 Summary:");
    console.log(`   Downloaded: ${downloaded}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);

    return { downloaded, skipped, errors };
  });

/**
 * Download a specific attachment by ID
 */
export const downloadAttachmentById = (
  attachmentId: string,
  outputPath = "./downloads",
) =>
  Effect.gen(function* () {
    const attachmentsService = yield* AttachmentsService;
    const downloadService = yield* DownloadService;

    console.log(`🔍 Getting attachment: ${attachmentId}`);

    // Get the attachment details
    const attachment = yield* attachmentsService.getAttachment(attachmentId);

    console.log(`📎 Found: ${attachment.description}`);

    // Download the attachment
    const result = yield* downloadService.downloadAttachment(
      attachment,
      outputPath,
    );

    if (result.success) {
      console.log(`✅ Downloaded: ${result.fileName}`);
      console.log(`   Saved to: ${result.filePath}`);
    } else {
      console.log(`❌ Download failed: ${result.message}`);
    }

    return result;
  });

// Example usage (uncomment to run):
/*
// Run with account ID
Effect.runPromise(
  Effect.provide(
    downloadAccountAttachments("your-account-id"),
    AppLayer
  )
).catch(console.error)

// Run with attachment ID
Effect.runPromise(
  Effect.provide(
    downloadAttachmentById("your-attachment-id"),
    AppLayer
  )
).catch(console.error)
*/
