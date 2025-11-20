import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { ProgressLoggerService } from "../lib/progress.js";

// Types for rollback operations
export interface RollbackOperation {
  readonly id: string;
  readonly type: "move" | "trash" | "delete" | "rename";
  readonly fileId: string;
  readonly fileName: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly timestamp: Date;
  readonly batchId?: string;
  readonly metadata?: Record<string, string>;
}

export interface RollbackSession {
  readonly id: string;
  readonly startTime: Date;
  readonly endTime?: Date;
  readonly status:
    | "active"
    | "completed"
    | "failed"
    | "rolled_back"
    | "partially_rolled_back";
  readonly operations: readonly RollbackOperation[];
  readonly errors: readonly string[];
}

export interface RollbackOptions {
  readonly continueOnError: boolean;
  readonly maxRetries: number;
  readonly retryDelay: number; // milliseconds
}

export interface RollbackResult {
  readonly success: boolean;
  readonly totalOperations: number;
  readonly successfulRollbacks: number;
  readonly failedRollbacks: number;
  readonly errors: readonly string[];
  readonly session: RollbackSession;
}

// Error type for rollback operations
export class RollbackError extends Schema.TaggedError<RollbackError>()(
  "RollbackError",
  {
    message: Schema.String,
    type: Schema.String,
    operationId: Schema.optional(Schema.String),
    sessionId: Schema.optional(Schema.String),
    details: Schema.optional(Schema.String),
  },
) {}

