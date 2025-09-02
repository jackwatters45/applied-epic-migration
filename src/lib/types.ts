// Applied Epic Attachments API Types

export interface AuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface AuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface ApiConfig {
  baseUrl: string;
  authUrl: string;
  credentials: AuthCredentials;
}

// Attachment related types
export interface AttachmentFile {
  id: string;
  status: string;
  url?: string;
  name?: string;
  extension?: string;
  size?: number;
}

export interface AttachedTo {
  id: string;
  type:
    | "ACCOUNT"
    | "POLICY"
    | "CLAIM"
    | "QUOTE"
    | "SERVICE"
    | "CERTIFICATE"
    | "EVIDENCE"
    | "GOVERNMENT_RECONCILIATION"
    | "CANCELLATION"
    | "RECONCILIATION"
    | "DISBURSEMENT"
    | "ACTIVITY"
    | "CARRIER_SUBMISSION"
    | "MARKETING_SUBMISSION"
    | "LINE"
    | "OPPORTUNITY";
  description: string;
  primary: boolean;
  _links: {
    self: {
      href: string;
    };
  };
}

export interface Attachment {
  id: string;
  description: string;
  active: boolean;
  summary?: string;
  folder?: string;
  accessLevel?: string;
  account?: string;
  organizations: string[];
  attachedOn: string;
  editedOn: string;
  receivedOn?: string;
  clientAccessedOn?: string;
  attachedTos: AttachedTo[];
  clientAccessible: boolean;
  systemGenerated: boolean;
  inactiveOn?: string;
  file: AttachmentFile;
  _links: {
    self: {
      href: string;
    };
    account?: {
      href: string;
    };
    folder?: {
      href: string;
    };
    accessLevel?: {
      href: string;
    };
    organizations?: {
      href: string;
    };
  };
}

export interface AttachmentsResponse {
  total: number;
  _links: {
    self: {
      href: string;
    };
    prev?: {
      href: string;
    };
    next?: {
      href: string;
    };
    first?: {
      href: string;
    };
    last?: {
      href: string;
    };
  };
  _embedded: {
    attachments: Attachment[];
  };
}

// Query parameters for listing attachments
export interface ListAttachmentsParams {
  attachedOn_before?: string;
  attachedOn_after?: string;
  clientAccessible?: boolean;
  description?: string;
  description_contains?: string;
  editedOn_before?: string;
  editedOn_after?: string;
  folder?: string;
  inactiveOn_before?: string;
  inactiveOn_after?: string;
  systemGenerated?: boolean;
  organization?: string;
  has_client_accessed?: boolean;
  include_subfolders?: boolean;
  accessible_by_employee_code?: string;
  accountType?: string;
  account?: string;
  activity?: string;
  policy?: string;
  carrierSubmission?: string;
  claim?: string;
  line?: string;
  marketingSubmission?: string;
  opportunity?: string;
  service?: string;
  certificate?: string;
  evidence?: string;
  governmentReconciliation?: string;
  cancellation?: string;
  reconciliation?: string;
  quote?: string;
  disbursement?: string;
  fileStatus?: string;
  limit?: number;
  offset?: number;
  active_status?: string;
}

// Create attachment request
export interface CreateAttachmentRequest {
  description: string;
  active: boolean;
  folder?: string;
  receivedOn?: string;
  clientAccessedOn?: string;
  clientAccessible: boolean;
  comments?: string;
  clientAccessExpirationOn?: string;
  doNotPurgeExpirationOn?: string;
  doNotPurge?: boolean;
  importantPolicyDocument?: boolean;
  attachTo: {
    id: string;
    type: AttachedTo["type"];
  };
  uploadFileName: string;
}

export interface CreateAttachmentResponse {
  id: string;
  uploadUrl: string;
  _links: {
    self: {
      href: string;
    };
  };
}

// File upload types
export interface FileUploadResult {
  success: boolean;
  message: string;
  attachmentId?: string;
}
