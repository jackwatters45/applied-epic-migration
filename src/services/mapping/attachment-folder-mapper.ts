import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List } from "effect";
import type { OrganizedByAgency } from "src/lib/type.js";
import type { HierarchyTree } from "../google-drive/folder-hierarchy.js";

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
};

type UnmappedAgency = {
  readonly agencyName: string;
  readonly attachmentCount: number;
  readonly candidates: MatchCandidate[];
};

type MappingStats = {
  readonly total: number;
  readonly exactMatches: number;
  readonly highConfidence: number;
  readonly mediumConfidence: number;
  readonly lowConfidence: number;
  readonly unmapped: number;
};

type MappingOutput = {
  readonly mapping: MappingResult[];
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

  // Calculate base similarity
  const similarity = calculateSimilarity(normAgency, normFolder);

  // Check for prefix/suffix matches
  const isPrefixMatch =
    normFolder.startsWith(normAgency) || normAgency.startsWith(normFolder);
  const isSuffixMatch =
    normFolder.endsWith(normAgency) || normAgency.endsWith(normFolder);
  const isContained =
    normFolder.includes(normAgency) || normAgency.includes(normFolder);

  // Adjust score based on match patterns
  let adjustedScore = similarity;
  let matchType = "similarity";
  let reasoning = `String similarity: ${similarity}%`;

  if (isPrefixMatch) {
    adjustedScore = Math.max(adjustedScore, 85);
    matchType = "prefix";
    reasoning = `Prefix match detected (similarity: ${similarity}%)`;
  } else if (isSuffixMatch) {
    adjustedScore = Math.max(adjustedScore, 80);
    matchType = "suffix";
    reasoning = `Suffix match detected (similarity: ${similarity}%)`;
  } else if (isContained) {
    adjustedScore = Math.max(adjustedScore, 75);
    matchType = "contains";
    reasoning = `One name contains the other (similarity: ${similarity}%)`;
  }

  // Check for word overlap
  const agencyWords = new Set(
    normAgency.split(" ").filter((w) => w.length > 2),
  );
  const folderWords = new Set(
    normFolder.split(" ").filter((w) => w.length > 2),
  );
  const commonWords = [...agencyWords].filter((w) => folderWords.has(w));
  const wordOverlap =
    agencyWords.size > 0 ? (commonWords.length / agencyWords.size) * 100 : 0;

  if (wordOverlap >= 50 && adjustedScore < 70) {
    adjustedScore = Math.max(adjustedScore, 60 + wordOverlap * 0.2);
    matchType = "word-overlap";
    reasoning = `${commonWords.length} common words: "${commonWords.join(", ")}" (${Math.round(wordOverlap)}% overlap)`;
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
    .filter((m) => m.details.score >= 40) // Only include reasonable matches
    .sort((a, b) => b.details.score - a.details.score);

  const best =
    allMatches.length > 0 && allMatches[0].details.score >= 70
      ? allMatches[0]
      : null;

  // Return top 5 candidates for review
  const candidates = allMatches.slice(0, 5);

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

const logMappingResults = (
  output: MappingOutput,
  fs: FileSystem.FileSystem,
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    yield* fs.writeFileString(
      "logs/attachment-folder-mapping.json",
      JSON.stringify(output, null, 2),
    );

    console.log(`\n${"=".repeat(60)}`);
    console.log("📊 ATTACHMENT FOLDER MAPPING REPORT");
    console.log(`${"=".repeat(60)}\n`);

    // Stats summary
    console.log("📈 STATISTICS:");
    console.log(`   Total agencies: ${output.stats.total}`);
    console.log(`   ✅ Exact matches: ${output.stats.exactMatches}`);
    console.log(`   🟢 High confidence: ${output.stats.highConfidence}`);
    console.log(`   🟡 Medium confidence: ${output.stats.mediumConfidence}`);
    console.log(`   🟠 Low confidence: ${output.stats.lowConfidence}`);
    console.log(`   🔴 Unmapped: ${output.stats.unmapped}`);
    console.log("");

    // Successful mappings by confidence
    if (output.mapping.length > 0) {
      console.log("📁 MAPPED AGENCIES:");
      console.log("-".repeat(60));

      // Group by confidence
      const byConfidence = {
        exact: output.mapping.filter((m) => m.match.confidence === "exact"),
        high: output.mapping.filter((m) => m.match.confidence === "high"),
        medium: output.mapping.filter((m) => m.match.confidence === "medium"),
        low: output.mapping.filter((m) => m.match.confidence === "low"),
      };

      for (const [confidence, mappings] of Object.entries(byConfidence)) {
        if (mappings.length > 0) {
          console.log(
            `\n${getConfidenceEmoji(confidence as MatchConfidence)} ${confidence.toUpperCase()} CONFIDENCE (${mappings.length}):`,
          );
          for (const m of mappings) {
            console.log(
              `   "${m.agencyName}" → "${m.folderName}" (${m.attachmentCount} files)`,
            );
            console.log(
              `      Score: ${m.match.score}% | ${m.match.reasoning}`,
            );
          }
        }
      }
    }

    // Unmapped agencies with candidates
    if (output.unmapped.length > 0) {
      console.log(`\n${"=".repeat(60)}`);
      console.log("🔴 UNMAPPED AGENCIES (need manual review):");
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

    console.log(`\n${"=".repeat(60)}\n`);
  });

export class AttachmentFolderMapperService extends Effect.Service<AttachmentFolderMapperService>()(
  "AttachmentFolderMapperService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      return {
        mergeAttachmentsToFolders: ({
          attachments,
          gDriveTree,
        }: MergeAttachmentsToFolders) =>
          Effect.gen(function* () {
            // 1. Extract top-level folders from hierarchy tree
            const topLevelFolders = gDriveTree.roots.map((root) => ({
              id: root.id,
              name: normalize(root.name),
              originalName: root.name,
            }));

            // 2. Process attachments and find matches
            const mappingResults: MappingResult[] = [];
            const unmappedAgencies: UnmappedAgency[] = [];

            const entries = Array.from(HashMap.entries(attachments));

            for (const [agencyName, attachmentData] of entries) {
              const attachmentCount = List.size(attachmentData);
              const { best, candidates } = findMatches(
                agencyName,
                topLevelFolders,
              );

              if (best) {
                mappingResults.push({
                  agencyName,
                  folderId: best.folderId,
                  folderName: best.folderName,
                  attachmentCount,
                  match: best.details,
                });
              } else {
                unmappedAgencies.push({
                  agencyName,
                  attachmentCount,
                  candidates,
                });
              }
            }

            // 3. Calculate detailed statistics
            const stats: MappingStats = {
              total: entries.length,
              exactMatches: mappingResults.filter(
                (m) => m.match.confidence === "exact",
              ).length,
              highConfidence: mappingResults.filter(
                (m) => m.match.confidence === "high",
              ).length,
              mediumConfidence: mappingResults.filter(
                (m) => m.match.confidence === "medium",
              ).length,
              lowConfidence: mappingResults.filter(
                (m) => m.match.confidence === "low",
              ).length,
              unmapped: unmappedAgencies.length,
            };

            // 4. Create output and log results
            const output: MappingOutput = {
              mapping: mappingResults,
              unmapped: unmappedAgencies,
              stats,
            };

            yield* logMappingResults(output, fs);

            return output;
          }),
      } as const;
    }),
    dependencies: [NodeContext.layer],
  },
) {}