// Rollback Service
export class RollbackService extends Effect.Service<RollbackService>()(
  "RollbackService",
  {
    effect: Effect.gen(function* () {
      const progress = yield* ProgressLoggerService;

      // In-memory storage for active sessions
      const activeSessions = new Map<string, RollbackSession>();

      // File path for persistence
      const getRollbackFilePath = (sessionId: string) =>
        join(process.cwd(), "logs", `rollback-session-${sessionId}.json`);

      // Generate unique IDs
      const generateId = () =>
        `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Create a new rollback session
      const createSession = (_batchId?: string) =>
        Effect.gen(function* () {
          const sessionId = generateId();
          const session: RollbackSession = {
            id: sessionId,
            startTime: new Date(),
            status: "active",
            operations: [],
            errors: [],
          };

          activeSessions.set(sessionId, session);

          // Persist session immediately
          yield* persistSession(session);

          yield* progress.logItem(`Created rollback session: ${sessionId}`);

          return session;
        });

      // Log an operation for potential rollback
      const logOperation = (
        sessionId: string,
        operation: Omit<RollbackOperation, "id" | "timestamp">,
      ) =>
        Effect.gen(function* () {
          const session = activeSessions.get(sessionId);
          if (!session) {
            throw new RollbackError({
              message: `Session ${sessionId} not found`,
              type: "SESSION_NOT_FOUND",
              sessionId,
            });
          }

          const rollbackOperation: RollbackOperation = {
            ...operation,
            id: generateId(),
            timestamp: new Date(),
          };

          // Add to session operations
          const updatedSession: RollbackSession = {
            ...session,
            operations: [...session.operations, rollbackOperation],
          };

          activeSessions.set(sessionId, updatedSession);

          // Persist updated session
          yield* persistSession(updatedSession);

          yield* progress.logItem(
            `Logged rollback operation: ${rollbackOperation.type} - ${rollbackOperation.fileName} (${rollbackOperation.fileId})`,
          );

          return rollbackOperation;
        });

      // Persist session to file system
      const persistSession = (session: RollbackSession) =>
        Effect.gen(function* () {
          const filePath = getRollbackFilePath(session.id);
          const sessionData = JSON.stringify(session, null, 2);

          yield* Effect.catchAll(
            Effect.tryPromise({
              try: () => writeFile(filePath, sessionData, "utf-8"),
              catch: (error) =>
                new RollbackError({
                  message: `Failed to persist session ${session.id}: ${error}`,
                  type: "PERSISTENCE_ERROR",
                  sessionId: session.id,
                  details: String(error),
                }),
            }),
            (error) =>
              progress.logItem(
                `Warning: Failed to persist rollback session: ${error}`,
              ),
          );
        });

      // Load session from file system
      const loadSession = (sessionId: string) =>
        Effect.gen(function* () {
          const filePath = getRollbackFilePath(sessionId);
          const sessionData = yield* Effect.mapError(
            Effect.tryPromise(() => readFile(filePath, "utf-8")),
            (error) =>
              new RollbackError({
                message: `Failed to read session file for ${sessionId}: ${error}`,
                type: "FILE_READ_ERROR",
                sessionId,
                details: String(error),
              }),
          );

          const session = JSON.parse(sessionData) as RollbackSession;

          // Convert string timestamps back to Date objects
          const sessionWithDates: RollbackSession = {
            id: session.id,
            startTime: new Date(session.startTime),
            status: session.status,
            operations: session.operations.map((op) => ({
              ...op,
              timestamp: new Date(op.timestamp),
            })),
            errors: session.errors,
            ...(session.endTime && { endTime: new Date(session.endTime) }),
          };

          activeSessions.set(sessionId, sessionWithDates);
          return sessionWithDates;
        });

      // Complete a session successfully
      const completeSession = (sessionId: string) =>
        Effect.gen(function* () {
          const session = activeSessions.get(sessionId);
          if (!session) {
            throw new RollbackError({
              message: `Session ${sessionId} not found`,
              type: "SESSION_NOT_FOUND",
              sessionId,
            });
          }

          const completedSession: RollbackSession = {
            ...session,
            endTime: new Date(),
            status: "completed",
          };

          activeSessions.set(sessionId, completedSession);
          yield* persistSession(completedSession);

          yield* progress.logItem(`Completed rollback session: ${sessionId}`);
          return completedSession;
        });

      // Mark session as failed
      const failSession = (sessionId: string, error: string) =>
        Effect.gen(function* () {
          const session = activeSessions.get(sessionId);
          if (!session) {
            throw new RollbackError({
              message: `Session ${sessionId} not found`,
              type: "SESSION_NOT_FOUND",
              sessionId,
            });
          }

          const failedSession: RollbackSession = {
            ...session,
            endTime: new Date(),
            status: "failed",
            errors: [...session.errors, error],
          };

          activeSessions.set(sessionId, failedSession);
          yield* persistSession(failedSession);

          yield* progress.logItem(
            `Failed rollback session: ${sessionId} - ${error}`,
          );
          return failedSession;
        });

      // Execute rollback for a session
      const executeRollback = (
        sessionId: string,
        options: Partial<RollbackOptions> = {},
      ) =>
        Effect.gen(function* () {
          const opts: RollbackOptions = {
            continueOnError: true,
            maxRetries: 3,
            retryDelay: 1000,
            ...options,
          };

          // Load session (in case it's not in memory)
          let session = activeSessions.get(sessionId);
          if (!session) {
            session = yield* loadSession(sessionId);
          }

          if (session.operations.length === 0) {
            yield* progress.logItem(
              `No operations to rollback for session ${sessionId}`,
            );
            return {
              success: true,
              totalOperations: 0,
              successfulRollbacks: 0,
              failedRollbacks: 0,
              errors: [],
              session,
            } as const;
          }

          yield* progress.startTask(
            "Rolling back operations",
            session.operations.length,
          );

          let successfulRollbacks = 0;
          let failedRollbacks = 0;
          const errors: string[] = [];

          // Process operations in reverse order (LIFO)
          const reversedOperations = [...session.operations].reverse();

          for (let i = 0; i < reversedOperations.length; i++) {
            const operation = reversedOperations[i];
            yield* progress.logProgress(
              i + 1,
              `Rolling back: ${operation.fileName} (${i + 1}/${reversedOperations.length})`,
            );

            const rollbackResult = yield* Effect.either(
              rollbackSingleOperation(operation, opts),
            );

            if (rollbackResult._tag === "Right") {
              successfulRollbacks++;
              yield* progress.logItem(
                `Successfully rolled back: ${operation.fileName}`,
              );
            } else {
              failedRollbacks++;
              const errorMsg = `Failed to rollback ${operation.fileName}: ${String(rollbackResult.left)}`;
              errors.push(errorMsg);
              yield* progress.logItem(errorMsg);

              if (!opts.continueOnError) {
                break;
              }
            }
          }

          yield* progress.complete();

          // Update session status
          const rolledBackSession: RollbackSession = {
            ...session,
            endTime: new Date(),
            status:
              failedRollbacks > 0 ? "partially_rolled_back" : "rolled_back",
            errors: [...session.errors, ...errors],
          };

          activeSessions.set(sessionId, rolledBackSession);
          yield* persistSession(rolledBackSession);

          const result: RollbackResult = {
            success: failedRollbacks === 0,
            totalOperations: session.operations.length,
            successfulRollbacks,
            failedRollbacks,
            errors,
            session: rolledBackSession,
          };

          yield* progress.logItem(
            `Rollback complete: ${successfulRollbacks}/${session.operations.length} operations successful`,
          );

          return result;
        });

      // Rollback a single operation (this would be integrated with GoogleDriveFileService)
      const rollbackSingleOperation = (
        operation: RollbackOperation,
        options: RollbackOptions,
      ) =>
        Effect.gen(function* () {
          let retries = 0;

          while (retries <= options.maxRetries) {
            const rollbackAttempt = yield* Effect.either(
              Effect.gen(function* () {
                switch (operation.type) {
                  case "move":
                    // Move file back to source
                    yield* progress.logItem(
                      `[ROLLBACK] Moving ${operation.fileName} from ${operation.targetId} back to ${operation.sourceId}`,
                    );
                    // Note: This would integrate with GoogleDriveFileService.moveFile()
                    break;

                  case "trash":
                    // Untrash the file
                    yield* progress.logItem(
                      `[ROLLBACK] Untrashing ${operation.fileName}`,
                    );
                    // Note: This would integrate with GoogleDriveFileService.untrashFile()
                    break;

                  case "delete":
                    // Cannot rollback delete operations
                    throw new Error(
                      "Cannot rollback delete operations - files are permanently lost",
                    );

                  case "rename":
                    // Rename file back to original name
                    yield* progress.logItem(
                      `[ROLLBACK] Renaming ${operation.fileName} back to original name`,
                    );
                    // Note: This would integrate with GoogleDriveFileService.renameFile()
                    break;

                  default:
                    throw new Error(
                      `Unknown operation type: ${operation.type}`,
                    );
                }
              }),
            );

            if (rollbackAttempt._tag === "Right") {
              return; // Success, exit retry loop
            }

            retries++;
            if (retries > options.maxRetries) {
              throw new RollbackError({
                message: `Failed to rollback operation ${operation.id} after ${options.maxRetries} retries`,
                type: "ROLLBACK_OPERATION_FAILED",
                operationId: operation.id,
                details: String(rollbackAttempt.left),
              });
            }

            // Wait before retry
            yield* Effect.sleep(options.retryDelay * retries);
          }
        });

      // Get session information
      const getSession = (sessionId: string) =>
        Effect.gen(function* () {
          let session = activeSessions.get(sessionId);
          if (!session) {
            const loadResult = yield* Effect.either(loadSession(sessionId));
            if (loadResult._tag === "Right") {
              session = loadResult.right;
            } else {
              return null;
            }
          }
          return session;
        });

      // List all rollback sessions
      const listSessions = () =>
        Effect.succeed(Array.from(activeSessions.values()));

      return {
        createSession,
        logOperation,
        completeSession,
        failSession,
        executeRollback,
        getSession,
        listSessions,
      } as const;
    }),
    dependencies: [ProgressLoggerService.Default],
  },
) {}
