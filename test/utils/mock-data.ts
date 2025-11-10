import type {
  AttachmentData,
  FormattedAttachment,
} from "../../src/services/attachment-metadata/transform.js";
import { AttachmentMetaData } from "../../src/services/attachment-metadata/validate.js";

// Mock attachment factory for testing
export const createMockAttachment = (
  overrides: Partial<AttachmentData> = {},
): AttachmentData => {
  const defaultFormatted: FormattedAttachment = {
    fileId: "file123",
    nameOf: "Test Document",
    lookupCode: "TEST001",
    newPath: "\\\\2023\\Processed\\test.pdf",
    originalPath: "\\\\2023\\Documents\\test.pdf",
    attachedDate: new Date("2023-01-15"),
    folder: "Documents",
    description: "23 Test Document",
    fileExtension: "pdf",
    policyType: undefined,
  };

  // Create minimal valid AttachmentMetaData for testing
  const defaultRaw = new AttachmentMetaData({
    counter: 1,
    fileId: "file123",
    fileExtension: "pdf",
    newPath: "\\\\2023\\Processed\\test.pdf",
    originalPath: "\\\\2023\\Documents\\test.pdf",
    description: "23 Test Document",
    attachedDate: new Date("2023-01-15"),
    associationType: "Document",
    folder: "Documents",
    class: "General",
    entityId: 123,
    entityType: "Policy",
    lookupCode: "TEST001",
    nameOf: "Test Document",
    agency: "Test Agency",
    branch: "Test Branch",
    multiplePolicies: false,
    multipleActivities: false,
  });

  return {
    formatted: { ...defaultFormatted, ...overrides.formatted },
    raw: defaultRaw,
    ...overrides,
  };
};

// Test data samples for various year extraction scenarios
export const mockAttachments = {
  // Priority 1: Path year folder
  pathYearFolder: createMockAttachment({
    formatted: {
      ...createMockAttachment().formatted,
      originalPath: "\\\\2022\\Documents\\test.pdf",
      description: "Test Document",
      attachedDate: new Date("2022-05-10"),
    },
  }),

  // Priority 2: Explicit year in description
  explicitYear: createMockAttachment({
    formatted: {
      ...createMockAttachment().formatted,
      originalPath: "\\\\Documents\\test.pdf",
      description: "Document from 2021",
      attachedDate: new Date("2021-03-15"),
    },
  }),

  // Priority 3: Start year (2 digits)
  startYear: createMockAttachment({
    formatted: {
      ...createMockAttachment().formatted,
      originalPath: "\\\\Documents\\test.pdf",
      description: "20 Annual Report",
      attachedDate: new Date("2020-12-01"),
    },
  }),

  // Priority 4: Year range
  yearRange: createMockAttachment({
    formatted: {
      ...createMockAttachment().formatted,
      originalPath: "\\\\Documents\\test.pdf",
      description: "19-20 Fiscal Year",
      attachedDate: new Date("2019-07-01"),
    },
  }),

  // Priority 5: Filename year pattern
  filenameYear: createMockAttachment({
    formatted: {
      ...createMockAttachment().formatted,
      originalPath: "\\\\Documents\\test.pdf",
      description: "18-19 CVLR Report",
      attachedDate: new Date("2018-06-15"),
    },
  }),

  // Priority 6: WC year pattern
  wcYear: createMockAttachment({
    formatted: {
      ...createMockAttachment().formatted,
      originalPath: "\\\\Documents\\test.pdf",
      description: "17 WC Document",
      attachedDate: new Date("2017-04-20"),
    },
  }),

  // Priority 7: Date range year
  dateRangeYear: createMockAttachment({
    formatted: {
      ...createMockAttachment().formatted,
      originalPath: "\\\\Documents\\test.pdf",
      description: "(01012016 to 12312016) Report",
      attachedDate: new Date("2016-01-01"),
    },
  }),

  // Edge cases
  noYear: createMockAttachment({
    formatted: {
      ...createMockAttachment().formatted,
      originalPath: "\\\\Documents\\test.pdf",
      description: "No Year Document",
      attachedDate: new Date("2023-01-01"),
    },
  }),

  emptyFields: createMockAttachment({
    formatted: {
      fileId: "file123",
      nameOf: "Test Document",
      lookupCode: "TEST001",
      newPath: "",
      originalPath: "",
      attachedDate: new Date("2022-01-01"), // Before cutoff date
      folder: "Documents",
      description: "",
      fileExtension: "pdf",
      policyType: undefined,
    },
    raw: new AttachmentMetaData({
      counter: 1,
      fileId: "file123",
      fileExtension: "pdf",
      newPath: "",
      originalPath: "",
      description: "",
      attachedDate: new Date("2022-01-01"), // Before cutoff date
      associationType: "Document",
      folder: "Documents",
      class: "General",
      entityId: 123,
      entityType: "Policy",
      lookupCode: "TEST001",
      nameOf: "Test Document",
      agency: "Test Agency",
      branch: "Test Branch",
      multiplePolicies: false,
      multipleActivities: false,
    }),
  }),

  invalidYear: createMockAttachment({
    formatted: {
      ...createMockAttachment().formatted,
      originalPath: "\\\\1800\\Documents\\test.pdf",
      description: "Document from 1800",
      attachedDate: new Date("2023-01-01"),
    },
  }),
};

// Expected results for validation
export const expectedResults = {
  pathYearFolder: 2022,
  explicitYear: 2021,
  startYear: 2020,
  yearRange: 2019,
  filenameYear: 2018,
  wcYear: 2017,
  dateRangeYear: 2016,
  noYear: null, // Should fallback to attached date
  emptyFields: null,
  invalidYear: null, // Should fail validation
};
