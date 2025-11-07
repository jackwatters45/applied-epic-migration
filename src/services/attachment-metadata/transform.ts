import { Effect, HashMap, List, Schema } from "effect";
import type { AttachmentMetaData } from "./validate.js";

export interface FormattedAttachment {
  readonly fileId: string;
  readonly nameOf: string;
  readonly lookupCode: string;
  readonly newPath: string;
  readonly originalPath: string;
  readonly attachedDate: Date;
  readonly folder: string | undefined;
  readonly description: string;
  readonly fileExtension: string;
  readonly policyType: string | undefined;
}

export interface Attachment {
  readonly formatted: FormattedAttachment;
  readonly raw: AttachmentMetaData;
}

export type TransformResult = HashMap.HashMap<string, List.List<Attachment>>;

export class AttachmentMetadataTransformerError extends Schema.TaggedError<AttachmentMetadataTransformerError>()(
  "AttachmentMetadataTransformerError",
  {
    message: Schema.String,
    type: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

export class AttachmentMetadataTransformerService extends Effect.Service<AttachmentMetadataTransformerService>()(
  "AttachmentMetadataTransformerService",
  {
    effect: Effect.gen(function* () {
      return {
        transformAttachmentMetadata: (rows: AttachmentMetaData[]) =>
          Effect.sync(() => {
            let result: TransformResult = HashMap.empty<
              string,
              List.List<Attachment>
            >();

            for (const attachment of rows) {
              const lookupCode = attachment.lookupCode;
              if (!lookupCode) {
                continue;
              }

              const formatted: FormattedAttachment = {
                fileId: attachment.fileId,
                nameOf: attachment.nameOf,
                lookupCode: attachment.lookupCode,
                newPath: attachment.newPath,
                originalPath: attachment.originalPath,
                attachedDate: attachment.attachedDate,
                folder: attachment.folder,
                description: attachment.description || "",
                fileExtension: attachment.fileExtension,
                policyType: attachment.policyType,
              };

              const attachmentRecord: Attachment = {
                formatted,
                raw: attachment,
              };

              const existing = HashMap.get(result, lookupCode);
              if (existing._tag === "Some") {
                result = HashMap.set(
                  result,
                  lookupCode,
                  List.append(existing.value, attachmentRecord),
                );
              } else {
                result = HashMap.set(
                  result,
                  lookupCode,
                  List.of(attachmentRecord),
                );
              }
            }

            return result;
          }),
      };
    }),
  },
) {}
