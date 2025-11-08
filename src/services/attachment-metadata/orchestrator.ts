import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List, Option } from "effect";
import { CsvExplorerService } from "../csv/explorer.js";
import { CsvExtractorService } from "../csv/extract.js";
import { DeduplicationService } from "./deduplication.js";
import { AttachmentMetadataTransformerService } from "./transform.js";
import { AttachmentMetadataValidatorService } from "./validate.js";
import { YearResolutionService } from "./year-resolver.js";

export class AttachmentMetadataOrchestratorService extends Effect.Service<AttachmentMetadataOrchestratorService>()(
  "AttachmentMetadataOrchestratorService",
  {
    effect: Effect.gen(function* () {
      const _explorer = yield* CsvExplorerService;
      const extractor = yield* CsvExtractorService;
      const validator = yield* AttachmentMetadataValidatorService;
      const transformer = yield* AttachmentMetadataTransformerService;
      const yearResolver = yield* YearResolutionService;
      const deduplicator = yield* DeduplicationService;

      return {
        run: () =>
          Effect.gen(function* () {
            const extracted = yield* extractor.extract(
              "data/BORDE05_AttachmentMetaData_Report.xlsx - Results.csv",
            );

            const validated =
              yield* validator.validateAttachmentMetadata(extracted);

            const transformed =
              yield* transformer.transformAttachmentMetadata(validated);

            yield* logSingleOutput(transformed, "transformed");

            const deduplicated = yield* deduplicator.deduplicateByFileId(
              HashMap.map(transformed, List.toArray),
            );

            const deduplicatedTransformed = HashMap.map(
              deduplicated,
              List.fromIterable,
            );

            yield* logSingleOutput(deduplicatedTransformed, "deduplicated");

            const deduplicatedEntries = Array.from(
              HashMap.entries(deduplicatedTransformed),
            );
            const deduplicatedMap = new Map(
              deduplicatedEntries.map(([key, list]) => [
                key,
                List.toArray(list),
              ]),
            );

            const organized = yield* yearResolver.resolveYear(deduplicatedMap);

            const organizedHashMap = HashMap.fromIterable(
              Array.from(organized.entries()).map(([key, value]) => [
                key,
                List.fromIterable(value),
              ]),
            );
            yield* logSingleOutput(organizedHashMap, "organized");

            yield* logYearMetrics(yearResolver);

            return organized;
          }),
      };
    }),
    dependencies: [
      CsvExplorerService.Default,
      CsvExtractorService.Default,
      AttachmentMetadataValidatorService.Default,
      AttachmentMetadataTransformerService.Default,
      YearResolutionService.Default,
      DeduplicationService.Default,
    ],
  },
) {}

const logSingleOutput = (
  hashMap: HashMap.HashMap<string, List.List<unknown>>,
  name: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const option = HashMap.get(hashMap, "SUNDMON-01");
    const values = Option.getOrThrow(option);
    const arr = List.toArray(values);

    const data = {
      "SUNDMON-01": arr,
    };

    yield* fs.writeFileString(
      `logs/${name}.json`,
      JSON.stringify(data, null, 2),
    );
  }).pipe(Effect.provide(NodeContext.layer));

const logYearMetrics = (yearResolver: YearResolutionService) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const metrics = yield* yearResolver.getMetrics();

    yield* fs.writeFileString(
      "logs/year-metrics.json",
      JSON.stringify(metrics, null, 2),
    );
  }).pipe(Effect.provide(NodeContext.layer));
