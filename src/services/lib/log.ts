import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List, Option } from "effect";
import type { YearResolutionService } from "../attachment-metadata/year-resolver.js";

export class LoggingService extends Effect.Service<LoggingService>()(
  "LoggingService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      return {
        logEntireHM: (
          hashMap: HashMap.HashMap<string, List.List<unknown>>,
          name: string,
        ) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;

            const data: Record<string, unknown[]> = {};

            for (const [key, values] of HashMap.entries(hashMap)) {
              data[key] = List.toArray(values);
            }

            yield* fs.writeFileString(
              `logs/${name}.json`,
              JSON.stringify(data, null, 2),
            );
          }),

        logSingleValueHM: (
          hashMap: HashMap.HashMap<string, List.List<unknown>>,
          name: string,
        ) =>
          Effect.gen(function* () {
            const option = HashMap.get(
              hashMap,
              "Sunday Money LLC DBA Home Instead",
            );
            const values = Option.getOrThrow(option);
            const arr = List.toArray(values);

            const data = {
              "Sunday Money LLC DBA Home Instead": arr,
            };

            yield* fs.writeFileString(
              `logs/${name}.json`,
              JSON.stringify(data, null, 2),
            );
          }),

        // might want to use dep injection
        logYearMetrics: (yearResolver: YearResolutionService) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const metrics = yield* yearResolver.getMetrics();

            yield* fs.writeFileString(
              "logs/year-metrics.json",
              JSON.stringify(metrics, null, 2),
            );
          }),
      };
    }),
    dependencies: [NodeContext.layer],
  },
) {}
