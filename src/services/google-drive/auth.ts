import { FileSystem } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Schema } from "effect";
import { GoogleAuth } from "google-auth-library";
import { ConfigService } from "../../lib/config.js";

// Error types for Google Drive authentication
export class GoogleDriveAuthError extends Schema.TaggedError<GoogleDriveAuthError>()(
  "GoogleDriveAuthError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

// Google Drive Auth Service
export class GoogleDriveAuthService extends Effect.Service<GoogleDriveAuthService>()(
  "GoogleDriveAuthService",
  {
    effect: Effect.gen(function* () {
      const config = yield* ConfigService;
      const fs = yield* FileSystem.FileSystem;
      let authCache: GoogleAuth | null = null;

      const createGoogleAuth = () => {
        return new GoogleAuth({
          keyFile: config.googleDrive.serviceAccountKeyPath,
          scopes: [...config.googleDrive.scopes],
        });
      };

      return {
        getAuthenticatedClient: () =>
          Effect.gen(function* () {
            // Check if we have a cached auth client
            if (authCache) {
              return authCache;
            }

            // Validate that the service account key file exists and is readable
            const keyPath = config.googleDrive.serviceAccountKeyPath;

            yield* fs.readFileString(keyPath).pipe(
              Effect.mapError(
                () =>
                  new GoogleDriveAuthError({
                    message: `Cannot read service account key file at: ${keyPath}`,
                    status: 500,
                  }),
              ),
            );

            // Create Google Auth instance
            const googleAuth = createGoogleAuth();

            // Test authentication by getting credentials
            yield* Effect.tryPromise({
              try: () => googleAuth.getCredentials(),
              catch: (error) =>
                new GoogleDriveAuthError({
                  message: `Service account authentication failed: ${error}`,
                  status: 401,
                }),
            });

            // Cache the authenticated client
            authCache = googleAuth;

            return googleAuth;
          }),

        getServiceAccountEmail: () =>
          Effect.gen(function* () {
            const credentials = yield* Effect.tryPromise({
              try: () => {
                const auth = createGoogleAuth();
                return auth.getCredentials();
              },
              catch: (error) =>
                new GoogleDriveAuthError({
                  message: `Failed to get service account email: ${error}`,
                  status: 401,
                }),
            });

            return credentials.client_email;
          }),
      } as const;
    }),
    dependencies: [ConfigService.Default, NodeContext.layer],
  },
) {}
