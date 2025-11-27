import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List } from "effect";
import type { OrganizedByAgency } from "src/lib/type.js";
import type { HierarchyTree } from "../google-drive/folder-hierarchy.js";
import {
  type AgencyMapping,
  AgencyMappingStoreService,
  type MatchType,
} from "./agency-mapping-store.js";

// Match confidence levels
export type MatchConfidence = "exact" | "high" | "medium" | "low" | "none";

// Match details for transparency
export interface MatchDetails {
  readonly confidence: MatchConfidence;
  readonly score: number; // 0-100
  readonly matchType: string;
  readonly reasoning: string;
}

// Candidate match with scoring
export interface MatchCandidate {
  readonly folderId: string;
  readonly folderName: string;
  readonly details: MatchDetails;
}

type MergeAttachmentsToFolders = {
  attachments: OrganizedByAgency;
  gDriveTree: HierarchyTree;
};

type MappingResult = {
  readonly agencyName: string;
  readonly folderId: string;
  readonly folderName: string;
  readonly attachmentCount: number;
  readonly match: MatchDetails;
  readonly source: "existing" | "new";
  readonly candidates?: MatchCandidate[]; // Additional candidates for review
};

type UnmappedAgency = {
  readonly agencyName: string;
  readonly attachmentCount: number;
  readonly candidates: MatchCandidate[];
};

type MappingStats = {
  readonly total: number;
  readonly fromStore: number;
  readonly autoMatched: number;
  readonly needsReview: number;
  readonly unmapped: number;
};

type MappingOutput = {
  readonly mapping: MappingResult[];
  readonly needsReview: MappingResult[];
  readonly unmapped: UnmappedAgency[];
  readonly stats: MappingStats;
};

// String similarity using Levenshtein distance
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
};

// Calculate similarity score (0-100)
const calculateSimilarity = (a: string, b: string): number => {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 100;
  return Math.round((1 - distance / maxLength) * 100);
};

// Normalize string for comparison
const normalize = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // remove special chars
    .replace(/\s+/g, " "); // normalize whitespace

// Stop words to exclude from meaningful word matching
const STOP_WORDS = new Set([
  "llc",
  "dba",
  "inc",
  "corp",
  "corporation",
  "company",
  "home",
  "care",
  "health",
  "homecare",
  "healthcare",
  "services",
  "service",
  "agency",
  "the",
  "and",
  "of",
  "at",
  "right",
]);

// Extract meaningful words (excluding stop words)
const getMeaningfulWords = (normalized: string): Set<string> =>
  new Set(
    normalized.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );

