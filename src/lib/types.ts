// File upload types
export interface FileUploadResult {
  success: boolean;
  message: string;
  attachmentId?: string;
}

// CSV parsing types
export interface AttachmentMetadataCsvRow {
  Counter: string;
  FileID: string;
  FileExtension: string;
  NewPath: string;
  FileName: string;
  OriginalPath: string;
  DescriptionOf: string;
  AttachedDate: string;
  AssociationType: string;
  Folder?: string;
  SubFolder1?: string;
  Class?: string;
  SystemGeneratedScreen?: string;
  EntityID?: string;
  EntityType?: string;
  LookupCode?: string;
  NameOf?: string;
  Agency?: string;
  Branch?: string;
  PolicyID?: string;
  PolicyType?: string;
  PolicyNumber?: string;
  EffectiveDate?: string;
  ExpirationDate?: string;
  Department?: string;
  MultiplePolicies?: string;
  LineID?: string;
  LineType?: string;
  FirstWritten?: string;
  ICO?: string;
  PPE_Type?: string;
  PPE?: string;
  ProfitCenter?: string;
  ClaimID?: string;
  ClaimNumber?: string;
  Claimant?: string;
  LossDate?: string;
  ActivityCode?: string;
  ActivityDescription?: string;
  ActivityEnteredDate?: string;
  ActivityEnteredBy?: string;
  ActivityFollowUpStartDate?: string;
  ActivityStatus?: string;
  MultipleActivities?: string;
}

export interface ParsedAttachmentMetadata {
  fileId: string;
  fileExtension: string;
  newPath: string;
  fileName: string;
  originalPath: string;
  description: string;
  attachedDate: Date;
  associationType: string;
  folder: string | undefined;
  subFolder: string | undefined;
  class: string | undefined;
  systemGeneratedScreen: string | undefined;
  entityId: string | undefined;
  entityType: string | undefined;
  lookupCode: string | undefined;
  nameOf: string | undefined;
  agency: string | undefined;
  branch: string | undefined;
  policyId: string | undefined;
  policyType: string | undefined;
  policyNumber: string | undefined;
  effectiveDate: Date | undefined;
  expirationDate: Date | undefined;
  department: string | undefined;
  multiplePolicies: string | undefined;
  lineId: string | undefined;
  lineType: string | undefined;
  firstWritten: string | undefined;
  ico: string | undefined;
  ppeType: string | undefined;
  ppe: string | undefined;
  profitCenter: string | undefined;
  claimId: string | undefined;
  claimNumber: string | undefined;
  claimant: string | undefined;
  lossDate: Date | undefined;
  activityCode: string | undefined;
  activityDescription: string | undefined;
  activityEnteredDate: Date | undefined;
  activityEnteredBy: string | undefined;
  activityFollowUpStartDate: Date | undefined;
  activityStatus: string | undefined;
  multipleActivities: string | undefined;
}
