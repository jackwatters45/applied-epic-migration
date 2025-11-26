import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List } from "effect";
import type { Attachment, OrganizedByAgency } from "src/lib/type.js";

export class AttachmentCacheService extends Effect.Service<AttachmentCacheService>()(
  "AttachmentCacheService",
  {
    effect: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      return {
        readCache: () =>
          Effect.gen(function* () {
            const data = yield* fs.readFile("logs/organized.json");
            const json = new TextDecoder().decode(data);
            const parsed = JSON.parse(json) as Record<
              string,
              Array<Attachment>
            >;

            // Convert to OrganizedByAgency format (keyed by agency name)
            let hashMap = HashMap.empty<string, List.List<Attachment>>();
            for (const [agencyName, values] of Object.entries(parsed)) {
              hashMap = HashMap.set(
                hashMap,
                agencyName,
                List.fromIterable(values),
              );
            }

            return hashMap as OrganizedByAgency;
          }).pipe(Effect.catchAll(() => Effect.succeed(null))),
      };
    }),
    dependencies: [NodeContext.layer],
  },
) {}
