import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, HashMap, List } from "effect";
import type { Attachment, OrganizedHashMap } from "src/lib/type.js";

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

            // Convert to OrganizedHashMap format
            let hashMap = HashMap.empty<string, List.List<Attachment>>();
            for (const [key, values] of Object.entries(parsed)) {
              hashMap = HashMap.set(hashMap, key, List.fromIterable(values));
            }

            return hashMap as OrganizedHashMap;
          }).pipe(Effect.catchAll(() => Effect.succeed(null))),
      };
    }),
    dependencies: [NodeContext.layer],
  },
) {}
