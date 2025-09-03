import * as fs from "node:fs";
import * as path from "node:path";
import * as MsgReader from "@kenjiuno/msgreader";
import { Context, Effect, Layer } from "effect";

export interface MsgToPdfConfig {
  readonly gotenbergUrl?: string;
  readonly outputDir?: string;
  readonly pdfFormat?: "A4" | "Letter" | "Legal";
  readonly landscape?: boolean;
  readonly scale?: number;
  readonly marginTop?: string;
  readonly marginBottom?: string;
  readonly marginLeft?: string;
  readonly marginRight?: string;
}

export class MsgToPdfError extends Error {
  readonly _tag = "MsgToPdfError";
  constructor(
    readonly type:
      | "ReadError"
      | "ConversionError"
      | "WriteError"
      | "ServiceError"
      | "ValidationError",
    readonly message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MsgToPdfError";
  }
}

interface EmailHeaders {
  From?: string;
  To?: string;
  Cc?: string;
  Bcc?: string;
  Subject?: string;
  Date?: string;
  MessageId?: string;
}

interface EmailAttachment {
  fileName: string;
  size: number | undefined;
  contentType: string;
}

// TypeScript interfaces for MSG file structure
interface MsgRecipient {
  readonly recipientType: number; // 1 = TO, 2 = CC, 3 = BCC
  readonly name?: string;
  readonly email?: string;
  readonly smtpAddress?: string;
}

interface MsgAttachment {
  readonly fileName?: string;
  readonly fileSize?: number;
  readonly contentType?: string;
}

interface MsgData {
  readonly senderSmtpAddress?: string;
  readonly senderName?: string;
  readonly recipients?: readonly MsgRecipient[];
  readonly subject?: string;
  readonly clientSubmitTime?: string | number | Date;
  readonly messageId?: string;
  readonly attachments?: readonly MsgAttachment[];
  readonly body?: string;
  readonly bodyHtml?: string;
}

export class MsgToPdfService extends Context.Tag("MsgToPdfService")<
  MsgToPdfService,
  {
    readonly convert: (
      msgFilePath: string,
      outputPath?: string,
    ) => Effect.Effect<string, MsgToPdfError>;
    readonly convertMany: (
      msgFilePaths: string[],
      outputDir?: string,
    ) => Effect.Effect<string[], MsgToPdfError>;
    readonly convertBuffer: (
      msgBuffer: Buffer,
      fileName: string,
    ) => Effect.Effect<Buffer, MsgToPdfError>;
    readonly validateMsgFile: (
      msgFilePath: string,
    ) => Effect.Effect<boolean, MsgToPdfError>;
  }
>() {}

const formatEmailAddress = (name?: string, email?: string): string => {
  if (!email) return "";
  return name ? `${name} <${email}>` : email;
};

const extractHeaders = (msgData: MsgData): EmailHeaders => {
  const headers: EmailHeaders = {};

  if (msgData.senderSmtpAddress) {
    headers.From = formatEmailAddress(
      msgData.senderName,
      msgData.senderSmtpAddress,
    );
  }

  const recipients = msgData.recipients || [];

  const toRecipients = recipients
    .filter((r: MsgRecipient) => r.recipientType === 1)
    .map((r: MsgRecipient) =>
      formatEmailAddress(r.name, r.email || r.smtpAddress),
    )
    .filter(Boolean)
    .join(", ");
  if (toRecipients) headers.To = toRecipients;

  const ccRecipients = recipients
    .filter((r: MsgRecipient) => r.recipientType === 2)
    .map((r: MsgRecipient) =>
      formatEmailAddress(r.name, r.email || r.smtpAddress),
    )
    .filter(Boolean)
    .join(", ");
  if (ccRecipients) headers.Cc = ccRecipients;

  const bccRecipients = recipients
    .filter((r: MsgRecipient) => r.recipientType === 3)
    .map((r: MsgRecipient) =>
      formatEmailAddress(r.name, r.email || r.smtpAddress),
    )
    .filter(Boolean)
    .join(", ");
  if (bccRecipients) headers.Bcc = bccRecipients;

  if (msgData.subject) headers.Subject = msgData.subject;

  if (msgData.clientSubmitTime) {
    const date = new Date(msgData.clientSubmitTime);
    headers.Date = date.toLocaleString();
  }

  if (msgData.messageId) headers.MessageId = msgData.messageId;

  return headers;
};