// Calculate match score and details
const calculateMatch = (
  agencyName: string,
  folderName: string,
): MatchDetails => {
  const normAgency = normalize(agencyName);
  const normFolder = normalize(folderName);

  // Exact match (after normalization)
  if (normAgency === normFolder) {
    return {
      confidence: "exact",
      score: 100,
      matchType: "exact",
      reasoning: "Names match exactly (case-insensitive)",
    };
  }

  // Get meaningful words for comparison
  const agencyWords = getMeaningfulWords(normAgency);
  const folderWords = getMeaningfulWords(normFolder);
  const commonWords = [...agencyWords].filter((w) => folderWords.has(w));

  // Calculate word-based overlap
  const wordOverlap =
    agencyWords.size > 0 ? (commonWords.length / agencyWords.size) * 100 : 0;

  // Check for prefix/suffix matches on meaningful parts
  const agencyMeaningful = [...agencyWords].join(" ");
  const folderMeaningful = [...folderWords].join(" ");

  // Only check prefix/containment if both have meaningful content
  // and require the shorter string to be at least 5 chars to avoid false positives
  const shorterMeaningful =
    agencyMeaningful.length <= folderMeaningful.length
      ? agencyMeaningful
      : folderMeaningful;
  const longerMeaningful =
    agencyMeaningful.length > folderMeaningful.length
      ? agencyMeaningful
      : folderMeaningful;

  const isPrefixMatch =
    shorterMeaningful.length >= 5 &&
    longerMeaningful.startsWith(shorterMeaningful);

  const isContained =
    shorterMeaningful.length >= 5 &&
    longerMeaningful.includes(shorterMeaningful) &&
    !isPrefixMatch; // Don't double-count prefix matches

  // Calculate similarity on meaningful words only (not full string)
  const meaningfulSimilarity =
    agencyMeaningful.length > 0 && folderMeaningful.length > 0
      ? calculateSimilarity(agencyMeaningful, folderMeaningful)
      : 0;

  // Determine score based on meaningful word matching (primary) and similarity (secondary)
  let adjustedScore = 0;
  let matchType = "none";
  let reasoning = "No meaningful word matches";

  // Priority 1: All meaningful words match
  if (agencyWords.size > 0 && wordOverlap === 100) {
    adjustedScore = 95;
    matchType = "word-match";
    reasoning = `All meaningful words match: "${commonWords.join(", ")}"`;
  }
  // Priority 2: Most meaningful words match (>=75%)
  else if (agencyWords.size > 0 && wordOverlap >= 75) {
    adjustedScore = 85 + (wordOverlap - 75);
    matchType = "word-match";
    reasoning = `${commonWords.length}/${agencyWords.size} meaningful words match: "${commonWords.join(", ")}"`;
  }
  // Priority 3: Meaningful prefix/contains match
  else if (isPrefixMatch) {
    adjustedScore = Math.max(80, meaningfulSimilarity);
    matchType = "prefix";
    reasoning = `Meaningful prefix match: "${agencyMeaningful}" ~ "${folderMeaningful}"`;
  } else if (isContained) {
    adjustedScore = Math.max(75, meaningfulSimilarity);
    matchType = "contains";
    reasoning = `Meaningful containment: "${agencyMeaningful}" in "${folderMeaningful}"`;
  }
  // Priority 4: Some meaningful word overlap (>=50%)
  else if (agencyWords.size > 0 && wordOverlap >= 50) {
    adjustedScore = 60 + wordOverlap * 0.2;
    matchType = "word-overlap";
    reasoning = `${commonWords.length} common words: "${commonWords.join(", ")}" (${Math.round(wordOverlap)}% overlap)`;
  }
  // Priority 5: High similarity on meaningful parts only (not raw strings)
  else if (meaningfulSimilarity >= 80) {
    adjustedScore = meaningfulSimilarity * 0.7; // Penalize - similarity alone isn't reliable
    matchType = "similarity";
    reasoning = `Meaningful part similarity: ${meaningfulSimilarity}% (penalized - no word match)`;
  }
  // Priority 6: Some meaningful word overlap or moderate similarity
  else if (wordOverlap > 0 || meaningfulSimilarity >= 60) {
    adjustedScore = Math.max(wordOverlap * 0.5, meaningfulSimilarity * 0.5);
    matchType = "weak";
    reasoning =
      commonWords.length > 0
        ? `Weak match: "${commonWords.join(", ")}" (${Math.round(wordOverlap)}% overlap)`
        : `Weak similarity: ${meaningfulSimilarity}%`;
  }

  // Determine confidence level
  let confidence: MatchConfidence;
  if (adjustedScore >= 90) {
    confidence = "high";
  } else if (adjustedScore >= 70) {
    confidence = "medium";
  } else if (adjustedScore >= 50) {
    confidence = "low";
  } else {
    confidence = "none";
  }

  return {
    confidence,
    score: Math.round(adjustedScore),
    matchType,
    reasoning,
  };
};

// Find best match and candidates for an agency
const findMatches = (
  agencyName: string,
  folders: Array<{ id: string; name: string; originalName: string }>,
): { best: MatchCandidate | null; candidates: MatchCandidate[] } => {
  const allMatches: MatchCandidate[] = folders
    .map((folder) => ({
      folderId: folder.id,
      folderName: folder.originalName,
      details: calculateMatch(agencyName, folder.name),
    }))
    .filter((m) => m.details.score > 0) // Include any match with a score
    .sort((a, b) => b.details.score - a.details.score);

  // Only auto-accept if score >= 90%
  const best =
    allMatches.length > 0 && allMatches[0].details.score >= 90
      ? allMatches[0]
      : null;

  // Return top 10 candidates for review (more options for manual selection)
  const candidates = allMatches.slice(0, 10);

  return { best, candidates };
};

const getConfidenceEmoji = (confidence: MatchConfidence): string => {
  switch (confidence) {
    case "exact":
      return "✅";
    case "high":
      return "🟢";
    case "medium":
      return "🟡";
    case "low":
      return "🟠";
    case "none":
      return "🔴";
  }
};

