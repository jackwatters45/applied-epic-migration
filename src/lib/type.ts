import type { HashMap, List } from "effect";
import type { AttachmentMetaData } from "src/services/attachment-metadata/validate.js";

///////////////////////////////////////////////////////////////////////////////////////////
// Generic
///////////////////////////////////////////////////////////////////////////////////////////
export enum CacheMode {
  READ_WRITE = "read-write",
  READ = "read",
  WRITE = "write",
  NONE = "none",
}

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
  /** Agency name (from nameOf field) - used as key in OrganizedByAgency */
  agencyName: string;
  /** Lookup code (e.g., "MORGARE-01") */
  lookupCode: string;
  /** Determined year for the attachment */
  determinedYear: number;
} & AttachmentData;

/**
 * HashMap keyed by agency name (nameOf), containing all attachments for that agency.
 * Example key: "Morgantown Area Private Duty, LLC"
 */
export type OrganizedByAgency = HashMap.HashMap<string, List.List<Attachment>>;

/** @deprecated Use OrganizedByAgency instead */
export type OrganizedHashMap = OrganizedByAgency;
