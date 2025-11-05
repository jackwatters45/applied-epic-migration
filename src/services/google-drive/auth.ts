import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
      let authCache: GoogleAuth | null = null;

      const createGoogleAuth = () => {
        return new GoogleAuth({
          keyFile: config.googleDrive.serviceAccountKeyPath,
          scopes: [...config.googleDrive.scopes], // Convert readonly array to mutable
        });
      };

      return {
        getAuthenticatedClient: () =>
          Effect.gen(function* () {
            // Validate service account key path is configured
            if (!config.googleDrive.serviceAccountKeyPath) {
              return yield* Effect.fail(
                new GoogleDriveAuthError({
                  message: "Google Drive service account key path is required",
                  status: 500,
                }),
              );
            }

            // Check if we have a cached auth client
            if (authCache) {
              return authCache;
            }

            // Validate that the service account key file exists and is readable
            const keyPath = resolve(config.googleDrive.serviceAccountKeyPath);

            yield* Effect.tryPromise({
              try: () => Promise.resolve(readFileSync(keyPath, "utf8")),
              catch: () =>
                new GoogleDriveAuthError({
                  message: `Cannot read service account key file at: ${keyPath}`,
                  status: 500,
                }),
            });

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
    dependencies: [ConfigService.Default],
  },
) {}
