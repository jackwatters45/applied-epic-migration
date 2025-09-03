import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ListAttachmentsParams } from "../../lib/types.js";
import { AttachmentsService, AttachmentsServiceLive } from "./attachments.js";
import { AuthServiceLive } from "./auth.js";
import { DownloadService, DownloadServiceLive } from "./download.js";

// Create the application layer with proper dependencies
export const AppLayer = Layer.merge(
  AuthServiceLive,
  Layer.merge(
    Layer.provide(AttachmentsServiceLive, AuthServiceLive),
    DownloadServiceLive,
  ),
);

/**
 * Simple function to download all accessible attachments for a specific account
 */
export const downloadAccountAttachments = (
  accountId: string,
  outputPath = "/Users/jw/Desktop/applied-epic-migration",
) =>
  Effect.gen(function* () {
    const attachmentsService = yield* AttachmentsService;
    const downloadService = yield* DownloadService;

    console.log(`🔍 Finding attachments for account: ${accountId}`);

    // List attachments for the specific account
    const params: ListAttachmentsParams = {
      ...(accountId ? { account: accountId } : {}), // Only add account filter if provided
      clientAccessible: true,
      active_status: "active",
      fileStatus: "OK", // Only get downloadable files
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
      console.log(`\n📎 Processing: ${attachment.description}`);

      // Skip inactive or problematic files
      if (!attachment.active || attachment.file.status !== "OK") {
        console.log(
          `   ⏭️  Skipped: ${!attachment.active ? "Inactive" : `Status: ${attachment.file.status}`}`,
        );
        skipped++;
        continue;
      }

      // Get full attachment details (includes download URL)
      const fullAttachmentResult = yield* Effect.either(
        attachmentsService.getAttachment(attachment.id),
      );

      if (fullAttachmentResult._tag === "Left") {
        console.log(
          `   ❌ Failed to get details: ${fullAttachmentResult.left.message}`,
        );
        errors++;
        continue;
      }

      const fullAttachment = fullAttachmentResult.right;

      if (!fullAttachment.file?.url) {
        console.log("   ⏭️  Skipped: No download URL");
        skipped++;
        continue;
      }

      console.log(`   ⬇️  Downloading from: ${fullAttachment.file.url}`);

      // Try to download with error handling
      const downloadResult = yield* Effect.either(
        downloadService.downloadAttachment(fullAttachment, outputPath),
      );

      if (downloadResult._tag === "Right" && downloadResult.right.success) {
        console.log(`   ✅ Downloaded: ${downloadResult.right.fileName}`);
        downloaded++;
      } else {
        const errorMsg =
          downloadResult._tag === "Left"
            ? downloadResult.left.message
            : downloadResult.right.message;
        console.log(`   ❌ Failed: ${errorMsg}`);
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
  outputPath = "/Users/jw/Desktop/applied-epic-migration",
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
