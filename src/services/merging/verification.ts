import { Effect, Schema } from "effect";
import { CacheMode } from "../../lib/type.js";
import { GoogleDriveFileService } from "../google-drive/file.js";
import { ProgressLoggerService } from "../lib/progress.js";

// Types for verification operations
export interface MoveVerificationResult {
  readonly success: boolean;
  readonly expectedItemCount: number;
  readonly actualItemCount: number;
  readonly missingItems: readonly string[];
  readonly extraItems: readonly string[];
  readonly sourceFolderEmpty: boolean;
  readonly remainingSourceItems: readonly string[];
  readonly errors: readonly string[];
}

export interface VerifyMoveOptions {
  readonly sourceId: string;
  readonly targetId: string;
  readonly expectedItems: readonly { id: string; name: string }[];
  readonly originalTargetItemCount?: number;
  readonly sharedDriveId?: string;
}

// Error type for verification operations
export class VerificationError extends Schema.TaggedError<VerificationError>()(
  "VerificationError",
  {
    message: Schema.String,
    type: Schema.String,
    details: Schema.optional(Schema.String),
  },
) {}

// Verification Service
export class VerificationService extends Effect.Service<VerificationService>()(
  "VerificationService",
  {
    effect: Effect.gen(function* () {
      const googleDrive = yield* GoogleDriveFileService;
      const progress = yield* ProgressLoggerService;

      const verifyMoveComplete = (
        options: VerifyMoveOptions,
      ): Effect.Effect<MoveVerificationResult, VerificationError> =>
        Effect.gen(function* () {
          const {
            sourceId,
            targetId,
            expectedItems,
            originalTargetItemCount,
            sharedDriveId,
          } = options;
          const errors: string[] = [];
          const missingItems: string[] = [];
          const extraItems: string[] = [];

          yield* progress.logItem(
            `Starting verification of move from ${sourceId} to ${targetId}`,
          );

          // 1. Get current items in target folder (NO CACHE - must be fresh)
          const targetItems = yield* Effect.mapError(
            googleDrive.listFiles({
              parentId: targetId,
              ...(sharedDriveId && { sharedDriveId }),
              cacheMode: CacheMode.NONE,
            }),
            (error) =>
              new VerificationError({
                message: `Failed to list items in target folder ${targetId}: ${error}`,
                type: "TARGET_LIST_ERROR",
              }),
          );

          // 2. Get remaining items in source folder (NO CACHE - must be fresh)
          const sourceItems = yield* Effect.mapError(
            googleDrive.listFiles({
              parentId: sourceId,
              ...(sharedDriveId && { sharedDriveId }),
              cacheMode: CacheMode.NONE,
            }),
            (error) =>
              new VerificationError({
                message: `Failed to list items in source folder ${sourceId}: ${error}`,
                type: "SOURCE_LIST_ERROR",
              }),
          );

          // 3. Count expected and actual items
          const expectedItemCount = expectedItems.length;
          const actualItemCount = targetItems.length;

          // 4. If we know the original target count, verify the exact count
          if (originalTargetItemCount !== undefined) {
            const expectedTotalCount =
              originalTargetItemCount + expectedItemCount;
            if (actualItemCount !== expectedTotalCount) {
              errors.push(
                `Item count mismatch: expected ${expectedTotalCount} (${originalTargetItemCount} original + ${expectedItemCount} moved), found ${actualItemCount} in target folder`,
              );
            }
          }

          // 5. Verify each expected item exists in target
          for (const expectedItem of expectedItems) {
            const foundInTarget = targetItems.some(
              (item) => item.id === expectedItem.id,
            );
            if (!foundInTarget) {
              missingItems.push(expectedItem.name);
              errors.push(
                `Expected item "${expectedItem.name}" (ID: ${expectedItem.id}) not found in target folder`,
              );
              yield* progress.logItem(
                `  DEBUG: Looking for ID ${expectedItem.id} in target with ${targetItems.length} items`,
              );
            }
          }

          // 6. Identify items in target that weren't moved (pre-existing or unexpected)
          const expectedItemIds = new Set(expectedItems.map((item) => item.id));
          for (const targetItem of targetItems) {
            if (!expectedItemIds.has(targetItem.id)) {
              extraItems.push(targetItem.name);
            }
          }

          if (extraItems.length > 0 && originalTargetItemCount === undefined) {
            yield* progress.logItem(
              `Info: Found ${extraItems.length} pre-existing items in target folder: ${extraItems.join(", ")}`,
            );
          }

          // 6. Verify source folder is empty (except for system files)
          const sourceFolderEmpty = sourceItems.length === 0;
          const remainingSourceItems = sourceItems.map((item) => item.name);

          if (!sourceFolderEmpty) {
            errors.push(
              `Source folder ${sourceId} still contains ${sourceItems.length} items: ${remainingSourceItems.join(", ")}`,
            );
          }

          // 7. Log verification results
          yield* progress.logItem("Verification complete:");
          yield* progress.logItem(`  Items moved: ${expectedItemCount}`);
          yield* progress.logItem(
            `  Target folder total: ${actualItemCount} items`,
          );
          if (originalTargetItemCount !== undefined) {
            yield* progress.logItem(
              `  Target breakdown: ${originalTargetItemCount} original + ${expectedItemCount} moved = ${originalTargetItemCount + expectedItemCount} expected`,
            );
          }
          yield* progress.logItem(`  Missing items: ${missingItems.length}`);
          yield* progress.logItem(
            `  Source folder empty: ${sourceFolderEmpty}`,
          );

          if (missingItems.length > 0) {
            yield* progress.logItem(`  Missing: ${missingItems.join(", ")}`);
          }

          if (remainingSourceItems.length > 0) {
            yield* progress.logItem(
              `  Remaining in source: ${remainingSourceItems.join(", ")}`,
            );
          }

          const success =
            errors.length === 0 &&
            sourceFolderEmpty &&
            missingItems.length === 0;

          return {
            success,
            expectedItemCount,
            actualItemCount,
            missingItems,
            extraItems,
            sourceFolderEmpty,
            remainingSourceItems,
            errors,
          } as const;
        });

      const verifyBatchMoves = (
        moves: Array<{
          sourceId: string;
          targetId: string;
          expectedItems: readonly { id: string; name: string }[];
        }>,
      ): Effect.Effect<MoveVerificationResult[], VerificationError> =>
        Effect.gen(function* () {
          const results: MoveVerificationResult[] = [];

          yield* progress.startTask("Verifying batch moves", moves.length);

          for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            yield* progress.logProgress(
              i + 1,
              `Verifying move ${i + 1}/${moves.length}`,
            );

            const result = yield* verifyMoveComplete({
              sourceId: move.sourceId,
              targetId: move.targetId,
              expectedItems: move.expectedItems,
            });

            results.push(result);

            if (!result.success) {
              yield* progress.logItem(
                `Verification failed for move from ${move.sourceId} to ${move.targetId}`,
              );
            }
          }

          yield* progress.complete();

          const successCount = results.filter((r) => r.success).length;
          const failureCount = results.length - successCount;

          yield* progress.logItem(
            `Batch verification complete: ${successCount} successful, ${failureCount} failed`,
          );

          return results;
        });

      return {
        verifyMoveComplete,
        verifyBatchMoves,
      } as const;
    }),
    dependencies: [
      GoogleDriveFileService.Default,
      ProgressLoggerService.Default,
    ],
  },
) {}
