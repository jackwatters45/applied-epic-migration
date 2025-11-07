import { Effect, Schema } from "effect";
import {
  BooleanFromYN,
  OptionalDateFromString,
  OptionalNumberFromString,
} from "../../lib/schema.js";

export class AttachmentMetadataValidatorError extends Schema.TaggedError<AttachmentMetadataValidatorError>()(
  "AttachmentMetadataValidatorError",
  {
    message: Schema.String,
    type: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

export class AttachmentMetaData extends Schema.Class<AttachmentMetaData>(
  "AttachmentMetaData",
)({
  // readonly Counter: number;
  counter: Schema.propertySignature(Schema.NumberFromString).pipe(
    Schema.fromKey("Counter"),
  ),
  fileId: Schema.propertySignature(Schema.String).pipe(
    Schema.fromKey("FileID"),
  ),
  fileExtension: Schema.propertySignature(Schema.String).pipe(
    Schema.fromKey("FileExtension"),
  ),
  newPath: Schema.propertySignature(Schema.String).pipe(
    Schema.fromKey("NewPath"),
  ),
  fileName: Schema.optional(Schema.String).pipe(Schema.fromKey("FileName")),
  originalPath: Schema.propertySignature(Schema.String).pipe(
    Schema.fromKey("OriginalPath"),
  ),
  description: Schema.optional(Schema.String).pipe(
    Schema.fromKey("DescriptionOf"),
  ),
  attachedDate: Schema.propertySignature(Schema.Date).pipe(
    Schema.fromKey("AttachedDate"),
  ),
  associationType: Schema.propertySignature(Schema.String).pipe(
    Schema.fromKey("AssociationType"),
  ),
  folder: Schema.optional(Schema.String).pipe(Schema.fromKey("Folder")),
  subfolder1: Schema.optional(Schema.String).pipe(Schema.fromKey("SubFolder1")),
  class: Schema.propertySignature(Schema.String).pipe(Schema.fromKey("Class")),
  systemGeneratedScreen: Schema.optional(Schema.String).pipe(
    Schema.fromKey("SystemGeneratedScreen"),
  ),
  entityId: Schema.propertySignature(Schema.NumberFromString).pipe(
    Schema.fromKey("EntityID"),
  ),
  entityType: Schema.propertySignature(Schema.String).pipe(
    Schema.fromKey("EntityType"),
  ),
  lookupCode: Schema.propertySignature(Schema.String).pipe(
    Schema.fromKey("LookupCode"),
  ),
  nameOf: Schema.propertySignature(Schema.String).pipe(
    Schema.fromKey("NameOf"),
  ),
  agency: Schema.propertySignature(Schema.String).pipe(
    Schema.fromKey("Agency"),
  ),
  branch: Schema.propertySignature(Schema.String).pipe(
    Schema.fromKey("Branch"),
  ),
  policyId: OptionalNumberFromString.pipe(Schema.fromKey("PolicyID")),
  policyType: Schema.optional(Schema.String).pipe(Schema.fromKey("PolicyType")),
  policyNumber: Schema.optional(Schema.String).pipe(
    Schema.fromKey("PolicyNumber"),
  ),
  effectiveDate: OptionalDateFromString.pipe(Schema.fromKey("EffectiveDate")),
  expirationDate: OptionalDateFromString.pipe(Schema.fromKey("ExpirationDate")),
  department: Schema.optional(Schema.String).pipe(Schema.fromKey("Department")),
  multiplePolicies: Schema.propertySignature(BooleanFromYN).pipe(
    Schema.fromKey("MultiplePolicies"),
  ),
  lineId: OptionalNumberFromString.pipe(Schema.fromKey("LineID")),
  lineType: Schema.optional(Schema.String).pipe(Schema.fromKey("LineType")),
  firstWritten: OptionalDateFromString.pipe(Schema.fromKey("FirstWritten")),
  ico: Schema.optional(Schema.String).pipe(Schema.fromKey("ICO")),
  ppeType: Schema.optional(Schema.String).pipe(Schema.fromKey("PPE_Type")),
  ppe: Schema.optional(Schema.String).pipe(Schema.fromKey("PPE")),
  profitCenter: Schema.optional(Schema.String).pipe(
    Schema.fromKey("ProfitCenter"),
  ),
  claimId: OptionalNumberFromString.pipe(Schema.fromKey("ClaimID")),
  claimNumber: OptionalNumberFromString.pipe(Schema.fromKey("ClaimNumber")),
  claimant: Schema.optional(Schema.String).pipe(Schema.fromKey("Claimant")),
  lossDate: OptionalDateFromString.pipe(Schema.fromKey("LossDate")),
  activityCode: Schema.optional(Schema.String).pipe(
    Schema.fromKey("ActivityCode"),
  ),
  activityDescription: Schema.optional(Schema.String).pipe(
    Schema.fromKey("ActivityDescription"),
  ),
  activityEnteredDate: OptionalDateFromString.pipe(
    Schema.fromKey("ActivityEnteredDate"),
  ),
  activityEnteredBy: Schema.optional(Schema.String).pipe(
    Schema.fromKey("ActivityEnteredBy"),
  ),
  activityFollowUpStartDate: OptionalDateFromString.pipe(
    Schema.fromKey("ActivityFollowUpStartDate"),
  ),
  activityStatus: Schema.optional(Schema.String).pipe(
    Schema.fromKey("ActivityStatus"),
  ),
  multipleActivities: Schema.propertySignature(BooleanFromYN).pipe(
    Schema.fromKey("MultipleActivities"),
  ),
}) {}

export class AttachmentMetadataValidatorService extends Effect.Service<AttachmentMetadataValidatorService>()(
  "AttachmentMetadataValidatorService",
  {
    effect: Effect.gen(function* () {
      return {
        validateAttachmentMetadata: (rows: unknown[]) =>
          Effect.gen(function* () {
            const validated: AttachmentMetaData[] = [];
            for (const row of rows) {
              const metadata =
                yield* Schema.decodeUnknown(AttachmentMetaData)(row);
              validated.push(metadata);
            }
            return validated;
          }),
      };
    }),
  },
) {}
