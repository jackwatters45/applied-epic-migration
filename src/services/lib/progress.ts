import { Effect } from "effect";

export class ProgressLoggerService extends Effect.Service<ProgressLoggerService>()(
  "ProgressLoggerService",
  {
    effect: Effect.gen(function* () {
      const startTask = (taskName: string, total: number) =>
        Effect.sync(() => {
          console.log(`\n🚀 ${taskName} (${total} items)`);
        });

      const logProgress = (current: number, message?: string) =>
        Effect.sync(() => {
          const msg = message ? `: ${message}` : "";
          console.log(`  ⏳ [${current}]${msg}`);
        });

      const logItem = (message: string) =>
        Effect.sync(() => {
          console.log(`    → ${message}`);
        });

      const complete = () =>
        Effect.sync(() => {
          console.log("✅ Complete\n");
        });

      return {
        startTask,
        logProgress,
        logItem,
        complete,
      } as const;
    }),
  },
) {}
