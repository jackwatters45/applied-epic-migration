import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import type { OrganizedHashMap } from "src/lib/type.js";
import type { HierarchyTree } from "../google-drive/folder-hierarchy.js";

type MergeAttachmentsToFolders = {
  attachments: OrganizedHashMap;
  gDriveTree: HierarchyTree;
};

type MappingResult = {
  agencyName: string;
  folderId: string;
  folderName: string;
  attachmentCount: number;
};

type UnmappedAgency = {
  agencyName: string;
  possibleMatches: Array<{
    id: string;
    name: string;
  }>;
};

type MappingStats = {
  total: number;
  mapped: number;
  unmapped: number;
};

type MappingOutput = {
  mapping: MappingResult[];
  unmapped: UnmappedAgency[];
  stats: MappingStats;
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

    console.log("Attachment folder mapping completed:");
    console.log(`- Total agencies: ${output.stats.total}`);
    console.log(`- Successfully mapped: ${output.stats.mapped}`);
    console.log(`- Unmapped: ${output.stats.unmapped}`);

    if (output.unmapped.length > 0) {
      console.log("\nUnmapped agencies:");
      output.unmapped.forEach((unmapped) => {
        console.log(`- ${unmapped.agencyName}`);
        if (unmapped.possibleMatches.length > 0) {
          console.log(
            `  Possible matches: ${unmapped.possibleMatches
              .map((m) => m.name)
              .join(", ")}`,
          );
        }
      });
    }
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
              name: root.name.trim().toLowerCase(), // normalize for comparison
              originalName: root.name,
            }));

            // 2. Create mapping of folder name to folder ID
            const folderNameToId = new Map(
              topLevelFolders.map((folder) => [folder.name, folder.id]),
            );

            // 3. Process attachments and map to folders
            const mappingResults: MappingResult[] = [];
            const unmappedAgencies: UnmappedAgency[] = [];

            for (const [agencyName, attachmentData] of Object.entries(
              attachments,
            )) {
              const normalizedAgencyName = agencyName.trim().toLowerCase();

              // Try to find matching folder
              const folderId = folderNameToId.get(normalizedAgencyName);

              if (folderId) {
                const matchedFolder = topLevelFolders.find(
                  (f) => f.id === folderId,
                );
                mappingResults.push({
                  agencyName,
                  folderId,
                  folderName: matchedFolder?.originalName || "",
                  attachmentCount: attachmentData.length,
                });
              } else {
                // Find possible partial matches for unmapped agencies
                const possibleMatches = topLevelFolders.filter(
                  (folder) =>
                    folder.name.includes(normalizedAgencyName) ||
                    normalizedAgencyName.includes(folder.name),
                );

                unmappedAgencies.push({
                  agencyName,
                  possibleMatches: possibleMatches.map((folder) => ({
                    id: folder.id,
                    name: folder.originalName,
                  })),
                });
              }
            }

            // 4. Create statistics
            const stats: MappingStats = {
              total: Object.keys(attachments).length,
              mapped: mappingResults.length,
              unmapped: unmappedAgencies.length,
            };

            // 5. Log results
            const output: MappingOutput = {
              mapping: mappingResults,
              unmapped: unmappedAgencies,
              stats,
            };

            yield* logMappingResults(output, fs);

            // 6. Return mapping for further processing
            return output;
          }),
      } as const;
    }),
    dependencies: [NodeContext.layer],
  },
) {}
