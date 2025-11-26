import { Effect } from "effect";
import { ConfigService } from "src/lib/config.js";
import { CsvExplorerService } from "../csv/explorer.js";
import { CsvExtractorService } from "../csv/extract.js";
import { LoggingService } from "../lib/log.js";
import { AttachmentCacheService } from "./cache.js";
import { DeduplicationService } from "./deduplication.js";
import { AttachmentMetadataTransformerService } from "./transform.js";
import { AttachmentMetadataValidatorService } from "./validate.js";
import { YearResolutionService } from "./year-resolver.js";

export class AttachmentMetadataOrchestratorService extends Effect.Service<AttachmentMetadataOrchestratorService>()(
  "AttachmentMetadataOrchestratorService",
  {
    effect: Effect.gen(function* () {
      const _explorer = yield* CsvExplorerService;
      const logging = yield* LoggingService;
      const extractor = yield* CsvExtractorService;
      const validator = yield* AttachmentMetadataValidatorService;
      const transformer = yield* AttachmentMetadataTransformerService;
      const yearResolver = yield* YearResolutionService;
      const deduplicator = yield* DeduplicationService;
      const config = yield* ConfigService;
      const cache = yield* AttachmentCacheService;

      return {
        run: ({ useCache = false }: { useCache: boolean }) =>
          Effect.gen(function* () {
            if (useCache) {
              const cachedData = yield* cache.readCache();
              if (cachedData) {
                return cachedData;
              }
            }

            const csvPath = yield* config.metadataCsvPath;
            const extracted = yield* extractor.extract(csvPath);

            const validated =
              yield* validator.validateAttachmentMetadata(extracted);

            const transformed =
              yield* transformer.transformAttachmentMetadata(validated);

            yield* logging.logSingleValueHM(transformed, "transformed");

            const deduplicated =
              yield* deduplicator.deduplicateByFileId(transformed);

            yield* logging.logSingleValueHM(deduplicated, "deduplicated");

            const organized = yield* yearResolver.resolveYear(deduplicated);

            yield* logging.logEntireHM(organized, "organized");

            yield* logging.logYearMetrics(yearResolver);

            return organized;
          }),
      };
    }),
    dependencies: [
      ConfigService.Default,
      LoggingService.Default,
      CsvExplorerService.Default,
      CsvExtractorService.Default,
      AttachmentCacheService.Default,
      AttachmentMetadataValidatorService.Default,
      AttachmentMetadataTransformerService.Default,
      YearResolutionService.Default,
      DeduplicationService.Default,
    ],
  },
) {}
