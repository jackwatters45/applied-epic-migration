/**
 * Mock MSG file generator for testing purposes
 *
 * This creates a minimal MSG file structure that can be used for testing
 * the MSG to PDF conversion pipeline without requiring real MSG files.
 *
 * Note: This is for testing only and creates a very basic structure.
 * Real MSG files are complex OLE compound files.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface MockMsgOptions {
  subject?: string;
  from?: string;
  to?: string;
  body?: string;
  date?: Date;
  attachments?: Array<{
    name: string;
    size: number;
    contentType: string;
  }>;
}

/**
 * Create a mock MSG file buffer for testing
 */
export function createMockMsgBuffer(options: MockMsgOptions = {}): Buffer {
  const {
    subject = "Test Email Subject",
    from = "sender@example.com",
    to = "recipient@example.com",
    body = "This is a test email body for MSG to PDF conversion testing.",
    date = new Date(),
    attachments = [],
  } = options;

  // Create a minimal MSG-like structure
  // This is a simplified representation - real MSG files use OLE compound file format
  const msgData = {
    subject,
    senderSmtpAddress: from,
    senderName: from.split("@")[0],
    recipients: [
      {
        recipientType: 1, // TO
        email: to,
        name: to.split("@")[0],
        smtpAddress: to,
      },
    ],
    body,
    bodyHtml: `<html><body><p>${body.replace(/\n/g, "<br>")}</p></body></html>`,
    clientSubmitTime: date.toISOString(),
    messageId: `<test-${Date.now()}@example.com>`,
    attachments: attachments.map((att, index) => ({
      fileName: att.name,
      fileSize: att.size,
      contentType: att.contentType,
      attachmentId: `att-${index + 1}`,
    })),
  };

  // Convert to JSON and then to Buffer (simplified - real MSG uses binary format)
  const jsonString = JSON.stringify(msgData, null, 2);
  return Buffer.from(jsonString);
}

/**
 * Save a mock MSG file to disk for testing
 */
export async function saveMockMsgFile(
  filePath: string,
  options: MockMsgOptions = {},
): Promise<string> {
  const buffer = createMockMsgBuffer(options);

  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });

  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Create multiple mock MSG files for batch testing
 */
export async function createMockMsgBatch(
  baseDir: string,
  count = 3,
): Promise<string[]> {
  const files: string[] = [];

  for (let i = 1; i <= count; i++) {
    const options: MockMsgOptions = {
      subject: `Test Email ${i}`,
      from: `sender${i}@example.com`,
      to: `recipient${i}@example.com`,
      body: `This is test email number ${i} for batch MSG to PDF conversion testing.\n\nThis email contains multiple lines to test formatting.`,
      date: new Date(Date.now() - i * 24 * 60 * 60 * 1000), // Different dates
      attachments:
        i === 1
          ? [
              {
                name: "document.pdf",
                size: 1024000,
                contentType: "application/pdf",
              },
              { name: "image.jpg", size: 512000, contentType: "image/jpeg" },
            ]
          : [],
    };

    const filePath = path.join(baseDir, `test-email-${i}.msg`);
    await saveMockMsgFile(filePath, options);
    files.push(filePath);
  }

  return files;
}

/**
 * Predefined mock configurations for common testing scenarios
 */
export const mockScenarios = {
  simple: {
    subject: "Simple Test Email",
    from: "test@example.com",
    to: "user@example.com",
    body: "This is a simple test email.",
  },

  withAttachments: {
    subject: "Email with Attachments",
    from: "sender@example.com",
    to: "recipient@example.com",
    body: "This email contains attachments for testing.",
    attachments: [
      { name: "report.pdf", size: 2048000, contentType: "application/pdf" },
      {
        name: "data.xlsx",
        size: 1024000,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { name: "photo.jpg", size: 512000, contentType: "image/jpeg" },
    ] as Array<{ name: string; size: number; contentType: string }>,
  },

  longContent: {
    subject: "Long Email Content",
    from: "author@example.com",
    to: "reader@example.com",
    body: `This is a longer email with multiple paragraphs.

Paragraph 2: This tests how the conversion handles longer content and multiple lines.

Paragraph 3: It also tests formatting preservation and text wrapping in the PDF output.

Paragraph 4: The conversion should maintain readability and proper spacing.

Thank you for testing the MSG to PDF conversion functionality!`.repeat(3),
  },

  htmlContent: {
    subject: "HTML Email Test",
    from: "html@example.com",
    to: "user@example.com",
    body: "This email contains HTML content that should be preserved in PDF conversion.",
  },
} as const;

/**
 * Utility to create mock MSG file from predefined scenarios
 */
export async function createMockFromScenario(
  scenario: keyof typeof mockScenarios,
  outputPath: string,
): Promise<string> {
  return saveMockMsgFile(outputPath, mockScenarios[scenario]);
}

// Example usage (when run directly)
if (import.meta.main) {
  console.log("Creating mock MSG files for testing...");

  const outputDir = "./downloads/mock-msgs";

  // Create individual test files
  await createMockFromScenario("simple", path.join(outputDir, "simple.msg"));
  await createMockFromScenario(
    "withAttachments",
    path.join(outputDir, "with-attachments.msg"),
  );
  await createMockFromScenario(
    "longContent",
    path.join(outputDir, "long-content.msg"),
  );

  // Create batch of test files
  const batchFiles = await createMockMsgBatch(path.join(outputDir, "batch"), 5);

  console.log("✅ Mock MSG files created:");
  console.log(`   Simple: ${path.join(outputDir, "simple.msg")}`);
  console.log(
    `   With attachments: ${path.join(outputDir, "with-attachments.msg")}`,
  );
  console.log(`   Long content: ${path.join(outputDir, "long-content.msg")}`);
  console.log(`   Batch files: ${batchFiles.join(", ")}`);
}
