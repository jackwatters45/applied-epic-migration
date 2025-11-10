import type { HashMap, List } from "effect";
import type { AttachmentMetaData } from "src/services/attachment-metadata/validate.js";

///////////////////////////////////////////////////////////////////////////////////////////
// File upload types
///////////////////////////////////////////////////////////////////////////////////////////

export interface FileUploadResult {
  success: boolean;
  message: string;
  attachmentId?: string;
}

///////////////////////////////////////////////////////////////////////////////////////////
// Attachments
///////////////////////////////////////////////////////////////////////////////////////////
export type FormattedAttachment = {
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
};

export type AttachmentData = {
  readonly formatted: FormattedAttachment;
  readonly raw: AttachmentMetaData;
};

export type Attachment = {
  key: string;
  name: string;
  determinedYear: number;
} & AttachmentData;

// Hashmap with all data from attachment metadata
export type OrganizedHashMap = HashMap.HashMap<string, List.List<Attachment>>;
