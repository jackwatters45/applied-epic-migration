import type { AttachmentData } from "../../lib/type.js";
import { validateFourDigitYear, validateTwoDigitYear } from "../../lib/util.js";

// Priority configuration interface
export interface PriorityConfig {
  id: number;
  name: string;
  description: string;
  extractor: (attachment: AttachmentData) => number | null;
  validator: (year: number) => number | null;
}

// Year extraction functions
const extractPathYearFolder = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.originalPath?.match(/\\(\d{4})\\/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractExplicitYear = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.description?.match(/\b(20\d{2})\b/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractStartYear = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.description?.match(/^(\d{2})\b/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractYearRange = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.description?.match(/(\d{2})-(\d{2})\b/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractFilenameYear = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.description?.match(/(\d{2})-\d{2}\s+CVLR/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractWCYear = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.description?.match(/\b(\d{2})\s+WC\b/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractDateRangeYear = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.description?.match(
    /\((\d{2})(\d{2})(\d{4})\s+to\s+\d{8}\)/,
  );
  return match ? Number.parseInt(match[3], 10) : null;
};

const extractPathYear = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.originalPath?.match(/\/(\d{2})\s+/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractTimestampYear = (attachment: AttachmentData): number | null => {
  const match =
    attachment.formatted.originalPath?.match(/(\d{4})-\d{2}-\d{2}T/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractUnderscoreYear = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.originalPath?.match(/_(\d{4})_/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractDashYear = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.originalPath?.match(/\.(\d{4})\./);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractDescDashYear = (attachment: AttachmentData): number | null => {
  const match = attachment.formatted.description?.match(/-\s+(\d{2})\s+/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractExpirationYear = (attachment: AttachmentData): number | null => {
  const expirationDate = attachment.raw.expirationDate;
  if (expirationDate) {
    const expYear = new Date(expirationDate).getFullYear();
    return expYear - 1; // Policy year is typically year before expiration
  }
  return null;
};

const extractActivityDescYear = (attachment: AttachmentData): number | null => {
  const activityDesc = attachment.raw.activityDescription;
  if (activityDesc) {
    const match = activityDesc.match(/DOL:\s*\d{1,2}\/\d{1,2}\/(\d{2})\b/);
    return match ? Number.parseInt(match[1], 10) : null;
  }
  return null;
};

const extractActivityEnteredYear = (
  attachment: AttachmentData,
): number | null => {
  const activityEnteredDate = attachment.raw.activityEnteredDate;
  return activityEnteredDate
    ? new Date(activityEnteredDate).getFullYear()
    : null;
};

const extractAttachedDateAfterCutoff = (
  attachment: AttachmentData,
): number | null => {
  const attachedDate = attachment.raw.attachedDate;
  if (attachedDate) {
    const attachedDateObj = new Date(attachedDate);
    const cutoffDate = new Date("2022-10-30T00:00:00.000Z");

    if (attachedDateObj > cutoffDate) {
      return attachedDateObj.getFullYear();
    }
  }
  return null;
};

const extractLookupCodeStartYear = (
  attachment: AttachmentData,
): number | null => {
  const lookupCode = attachment.raw.lookupCode;
  const lookupCodeStartYears: Record<string, number> = {
    "TRULTRE-01": 2022,
    "ANGEAMO-01": 2022,
    "FIRSCHO-01": 2022,
    "WALTINC-01": 2022,
    "HCAPHOE-01": 2022,
    "FAMIMAT-01": 2022,
    "COASCOM-01": 2022,
    "LOVIHOM-01": 2022,
  };

  return lookupCode ? lookupCodeStartYears[lookupCode] || null : null;
};

const extractSpecificLookupCodeYear = (
  attachment: AttachmentData,
): number | null => {
  const lookupCode = attachment.raw.lookupCode;
  const attachmentDateLookupCodes = ["BORDCIT-02", "TESTTRA-01"];

  if (lookupCode && attachmentDateLookupCodes.includes(lookupCode)) {
    const attachedDate = attachment.raw.attachedDate;
    return attachedDate ? new Date(attachedDate).getFullYear() : null;
  }
  return null;
};

// Priority configurations as data
export const PRIORITY_CONFIGS: PriorityConfig[] = [
  {
    id: 1,
    name: "pathYearFolder",
    description: "Year folder in original path",
    extractor: extractPathYearFolder,
    validator: validateFourDigitYear,
  },
  {
    id: 2,
    name: "explicitYear",
    description: "Explicit 4-digit year in description",
    extractor: extractExplicitYear,
    validator: validateFourDigitYear,
  },
  {
    id: 3,
    name: "startYear",
    description: "Two-digit year at start of description",
    extractor: extractStartYear,
    validator: validateTwoDigitYear,
  },
  {
    id: 4,
    name: "yearRange",
    description: "Year range patterns (e.g., '18-23')",
    extractor: extractYearRange,
    validator: validateTwoDigitYear,
  },
  {
    id: 5,
    name: "filenameYear",
    description: "Year in filename patterns (e.g., '18-23 CVLR')",
    extractor: extractFilenameYear,
    validator: validateTwoDigitYear,
  },
  {
    id: 6,
    name: "wcYear",
    description: "Single digit year patterns like '24 WC'",
    extractor: extractWCYear,
    validator: validateTwoDigitYear,
  },
  {
    id: 7,
    name: "dateRangeYear",
    description: "Date ranges in parentheses like '(10272023 to 10272024)'",
    extractor: extractDateRangeYear,
    validator: validateFourDigitYear,
  },
  {
    id: 8,
    name: "pathYear",
    description: "Year in original path patterns",
    extractor: extractPathYear,
    validator: validateTwoDigitYear,
  },
  {
    id: 9,
    name: "timestampYear",
    description: "Year in blob timestamps",
    extractor: extractTimestampYear,
    validator: validateFourDigitYear,
  },
  {
    id: 10,
    name: "underscoreYear",
    description: "Year in filename with underscores",
    extractor: extractUnderscoreYear,
    validator: validateFourDigitYear,
  },
  {
    id: 11,
    name: "dashYear",
    description: "Year in filename with dashes",
    extractor: extractDashYear,
    validator: validateFourDigitYear,
  },
  {
    id: 12,
    name: "descDashYear",
    description: "Year after dash in description",
    extractor: extractDescDashYear,
    validator: validateTwoDigitYear,
  },
  {
    id: 13,
    name: "expirationYear",
    description: "Expiration date fallback",
    extractor: extractExpirationYear,
    validator: validateFourDigitYear,
  },
  {
    id: 14,
    name: "activityDescYear",
    description: "Activity description date patterns",
    extractor: extractActivityDescYear,
    validator: validateTwoDigitYear,
  },
  {
    id: 15,
    name: "activityEnteredYear",
    description: "Activity entered date",
    extractor: extractActivityEnteredYear,
    validator: validateFourDigitYear,
  },
  {
    id: 16,
    name: "attachedDateAfterCutoff",
    description: "Attached date fallback after 10/30/2022",
    extractor: extractAttachedDateAfterCutoff,
    validator: validateFourDigitYear,
  },
  {
    id: 17,
    name: "lookupCodeStartYear",
    description: "Lookup code start date fallback",
    extractor: extractLookupCodeStartYear,
    validator: validateFourDigitYear,
  },
  {
    id: 18,
    name: "specificLookupCodeYear",
    description: "Specific lookup codes attachment date fallback",
    extractor: extractSpecificLookupCodeYear,
    validator: validateFourDigitYear,
  },
];

// Helper functions for priority management
export const getPriorityById = (id: number): PriorityConfig | undefined => {
  return PRIORITY_CONFIGS.find((config) => config.id === id);
};

export const getPrioritiesByRange = (
  startId: number,
  endId: number,
): PriorityConfig[] => {
  return PRIORITY_CONFIGS.filter(
    (config) => config.id >= startId && config.id <= endId,
  );
};
