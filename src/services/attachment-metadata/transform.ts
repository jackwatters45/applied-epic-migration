import { Effect, HashMap, List, Schema } from "effect";
import type { AttachmentData, FormattedAttachment } from "../../lib/type.js";
import type { AttachmentMetaData } from "./validate.js";

export type TransformResult = HashMap.HashMap<
  string,
  List.List<AttachmentData>
>;

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
              List.List<AttachmentData>
            >();

            for (const attachment of rows) {
              const folderName = attachment.nameOf.trim();
              if (!folderName) {
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

              const attachmentRecord: AttachmentData = {
                formatted,
                raw: attachment,
              };

              const existing = HashMap.get(result, folderName);
              if (existing._tag === "Some") {
                result = HashMap.set(
                  result,
                  folderName,
                  List.append(existing.value, attachmentRecord),
                );
              } else {
                result = HashMap.set(
                  result,
                  folderName,
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
