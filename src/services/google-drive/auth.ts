import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { JWT } from "google-auth-library";
import { ConfigService } from "../../lib/config.js";

// Error types for Google Drive authentication
export class GoogleDriveAuthError extends Schema.TaggedError<GoogleDriveAuthError>()(
  "GoogleDriveAuthError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

// Google Drive Auth Service
export class GoogleDriveAuthService extends Effect.Service<GoogleDriveAuthService>()(
  "GoogleDriveAuthService",
  {
    effect: Effect.gen(function* () {
      const config = yield* ConfigService;
      const fs = yield* FileSystem.FileSystem;
      let authCache: JWT | null = null;

      return {
        getAuthenticatedClient: () =>
          Effect.gen(function* () {
            // Check if we have a cached auth client
            if (authCache) {
              return authCache;
            }

            // Validate that the service account key file exists and is readable
            const keyPath = config.googleDrive.serviceAccountKeyPath;

            const keyFileContent = yield* fs.readFileString(keyPath).pipe(
              Effect.mapError(
                () =>
                  new GoogleDriveAuthError({
                    message: `Cannot read service account key file at: ${keyPath}`,
                    status: 500,
                  }),
              ),
            );

            const keyData = JSON.parse(keyFileContent) as ServiceAccountKey;

            // Get impersonation email for domain-wide delegation
            const impersonateEmail = yield* config.googleDrive.impersonateEmail;

            // Create JWT client with domain-wide delegation
            const jwtClient = new JWT({
              email: keyData.client_email,
              key: keyData.private_key,
              scopes: [...config.googleDrive.scopes],
              subject: impersonateEmail,
            });

            // Authorize the client
            yield* Effect.tryPromise({
              try: () => jwtClient.authorize(),
              catch: (error) =>
                new GoogleDriveAuthError({
                  message: `Service account authentication failed: ${error}`,
                  status: 401,
                }),
            });

            // Log authentication mode
            console.log(
              `Authenticated as service account, impersonating: ${impersonateEmail}`,
            );

            // Cache the authenticated client
            authCache = jwtClient;

            return jwtClient;
          }),

        getServiceAccountEmail: () =>
          Effect.gen(function* () {
            const keyPath = config.googleDrive.serviceAccountKeyPath;

            const keyFileContent = yield* fs.readFileString(keyPath).pipe(
              Effect.mapError(
                () =>
                  new GoogleDriveAuthError({
                    message: `Cannot read service account key file at: ${keyPath}`,
                    status: 500,
                  }),
              ),
            );

            const keyData = JSON.parse(keyFileContent) as ServiceAccountKey;
            return keyData.client_email;
          }),
      } as const;
    }),
    dependencies: [ConfigService.Default, NodeContext.layer],
  },
) {}
