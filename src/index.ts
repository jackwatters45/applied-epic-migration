import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, Layer, List, Option } from "effect";
import {
  AttachmentMetadataTransformerService,
  type CompanyGroup,
} from "./services/attachment-metadata/transform.js";
import { AttachmentMetadataValidatorService } from "./services/attachment-metadata/validate.js";
import { CsvExplorerService } from "./services/csv/explorer.js";
import { CsvExtractorService } from "./services/csv/extract.js";

export const ApplicationLayer = Layer.mergeAll(
  CsvExplorerService.Default,
  CsvExtractorService.Default,
  AttachmentMetadataValidatorService.Default,
  AttachmentMetadataTransformerService.Default,
);

const program = Effect.gen(function* () {
  const extractor = yield* CsvExtractorService;
  const validator = yield* AttachmentMetadataValidatorService;
  const transformer = yield* AttachmentMetadataTransformerService;

  const extracted = yield* extractor.extract(
    "data/BORDE05_AttachmentMetaData_Report.xlsx - Results.csv",
  );

  const validated = yield* validator.validateAttachmentMetadata(extracted);

  const transformed = yield* transformer.transformAttachmentMetadata(validated);

  yield* logSingleOutput(transformed);

  // organize into year
  // determine how/if we can determine subfolders? ie claims, etc
  // start with sorting logic from above?
});

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

Effect.runPromise(program.pipe(Effect.provide(ApplicationLayer)));
