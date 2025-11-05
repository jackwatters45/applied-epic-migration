import { Effect, Schema } from "effect";
import type { FileMetadata } from "./folder-scanner.js";

// Error types
export class ClientProductClassifierError extends Schema.TaggedError<ClientProductClassifierError>()(
  "ClientProductClassifierError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

export enum ProductType {
  PKG = "PKG",
  WORK_COMP = "WORK_COMP",
  UNKNOWN = "UNKNOWN",
}

export interface ClassificationResult {
  readonly clientName: string;
  readonly productType: ProductType;
  readonly confidence: number;
  readonly matchedKeywords: readonly string[];
}

// Client/Product Classifier Service
export class ClientProductClassifierService extends Effect.Service<ClientProductClassifierService>()(
  "ClientProductClassifierService",
  {
    effect: Effect.gen(function* () {
      return {
        classifyFile: (_metadata: FileMetadata) =>
          Effect.gen(function* () {
            // TODO: Implement classification logic based on keywords
            return {
              clientName: "Unknown Client",
              productType: ProductType.UNKNOWN,
              confidence: 0,
              matchedKeywords: [],
            } as ClassificationResult;
          }),

        extractClientName: (_fileName: string) =>
          Effect.gen(function* () {
            // TODO: Implement client name extraction
            return "Unknown Client";
          }),

        classifyByKeywords: (_fileName: string, _content?: string) =>
          Effect.gen(function* () {
            // TODO: Implement keyword-based classification
            // PKG -> crime, Work Comp -> claims, mod
            return ProductType.UNKNOWN;
          }),

        getClassificationConfidence: (result: ClassificationResult) =>
          Effect.gen(function* () {
            // TODO: Implement confidence calculation
            return result.confidence;
          }),
      } as const;
    }),
    dependencies: [],
  },
) {}
