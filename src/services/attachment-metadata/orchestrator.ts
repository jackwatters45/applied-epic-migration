import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List, Option } from "effect";
import { CsvExplorerService } from "../csv/explorer.js";
import { CsvExtractorService } from "../csv/extract.js";
import {
  AttachmentMetadataTransformerService,
  type CompanyGroup,
} from "./transform.js";
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
            yield* logSingleOutput(transformed);

            // organize into year
            const organized = yield* yearResolver.resolveYear(transformed);

            return organized;
            // TODO: determine how/if we can determine subfolders? ie claims, etc
          }),
      };
    }),
    dependencies: [
      CsvExplorerService.Default,
      CsvExtractorService.Default,
      AttachmentMetadataValidatorService.Default,
      AttachmentMetadataTransformerService.Default,
      YearResolutionService.Default,
    ],
  },
) {}

const logSingleOutput = (
  transformed: HashMap.HashMap<string, List.List<CompanyGroup>>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const option = HashMap.get(transformed, "SUNDMON-01");
    const values = Option.getOrThrow(option);
    const arr = List.toArray(values);

    const data = {
      "SUNDMON-01": arr,
    };

    yield* fs.writeFileString(
      "logs/output.json",
      JSON.stringify(data, null, 2),
    );
  }).pipe(Effect.provide(NodeContext.layer));