const extractAttachments = (msgData: MsgData): EmailAttachment[] => {
  if (!msgData.attachments || !Array.isArray(msgData.attachments)) {
    return [];
  }

  return msgData.attachments
    .filter((att: MsgAttachment): att is MsgAttachment & { fileName: string } =>
      Boolean(att.fileName),
    )
    .map((att: MsgAttachment & { fileName: string }) => ({
      fileName: att.fileName,
      size: att.fileSize,
      contentType: att.contentType || "application/octet-stream",
    }));
};

const msgToHtml = (msgBuffer: Buffer): string => {
  const arrayBuffer = msgBuffer.buffer.slice(
    msgBuffer.byteOffset,
    msgBuffer.byteOffset + msgBuffer.byteLength,
  ) as ArrayBuffer;

  const msgReader = new MsgReader.default(arrayBuffer);
  const msgData = msgReader.getFileData() as unknown as MsgData;

  const headers = extractHeaders(msgData);
  const attachments = extractAttachments(msgData);

  let bodyContent = "";
  if (msgData.bodyHtml) {
    bodyContent = msgData.bodyHtml;
  } else if (msgData.body) {
    bodyContent = `<pre style="white-space: pre-wrap; word-wrap: break-word;">${msgData.body
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</pre>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${headers.Subject || "Email Message"}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: #ffffff;
      color: #333;
    }
    .email-container {
      max-width: 800px;
      margin: 0 auto;
    }
    .email-header {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .header-row {
      display: flex;
      margin-bottom: 8px;
    }
    .header-row:last-child {
      margin-bottom: 0;
    }
    .header-label {
      font-weight: 600;
      min-width: 80px;
      color: #495057;
    }
    .header-value {
      flex: 1;
      color: #212529;
      word-break: break-word;
    }
    .email-subject {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 2px solid #dee2e6;
      color: #212529;
    }
    .email-body {
      padding: 20px 0;
      line-height: 1.6;
    }
    .attachments-section {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #dee2e6;
    }
    .attachments-title {
      font-weight: 600;
      margin-bottom: 12px;
      color: #495057;
    }
    .attachment-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .attachment-item {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      margin-bottom: 6px;
      background: #f8f9fa;
      border-radius: 4px;
      font-size: 14px;
    }
    .attachment-icon {
      margin-right: 8px;
      color: #6c757d;
    }
    .attachment-name {
      flex: 1;
      color: #495057;
    }
    .attachment-size {
      color: #6c757d;
      font-size: 12px;
      margin-left: 12px;
    }
    @media print {
      body {
        padding: 0;
      }
      .email-container {
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    ${headers.Subject ? `<div class="email-subject">${headers.Subject}</div>` : ""}

    <div class="email-header">
      ${
        headers.From
          ? `
      <div class="header-row">
        <span class="header-label">From:</span>
        <span class="header-value">${headers.From}</span>
      </div>`
          : ""
      }

      ${
        headers.To
          ? `
      <div class="header-row">
        <span class="header-label">To:</span>
        <span class="header-value">${headers.To}</span>
      </div>`
          : ""
      }

      ${
        headers.Cc
          ? `
      <div class="header-row">
        <span class="header-label">CC:</span>
        <span class="header-value">${headers.Cc}</span>
      </div>`
          : ""
      }

      ${
        headers.Date
          ? `
      <div class="header-row">
        <span class="header-label">Date:</span>
        <span class="header-value">${headers.Date}</span>
      </div>`
          : ""
      }
    </div>

    <div class="email-body">
      ${bodyContent}
    </div>

    ${
      attachments.length > 0
        ? `
    <div class="attachments-section">
      <div class="attachments-title">Attachments (${attachments.length})</div>
      <ul class="attachment-list">
        ${attachments
          .map(
            (att) => `
        <li class="attachment-item">
          <span class="attachment-icon">📎</span>
          <span class="attachment-name">${att.fileName}</span>
          ${att.size ? `<span class="attachment-size">${formatFileSize(att.size)}</span>` : ""}
        </li>
        `,
          )
          .join("")}
      </ul>
    </div>
    `
        : ""
    }
  </div>
</body>
</html>`;

  return html;
};

const formatFileSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const makeService = (
  config: MsgToPdfConfig = {},
): {
  readonly convert: (
    msgFilePath: string,
    outputPath?: string,
  ) => Effect.Effect<string, MsgToPdfError>;
  readonly convertMany: (
    msgFilePaths: string[],
    outputDir?: string,
  ) => Effect.Effect<string[], MsgToPdfError>;
  readonly convertBuffer: (
    msgBuffer: Buffer,
    fileName: string,
  ) => Effect.Effect<Buffer, MsgToPdfError>;
  readonly validateMsgFile: (
    msgFilePath: string,
  ) => Effect.Effect<boolean, MsgToPdfError>;
} => ({
  validateMsgFile: (msgFilePath: string) =>
    Effect.gen(function* () {
      const exists = yield* Effect.tryPromise({
        try: async () => {
          const stats = await fs.promises.stat(msgFilePath);
          return stats.isFile();
        },
        catch: (error) =>
          new MsgToPdfError(
            "ValidationError",
            `File not found: ${msgFilePath}`,
            error,
          ),
      });

      const extension = path.extname(msgFilePath).toLowerCase();
      if (extension !== ".msg") {
        return yield* Effect.fail(
          new MsgToPdfError(
            "ValidationError",
            `Invalid file extension: ${extension}. Expected .msg`,
          ),
        );
      }

      return exists;
    }),

  convert: (msgFilePath: string, outputPath?: string) =>
    Effect.gen(function* () {
      const gotenbergUrl = config.gotenbergUrl || "http://localhost:3001";

      yield* makeService(config).validateMsgFile(msgFilePath);

      const resolvedOutputPath =
        outputPath ||
        path.join(
          config.outputDir || path.dirname(msgFilePath),
          `${path.basename(msgFilePath, ".msg")}.pdf`,
        );

      const msgBuffer = yield* Effect.tryPromise({
        try: () => fs.promises.readFile(msgFilePath),
        catch: (error) =>
          new MsgToPdfError(
            "ReadError",
            `Failed to read MSG file: ${error}`,
            error,
          ),
      });

      const htmlContent = yield* Effect.try({
        try: () => msgToHtml(msgBuffer),
        catch: (error) =>
          new MsgToPdfError(
            "ConversionError",
            `Failed to convert MSG to HTML: ${error}`,
            error,
          ),
      });

      const formData = new FormData();
      const htmlBlob = new Blob([htmlContent], { type: "text/html" });
      formData.append(
        "files",
        htmlBlob,
        `${path.basename(msgFilePath, ".msg")}.html`,
      );

      if (config.pdfFormat) {
        formData.append("pdfFormat", config.pdfFormat);
      }
      if (config.landscape !== undefined) {
        formData.append("landscape", String(config.landscape));
      }
      if (config.scale !== undefined) {
        formData.append("scale", String(config.scale));
      }
      if (config.marginTop) {
        formData.append("marginTop", config.marginTop);
      }
      if (config.marginBottom) {
        formData.append("marginBottom", config.marginBottom);
      }
      if (config.marginLeft) {
        formData.append("marginLeft", config.marginLeft);
      }
      if (config.marginRight) {
        formData.append("marginRight", config.marginRight);
      }

      const response = yield* Effect.tryPromise({
        try: async () => {
          const res = await fetch(
            `${gotenbergUrl}/forms/chromium/convert/html`,
            {
              method: "POST",
              body: formData,
            },
          );

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(
              `Gotenberg conversion failed (${res.status}): ${errorText}`,
            );
          }

          return res;
        },
        catch: (error) =>
          new MsgToPdfError(
            "ServiceError",
            `Failed to connect to Gotenberg service: ${error}`,
            error,
          ),
      });

      const pdfBuffer = yield* Effect.tryPromise({
        try: async () => Buffer.from(await response.arrayBuffer()),
        catch: (error) =>
          new MsgToPdfError(
            "ConversionError",
            `Failed to read PDF response: ${error}`,
            error,
          ),
      });

      yield* Effect.tryPromise({
        try: () => fs.promises.writeFile(resolvedOutputPath, pdfBuffer),
        catch: (error) =>
          new MsgToPdfError(
            "WriteError",
            `Failed to write PDF file: ${error}`,
            error,
          ),
      });

      return resolvedOutputPath;
    }),

  convertMany: (msgFilePaths: string[], outputDir?: string) =>
    Effect.gen(function* () {
      const results: string[] = [];

      for (const filePath of msgFilePaths) {
        const outputPath = outputDir
          ? path.join(outputDir, `${path.basename(filePath, ".msg")}.pdf`)
          : undefined;

        const result = yield* Effect.retry(
          makeService(config).convert(filePath, outputPath),
          { times: 2 },
        );

        results.push(result);
      }

      return results;
    }),

  convertBuffer: (msgBuffer: Buffer, fileName: string) =>
    Effect.gen(function* () {
      const gotenbergUrl = config.gotenbergUrl || "http://localhost:3001";

      const htmlContent = yield* Effect.try({
        try: () => msgToHtml(msgBuffer),
        catch: (error) =>
          new MsgToPdfError(
            "ConversionError",
            `Failed to convert MSG to HTML: ${error}`,
            error,
          ),
      });

      const formData = new FormData();
      const htmlBlob = new Blob([htmlContent], { type: "text/html" });
      formData.append(
        "files",
        htmlBlob,
        `${fileName.replace(".msg", ".html")}`,
      );

      if (config.pdfFormat) {
        formData.append("pdfFormat", config.pdfFormat);
      }
      if (config.landscape !== undefined) {
        formData.append("landscape", String(config.landscape));
      }
      if (config.scale !== undefined) {
        formData.append("scale", String(config.scale));
      }
      if (config.marginTop) {
        formData.append("marginTop", config.marginTop);
      }
      if (config.marginBottom) {
        formData.append("marginBottom", config.marginBottom);
      }
      if (config.marginLeft) {
        formData.append("marginLeft", config.marginLeft);
      }
      if (config.marginRight) {
        formData.append("marginRight", config.marginRight);
      }

      const response = yield* Effect.tryPromise({
        try: async () => {
          const res = await fetch(
            `${gotenbergUrl}/forms/chromium/convert/html`,
            {
              method: "POST",
              body: formData,
            },
          );

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(
              `Gotenberg conversion failed (${res.status}): ${errorText}`,
            );
          }

          return res;
        },
        catch: (error) =>
          new MsgToPdfError(
            "ServiceError",
            `Failed to connect to Gotenberg service: ${error}`,
            error,
          ),
      });

      const pdfBuffer = yield* Effect.tryPromise({
        try: async () => Buffer.from(await response.arrayBuffer()),
        catch: (error) =>
          new MsgToPdfError(
            "ConversionError",
            `Failed to read PDF response: ${error}`,
            error,
          ),
      });

      return pdfBuffer;
    }),
});

export const MsgToPdfLive = (config?: MsgToPdfConfig) =>
  Layer.succeed(MsgToPdfService, MsgToPdfService.of(makeService(config)));

export const convertMsgToPdf = (
  msgFilePath: string,
  outputPath?: string,
  config?: MsgToPdfConfig,
) =>
  Effect.gen(function* () {
    const service = yield* MsgToPdfService;
    return yield* service.convert(msgFilePath, outputPath);
  }).pipe(Effect.provide(MsgToPdfLive(config)));

export const convertManyMsgToPdf = (
  msgFilePaths: string[],
  outputDir?: string,
  config?: MsgToPdfConfig,
) =>
  Effect.gen(function* () {
    const service = yield* MsgToPdfService;
    return yield* service.convertMany(msgFilePaths, outputDir);
  }).pipe(Effect.provide(MsgToPdfLive(config)));

export const convertMsgBufferToPdf = (
  msgBuffer: Buffer,
  fileName: string,
  config?: MsgToPdfConfig,
) =>
  Effect.gen(function* () {
    const service = yield* MsgToPdfService;
    return yield* service.convertBuffer(msgBuffer, fileName);
  }).pipe(Effect.provide(MsgToPdfLive(config)));
