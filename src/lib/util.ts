import { Array as A } from "effect";

///////////////////////////////////////////////////////////////////////////////////////////////////////
// Schema Helpers
///////////////////////////////////////////////////////////////////////////////////////////////////////

export const cleanValue = (value: string): string => {
  return value
    .trim()
    .replace(/^\s+|\s+$/g, "") // Trim whitespace
    .replace(/\s+/g, " "); // Normalize multiple spaces to single space
};

export const getNonNullValuesFromArr = (
  values: readonly string[],
): readonly string[] => {
  return A.filter(
    A.map(values, cleanValue),
    (v) => v.length > 0 && v !== "null" && v !== "undefined" && v !== "N/A",
  );
};

export const analyzeNumericValues = (
  values: readonly string[],
): { isAll: boolean; hasSome: boolean; count: number } => {
  const nonNullValues = getNonNullValuesFromArr(values);
  const numValues = A.filter(
    nonNullValues,
    (v) => !Number.isNaN(Number(v)) && v.trim() !== "",
  );
  return {
    isAll:
      nonNullValues.length > 0 && numValues.length === nonNullValues.length,
    hasSome: numValues.length > 0,
    count: numValues.length,
  };
};

const DATE_PATTERNS = [
  /^\d{1,2}\/\d{1,2}\/\d{2,4}/, // MM/DD/YYYY
  /^\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
  /^\d{4}-\d{2}-\d{2}T/, // ISO dates
] as const;

export const analyzeDateValues = (
  values: readonly string[],
): { isAll: boolean; hasSome: boolean; count: number } => {
  const nonNullValues = getNonNullValuesFromArr(values);
  const dateValues = A.filter(nonNullValues, (v) =>
    A.some(DATE_PATTERNS, (pattern) => pattern.test(v)),
  );
  return {
    isAll:
      nonNullValues.length > 0 && dateValues.length === nonNullValues.length,
    hasSome: dateValues.length > 0,
    count: dateValues.length,
  };
};

const BOOLEAN_VALUES = [
  "true",
  "false",
  "yes",
  "no",
  "1",
  "0",
  "Y",
  "N",
] as const;

export const analyzeBooleanValues = (
  values: readonly string[],
): { isAll: boolean; hasSome: boolean; count: number } => {
  const nonNullValues = getNonNullValuesFromArr(values);
  const booleanValues = A.filter(nonNullValues, (v) =>
    BOOLEAN_VALUES.includes(v.toUpperCase() as (typeof BOOLEAN_VALUES)[number]),
  );
  return {
    isAll:
      nonNullValues.length > 0 && booleanValues.length === nonNullValues.length,
    hasSome: booleanValues.length > 0,
    count: booleanValues.length,
  };
};

///////////////////////////////////////////////////////////////////////////////////////////////////////
// Year Validation
///////////////////////////////////////////////////////////////////////////////////////////////////////
//
// Helper function to validate reasonable years
export const validateReasonableYear = (year: number): boolean => {
  const currentYear = new Date().getFullYear();
  const minYear = 2015; // Reasonable minimum for insurance documents
  const maxYear = currentYear + 1; // Allow next year for renewals

  return year >= minYear && year <= maxYear;
};

// Helper function to validate and convert 2-digit year
export const validateTwoDigitYear = (twoDigitYear: number): number | null => {
  const currentYear = new Date().getFullYear();
  const currentTwoDigit = currentYear % 100;
  const maxTwoDigit = currentTwoDigit + 1;

  // Validate reasonable year range (15 through current year + 1)
  if (twoDigitYear >= 15 && twoDigitYear <= maxTwoDigit) {
    return twoDigitYear >= 50 ? 1900 + twoDigitYear : 2000 + twoDigitYear;
  }

  return null;
};

// Helper function to validate and convert 4-digit year
export const validateFourDigitYear = (fourDigitYear: number): number | null => {
  return validateReasonableYear(fourDigitYear) ? fourDigitYear : null;
};

// Helper function to validate year from Date object
export const validateYearFromDate = (date: Date): number | null => {
  const year = date.getFullYear();
  return validateFourDigitYear(year);
};
