import * as fs from "node:fs";
import { Effect } from "effect";
import {
  convertManyMsgToPdf,
  convertMsgBufferToPdf,
  convertMsgToPdf,
  type MsgToPdfConfig,
} from "./index.js";

/**
 * Example: Convert a single MSG file to PDF
 */
export const exampleSingleConversion = async () => {
  console.log("🔄 Converting single MSG file to PDF...");

  const msgFilePath = "./downloads/example.msg";
  const outputPath = "./logs/msg-to-pdf/single/example.pdf";

  const config: MsgToPdfConfig = {
    pdfFormat: "A4",
    landscape: false,
    scale: 1.0,
    marginTop: "1in",
    marginBottom: "1in",
    marginLeft: "1in",
    marginRight: "1in",
    gotenbergUrl: "http://localhost:3001",
  };

  const program = convertMsgToPdf(msgFilePath, outputPath, config);

  try {
    const result = await Effect.runPromise(program);
    console.log(`✅ PDF created successfully at: ${result}`);
    return result;
  } catch (error) {
    console.error("❌ Single file conversion failed:", error);
    throw error;
  }
};

/**
 * Example: Convert multiple MSG files to PDFs in batch
 */
export const exampleBatchConversion = async () => {
  console.log("🔄 Converting multiple MSG files to PDFs...");

  const msgFiles = [
    "./downloads/email1.msg",
    "./downloads/email2.msg",
    "./downloads/email3.msg",
  ];

  const config: MsgToPdfConfig = {
    pdfFormat: "Letter",
    landscape: false,
    outputDir: "./logs/msg-to-pdf/batch",
  };

  const program = convertManyMsgToPdf(
    msgFiles,
    "./logs/msg-to-pdf/batch",
    config,
  );

  try {
    const results = await Effect.runPromise(program);
    console.log("✅ Batch conversion completed. PDFs created:", results);
    return results;
  } catch (error) {
    console.error("❌ Batch conversion failed:", error);
    throw error;
  }
};

/**
 * Example: Convert MSG buffer to PDF buffer (in-memory conversion)
 */
export const exampleBufferConversion = async () => {
  console.log("🔄 Converting MSG buffer to PDF buffer...");

  const msgFilePath = "./downloads/example.msg";

  // Read MSG file into buffer
  const msgBuffer = await fs.promises.readFile(msgFilePath);

  const config: MsgToPdfConfig = {
    pdfFormat: "A4",
    landscape: false,
    scale: 1.0,
  };

  const program = convertMsgBufferToPdf(msgBuffer, "example.msg", config);

  try {
    const pdfBuffer = await Effect.runPromise(program);

    // Save the PDF buffer to file
    const outputPath = "./logs/msg-to-pdf/buffer/example-from-buffer.pdf";
    await fs.promises.writeFile(outputPath, pdfBuffer);

    console.log(
      `✅ PDF buffer created and saved (${pdfBuffer.length} bytes) to: ${outputPath}`,
    );
    return outputPath;
  } catch (error) {
    console.error("❌ Buffer conversion failed:", error);
    throw error;
  }
};

/**
 * Example: Convert with custom PDF formatting options
 */
export const exampleCustomFormatting = async () => {
  console.log("🔄 Converting MSG with custom PDF formatting...");

  const msgFilePath = "./downloads/example.msg";
  const outputPath = "./downloads/custom-formatted.pdf";

  const config: MsgToPdfConfig = {
    pdfFormat: "Legal",
    landscape: true,
    scale: 0.8,
    marginTop: "0.5in",
    marginBottom: "0.5in",
    marginLeft: "0.75in",
    marginRight: "0.75in",
  };

  const program = convertMsgToPdf(msgFilePath, outputPath, config);

  try {
    const result = await Effect.runPromise(program);
    console.log(`✅ Custom formatted PDF created at: ${result}`);
    return result;
  } catch (error) {
    console.error("❌ Custom formatting conversion failed:", error);
    throw error;
  }
};

/**
 * Helper function to check if Gotenberg service is running
 */
export const checkGotenbergHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch("http://localhost:3000/health");
    if (response.ok) {
      console.log("✅ Gotenberg service is running and healthy");
      return true;
    }
    console.log(
      `❌ Gotenberg health check failed with status: ${response.status}`,
    );
    return false;
  } catch (error) {
    console.error("❌ Cannot connect to Gotenberg service:", error);
    console.log("💡 Make sure Gotenberg is running:");
    console.log("   docker compose up gotenberg");
    return false;
  }
};

/**
 * Main example runner - demonstrates all conversion types
 */
export const runAllExamples = async () => {
  console.log("🚀 MSG to PDF Converter Examples");
  console.log("================================\n");

  // Check Gotenberg service first
  const isHealthy = await checkGotenbergHealth();
  if (!isHealthy) {
    console.log("❌ Skipping examples due to Gotenberg service issues");
    return;
  }

  try {
    console.log("\n📄 Example 1: Single file conversion");
    await exampleSingleConversion();

    console.log("\n📚 Example 2: Batch conversion");
    await exampleBatchConversion();

    console.log("\n🧠 Example 3: Buffer conversion");
    await exampleBufferConversion();

    console.log("\n🎨 Example 4: Custom formatting");
    await exampleCustomFormatting();

    console.log("\n🎉 All examples completed successfully!");
  } catch (error) {
    console.error("\n💥 Example execution failed:", error);
    process.exit(1);
  }
};

// Run examples if this file is executed directly
if (import.meta.main) {
  runAllExamples();
}
