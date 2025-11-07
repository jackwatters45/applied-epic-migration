import { Effect, HashMap, List, Schema } from "effect";
import { validateFourDigitYear, validateTwoDigitYear } from "src/lib/util.js";
import type { Attachment, TransformResult } from "./transform.js";
import { YearMetricsService } from "./year-metrics.js";

// Error types
export class YearResolutionError extends Schema.TaggedError<YearResolutionError>()(
  "YearResolutionError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// Year Resolution Service
export class YearResolutionService extends Effect.Service<YearResolutionService>()(
  "YearResolutionService",
  {
    effect: Effect.gen(function* () {
      const metrics = yield* YearMetricsService;

      return {
        resolveYear: (metadata: TransformResult) =>
          Effect.gen(function* () {
            // Convert HashMap to array of entries for iteration
            const entries = HashMap.entries(metadata);

            // Process each hash (lookupCode) and its attachments
            const processedEntries = yield* Effect.forEach(
              entries,
              ([lookupCode, attachments]) =>
                Effect.gen(function* () {
                  // Loop through each item in the hash's list
                  const processedAttachments = yield* Effect.forEach(
                    attachments,
                    (attachment) =>
                      Effect.gen(function* () {
                        // Placeholder function to determine correct year
                        const determinedYear =
                          yield* determineYearForAttachment(
                            attachment,
                            metrics,
                          );

                        if (determinedYear === undefined) {
                          // Skip attachments without determined year
                          return null;
                        }

                        return {
                          ...attachment,
                          key: lookupCode,
                          determinedYear,
                        };
                      }),
                  );

                  // Filter out null results (failed year determination)
                  const validAttachments = processedAttachments.filter(
                    (
                      attachment,
                    ): attachment is NonNullable<typeof attachment> =>
                      attachment !== null,
                  );

                  return [
                    lookupCode,
                    List.fromIterable(validAttachments),
                  ] as const;
                }),
            );

            // Convert back to HashMap
            return HashMap.fromIterable(processedEntries);
          }),

        getMetrics: () => metrics.getDetailedReport(),

        resetMetrics: () => metrics.reset(),
      } as const;
    }),
    dependencies: [YearMetricsService.Default],
  },
) {}

// Lookup code start year mapping for fallback logic
const getLookupCodeStartYear = (lookupCode: string): number | null => {
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

  return lookupCodeStartYears[lookupCode] || null;
};

// Lookup codes that should use attachment date as fallback
const shouldUseAttachmentDate = (lookupCode: string): boolean => {
  const attachmentDateLookupCodes = ["BORDCIT-02", "TESTTRA-01"];

  return attachmentDateLookupCodes.includes(lookupCode);
};

const determineYearForAttachment = (
  attachment: Attachment,
  metrics: YearMetricsService,
) =>
  Effect.gen(function* () {
    const { description, originalPath } = attachment.formatted;

    yield* metrics.incrementTotal();

    // Priority 1: Year folder in original path (most reliable)
    const pathYearMatch = originalPath?.match(/\\(\d{4})\\/);
    if (pathYearMatch) {
      const year = Number.parseInt(pathYearMatch[1], 10);
      const validatedYear = validateFourDigitYear(year);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(1);
        return validatedYear;
      }
    }

    // Priority 2: Explicit 4-digit year in description
    const descYearMatch = description?.match(/\b(20\d{2})\b/);
    if (descYearMatch) {
      const year = Number.parseInt(descYearMatch[1], 10);
      const validatedYear = validateFourDigitYear(year);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(2);
        return validatedYear;
      }
    }

    // Priority 3: Two-digit year at start of description
    const startYearMatch = description?.match(/^(\d{2})\b/);
    if (startYearMatch) {
      const twoDigitYear = Number.parseInt(startYearMatch[1], 10);
      const validatedYear = validateTwoDigitYear(twoDigitYear);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(3);
        return validatedYear;
      }
    }

    // Priority 4: Year range patterns (e.g., "18-23", "22-23")
    const yearRangeMatch = description?.match(/(\d{2})-(\d{2})\b/);
    if (yearRangeMatch) {
      // Take the first year in the range as the document year
      const firstYear = Number.parseInt(yearRangeMatch[1], 10);
      const validatedYear = validateTwoDigitYear(firstYear);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(4);
        return validatedYear;
      }
    }

    // Priority 5: Year in filename patterns (e.g., "18-23 CVLR")
    const filenameYearMatch = description?.match(/(\d{2})-\d{2}\s+CVLR/);
    if (filenameYearMatch) {
      const year = Number.parseInt(filenameYearMatch[1], 10);
      const validatedYear = validateTwoDigitYear(year);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(5);
        return validatedYear;
      }
    }

    // Priority 6: Single digit year patterns like "24 WC"
    const wcYearMatch = description?.match(/\b(\d{2})\s+WC\b/);
    if (wcYearMatch) {
      const year = Number.parseInt(wcYearMatch[1], 10);
      const validatedYear = validateTwoDigitYear(year);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(6);
        return validatedYear;
      }
    }

    // Priority 7: Date ranges in parentheses like "(10272023 to 10272024)"
    const dateRangeMatch = description?.match(
      /\((\d{2})(\d{2})(\d{4})\s+to\s+\d{8}\)/,
    );
    if (dateRangeMatch) {
      const year = Number.parseInt(dateRangeMatch[3], 10);
      const validatedYear = validateFourDigitYear(year);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(7);
        return validatedYear;
      }
    }

    // Priority 8: Year in original path (not just folder)
    const pathYearMatch2 = originalPath?.match(/\/(\d{2})\s+/);
    if (pathYearMatch2) {
      const year = Number.parseInt(pathYearMatch2[1], 10);
      const validatedYear = validateTwoDigitYear(year);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(8);
        return validatedYear;
      }
    }

    // Priority 9: Year in blob timestamps
    const timestampYearMatch = originalPath?.match(/(\d{4})-\d{2}-\d{2}T/);
    if (timestampYearMatch) {
      const year = Number.parseInt(timestampYearMatch[1], 10);
      const validatedYear = validateFourDigitYear(year);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(9);
        return validatedYear;
      }
    }

    // Priority 10: Year in filename with underscores
    const underscoreYearMatch = originalPath?.match(/_(\d{4})_/);
    if (underscoreYearMatch) {
      const year = Number.parseInt(underscoreYearMatch[1], 10);
      const validatedYear = validateFourDigitYear(year);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(10);
        return validatedYear;
      }
    }

    // Priority 11: Year in filename with dashes
    const dashYearMatch = originalPath?.match(/\.(\d{4})\./);
    if (dashYearMatch) {
      const year = Number.parseInt(dashYearMatch[1], 10);
      const validatedYear = validateFourDigitYear(year);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(11);
        return validatedYear;
      }
    }

    // Priority 12: Year after dash in description
    const descDashYearMatch = description?.match(/-\s+(\d{2})\s+/);
    if (descDashYearMatch) {
      const year = Number.parseInt(descDashYearMatch[1], 10);
      const validatedYear = validateTwoDigitYear(year);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(12);
        return validatedYear;
      }
    }

    // Priority 13: Use expiration date (fallback - subtract 1 year to get policy year)
    const expirationDate = attachment.raw.expirationDate;
    if (expirationDate) {
      const expYear = new Date(expirationDate).getFullYear();
      const policyYear = expYear - 1; // Policy year is typically year before expiration
      const validatedYear = validateFourDigitYear(policyYear);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(13);
        return validatedYear;
      }
    }

    // Priority 14: Year from activity description date patterns (e.g., "DOL: 9/27/23")
    const activityDesc = attachment.raw.activityDescription;
    if (activityDesc) {
      const activityDateMatch = activityDesc.match(
        /DOL:\s*\d{1,2}\/\d{1,2}\/(\d{2})\b/,
      );
      if (activityDateMatch) {
        const twoDigitYear = Number.parseInt(activityDateMatch[1], 10);
        const validatedYear = validateTwoDigitYear(twoDigitYear);
        if (validatedYear) {
          yield* metrics.recordPrioritySuccess(14);
          return validatedYear;
        }
      }
    }

    // Priority 15: Year from activity entered date
    const activityEnteredDate = attachment.raw.activityEnteredDate;
    if (activityEnteredDate) {
      const activityYear = new Date(activityEnteredDate).getFullYear();
      const validatedYear = validateFourDigitYear(activityYear);
      if (validatedYear) {
        yield* metrics.recordPrioritySuccess(15);
        return validatedYear;
      }
    }

    // Priority 16: Fallback to attached date if after 10/30/2022
    const attachedDate = attachment.raw.attachedDate;
    if (attachedDate) {
      const attachedDateObj = new Date(attachedDate);
      const cutoffDate = new Date("2022-10-30T00:00:00.000Z");

      if (attachedDateObj > cutoffDate) {
        const attachedYear = attachedDateObj.getFullYear();
        const validatedYear = validateFourDigitYear(attachedYear);
        if (validatedYear) {
          yield* metrics.recordPrioritySuccess(16);
          return validatedYear;
        }
      }
    }

    // Priority 17: Lookup code start date fallback
    const lookupCode = attachment.raw.lookupCode;
    if (lookupCode) {
      const lookupCodeStartYear = getLookupCodeStartYear(lookupCode);
      if (lookupCodeStartYear) {
        const validatedYear = validateFourDigitYear(lookupCodeStartYear);
        if (validatedYear) {
          yield* metrics.recordPrioritySuccess(17);
          return validatedYear;
        }
      }
    }

    // Priority 18: Specific lookup codes use attachment date fallback
    if (lookupCode && shouldUseAttachmentDate(lookupCode)) {
      const attachedDate = attachment.raw.attachedDate;
      if (attachedDate) {
        const attachedYear = new Date(attachedDate).getFullYear();
        const validatedYear = validateFourDigitYear(attachedYear);
        if (validatedYear) {
          yield* metrics.recordPrioritySuccess(18);
          return validatedYear;
        }
      }
    }

    // No valid year found - record as failure
    yield* metrics.recordFailure();
    yield* metrics.addFailureSample(attachment);
    return undefined;
  });

// after 10/30/2022 - fallback to attachedDate