// Generate human-readable report for non-technical review
const generateHumanReadableReport = (output: MappingOutput): string => {
  const lines: string[] = [];
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  lines.push("AGENCY MATCHING REVIEW REQUEST");
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`Generated: ${date}`);
  lines.push("");
  lines.push("SUMMARY");
  lines.push("-".repeat(70));
  lines.push(
    `We need help matching ${output.needsReview.length + output.unmapped.length} agencies from our attachment records`,
  );
  lines.push("to the correct folders in Google Drive.");
  lines.push("");
  lines.push(
    `  - ${output.needsReview.length} agencies have possible matches that need verification`,
  );
  lines.push(
    `  - ${output.unmapped.length} agencies could not be matched automatically`,
  );
  lines.push("");
  lines.push("HOW TO USE THIS DOCUMENT");
  lines.push("-".repeat(70));
  lines.push(
    "For each agency listed below, please review the suggested matches and either:",
  );
  lines.push("  1. Circle or highlight the CORRECT folder name if it's listed");
  lines.push(
    "  2. Write in the correct folder name if none of the suggestions are right",
  );
  lines.push('  3. Mark "NEW" if this agency needs a new folder created');
  lines.push('  4. Mark "SKIP" if this agency should be ignored');
  lines.push("");
  lines.push("=".repeat(70));
  lines.push("");

  // Section 1: Needs Review (has candidates with decent scores)
  if (output.needsReview.length > 0) {
    lines.push("SECTION 1: AGENCIES NEEDING VERIFICATION");
    lines.push(
      "(These have possible matches - please confirm or correct the best option)",
    );
    lines.push("-".repeat(70));
    lines.push("");

    for (let i = 0; i < output.needsReview.length; i++) {
      const item = output.needsReview[i];
      const candidates = item.candidates ?? [];

      lines.push(`${i + 1}. AGENCY: "${item.agencyName}"`);
      lines.push(`   Files to migrate: ${item.attachmentCount}`);
      lines.push("");
      lines.push("   Suggested folder matches:");
      if (candidates.length > 0) {
        // Show top 5 candidates for readability
        for (let j = 0; j < Math.min(candidates.length, 5); j++) {
          const c = candidates[j];
          const marker = j === 0 ? " <-- Best match" : "";
          lines.push(`      [ ] ${c.folderName}${marker}`);
        }
      } else {
        lines.push(`      [ ] ${item.folderName} <-- Best match`);
      }
      lines.push("      [ ] Other: _______________________________________");
      lines.push("      [ ] NEW (create new folder)");
      lines.push("      [ ] SKIP");
      lines.push("");
      lines.push("");
    }
  }

  // Section 2: Unmapped (no good matches found)
  if (output.unmapped.length > 0) {
    lines.push("=".repeat(70));
    lines.push("");
    lines.push("SECTION 2: AGENCIES WITHOUT MATCHES");
    lines.push(
      "(No good automatic matches found - please provide the correct folder name)",
    );
    lines.push("-".repeat(70));
    lines.push("");

    for (let i = 0; i < output.unmapped.length; i++) {
      const item = output.unmapped[i];

      lines.push(`${i + 1}. AGENCY: "${item.agencyName}"`);
      lines.push(`   Files to migrate: ${item.attachmentCount}`);
      lines.push("");

      if (item.candidates.length > 0) {
        lines.push("   Possible matches (low confidence):");
        // Show top 3 candidates for low-confidence matches
        for (let j = 0; j < Math.min(item.candidates.length, 3); j++) {
          const c = item.candidates[j];
          lines.push(`      [ ] ${c.folderName}`);
        }
      } else {
        lines.push("   No similar folders found in Google Drive.");
      }
      lines.push("      [ ] Other: _______________________________________");
      lines.push("      [ ] NEW (create new folder)");
      lines.push("      [ ] SKIP");
      lines.push("");
      lines.push("");
    }
  }

  lines.push("=".repeat(70));
  lines.push("END OF REPORT");
  lines.push("=".repeat(70));
  lines.push("");
  lines.push("Please return this document with your selections marked.");
  lines.push("Thank you for your help!");

  return lines.join("\n");
};

const logMappingResults = (
  output: MappingOutput,
  fs: FileSystem.FileSystem,
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    yield* fs.writeFileString(
      "logs/agency-mapping-report.json",
      JSON.stringify(output, null, 2),
    );

    // Write human-readable report for non-technical review
    const humanReadableReport = generateHumanReadableReport(output);
    yield* fs.writeFileString(
      "logs/unmatched-agencies-review.txt",
      humanReadableReport,
    );

    // Write separate file for unmatched agencies with expanded candidate list
    const unmatchedReport = [
      ...output.needsReview.map((m) => ({
        agencyName: m.agencyName,
        attachmentCount: m.attachmentCount,
        candidates: (m.candidates ?? []).map((c) => ({
          folderName: c.folderName,
          folderId: c.folderId,
          score: c.details.score,
          reasoning: c.details.reasoning,
        })),
        status: "needs_review" as const,
      })),
      ...output.unmapped.map((u) => ({
        agencyName: u.agencyName,
        attachmentCount: u.attachmentCount,
        candidates: u.candidates.map((c) => ({
          folderName: c.folderName,
          folderId: c.folderId,
          score: c.details.score,
          reasoning: c.details.reasoning,
        })),
        status: "unmapped" as const,
      })),
    ];

    yield* fs.writeFileString(
      "logs/unmatched-agencies.json",
      JSON.stringify(unmatchedReport, null, 2),
    );

    console.log(`\n${"=".repeat(60)}`);
    console.log("AGENCY MAPPING REPORT");
    console.log(`${"=".repeat(60)}\n`);

    // Stats summary
    console.log("STATISTICS:");
    console.log(`   Total agencies: ${output.stats.total}`);
    console.log(`   From store (confirmed): ${output.stats.fromStore}`);
    console.log(`   Auto-matched (>=90%): ${output.stats.autoMatched}`);
    console.log(`   Needs review (<90%): ${output.stats.needsReview}`);
    console.log(`   Unmapped: ${output.stats.unmapped}`);
    console.log("");

    // Auto-matched agencies
    const autoMatched = output.mapping.filter((m) => m.source === "new");
    if (autoMatched.length > 0) {
      console.log("AUTO-MATCHED (saved to store):");
      console.log("-".repeat(60));
      for (const m of autoMatched) {
        console.log(`   "${m.agencyName}" -> "${m.folderName}"`);
        console.log(`      Score: ${m.match.score}% | ${m.match.reasoning}`);
      }
      console.log("");
    }

    // Needs review
    if (output.needsReview.length > 0) {
      console.log("NEEDS REVIEW (run 'review' command):");
      console.log("-".repeat(60));
      for (const m of output.needsReview) {
        const emoji = getConfidenceEmoji(m.match.confidence);
        console.log(
          `   ${emoji} "${m.agencyName}" -> "${m.folderName}" (${m.match.score}%)`,
        );
        console.log(`      ${m.match.reasoning}`);
      }
      console.log("");
    }

    // Unmapped agencies with candidates
    if (output.unmapped.length > 0) {
      console.log("UNMAPPED (no match >=40%):");
      console.log("-".repeat(60));
      for (const unmapped of output.unmapped) {
        console.log(
          `\n   "${unmapped.agencyName}" (${unmapped.attachmentCount} files)`,
        );
        if (unmapped.candidates.length > 0) {
          console.log("   Possible matches:");
          for (const candidate of unmapped.candidates) {
            const emoji = getConfidenceEmoji(candidate.details.confidence);
            console.log(
              `      ${emoji} "${candidate.folderName}" - ${candidate.details.score}% (${candidate.details.matchType})`,
            );
          }
        } else {
          console.log("      No similar folders found");
        }
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("Output files:");
    console.log("   logs/agency-mapping-report.json - Full report");
    console.log("   logs/unmatched-agencies.json - Unmatched agencies (JSON)");
    console.log(
      "   logs/unmatched-agencies-review.txt - Human-readable review document",
    );
    console.log(`${"=".repeat(60)}\n`);
  });

// Convert MatchDetails to AgencyMapping
const toAgencyMapping = (
  match: MatchCandidate,
  matchType: MatchType,
): AgencyMapping => ({
  folderId: match.folderId,
  folderName: match.folderName,
  confidence: match.details.score,
  matchType,
  reasoning: match.details.reasoning,
  matchedAt: new Date().toISOString(),
});

export class AttachmentFolderMapperService extends Effect.Service<AttachmentFolderMapperService>()(
  "AttachmentFolderMapperService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const store = yield* AgencyMappingStoreService;

      return {
        mergeAttachmentsToFolders: ({
          attachments,
          gDriveTree,
        }: MergeAttachmentsToFolders) =>
          Effect.gen(function* () {
            // 1. Load existing mappings
            const existingMappings = yield* store.getAll();

            // 2. Get folder IDs that are already confirmed (>= 90% confidence)
            const confirmedFolderIds = new Set(
              Object.values(existingMappings)
                .filter((m) => m.confidence >= 90 && m.folderId)
                .map((m) => m.folderId),
            );

            // 3. Extract top-level folders from hierarchy tree, excluding already-matched ones
            const topLevelFolders = gDriveTree.roots
              .filter((root) => !confirmedFolderIds.has(root.id))
              .map((root) => ({
                id: root.id,
                name: normalize(root.name),
                originalName: root.name,
              }));

            // 4. Process attachments
            const mappingResults: MappingResult[] = [];
            const needsReview: MappingResult[] = [];
            const unmappedAgencies: UnmappedAgency[] = [];
            let fromStoreCount = 0;
            let autoMatchedCount = 0;

            const entries = Array.from(HashMap.entries(attachments));

            for (const [agencyName, attachmentData] of entries) {
              const attachmentCount = List.size(attachmentData);

              // Check if already mapped in store with >= 90% confidence (resolved)
              const existing = existingMappings[agencyName];
              if (existing && existing.confidence >= 90) {
                mappingResults.push({
                  agencyName,
                  folderId: existing.folderId,
                  folderName: existing.folderName,
                  attachmentCount,
                  match: {
                    confidence: existing.confidence === 100 ? "exact" : "high",
                    score: existing.confidence,
                    matchType: existing.matchType,
                    reasoning: existing.reasoning,
                  },
                  source: "existing",
                });
                fromStoreCount++;
                continue;
              }

              // For items needing review (< 90%) or unmapped (0%), recalculate with current algorithm
              // This ensures algorithm improvements are applied on each run
              // Only skip if already confirmed (>= 90%)

              // Find matches (only from available/unmatched folders)
              const { best, candidates } = findMatches(
                agencyName,
                topLevelFolders,
              );

              if (best && best.details.score >= 90) {
                // Auto-accept and save to store
                const mapping = toAgencyMapping(
                  best,
                  best.details.score === 100 ? "exact" : "auto",
                );
                yield* store.set(agencyName, mapping);

                mappingResults.push({
                  agencyName,
                  folderId: best.folderId,
                  folderName: best.folderName,
                  attachmentCount,
                  match: best.details,
                  source: "new",
                });
                autoMatchedCount++;
              } else if (
                candidates.length > 0 &&
                candidates[0].details.score >= 40
              ) {
                // Has candidates but needs review - save to store with actual confidence
                const topCandidate = candidates[0];
                const mapping = toAgencyMapping(topCandidate, "auto");
                yield* store.set(agencyName, mapping);

                needsReview.push({
                  agencyName,
                  folderId: topCandidate.folderId,
                  folderName: topCandidate.folderName,
                  attachmentCount,
                  match: topCandidate.details,
                  source: "new",
                  candidates, // Include all candidates for review
                });
              } else {
                // No good matches - still save to store with 0% confidence for review
                const unmappedMapping: AgencyMapping = {
                  folderId: "",
                  folderName: "",
                  confidence: 0,
                  matchType: "auto",
                  reasoning: "No matching folder found (needs manual entry)",
                  matchedAt: new Date().toISOString(),
                };
                yield* store.set(agencyName, unmappedMapping);

                unmappedAgencies.push({
                  agencyName,
                  attachmentCount,
                  candidates,
                });
              }
            }

            // 4. Save store
            yield* store.save();

            // 5. Calculate stats
            const stats: MappingStats = {
              total: entries.length,
              fromStore: fromStoreCount,
              autoMatched: autoMatchedCount,
              needsReview: needsReview.length,
              unmapped: unmappedAgencies.length,
            };

            // 6. Create output and log results
            const output: MappingOutput = {
              mapping: mappingResults,
              needsReview,
              unmapped: unmappedAgencies,
              stats,
            };

            yield* logMappingResults(output, fs);

            return output;
          }),
      } as const;
    }),
    dependencies: [NodeContext.layer, AgencyMappingStoreService.Default],
  },
) {}
