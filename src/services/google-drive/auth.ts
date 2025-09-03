import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { GoogleAuth } from "google-auth-library";
import { ConfigService } from "../../lib/config.js";

// Error types for Google Drive authentication
export class GoogleDriveAuthError {
  readonly _tag = "GoogleDriveAuthError";
  constructor(
    readonly message: string,
    readonly status?: number,
  ) {}
}

// Google Drive authentication service interface
export interface GoogleDriveAuthService {
  getAuthenticatedClient: () => Effect.Effect<
    GoogleAuth,
    GoogleDriveAuthError,
    never
  >;
  getServiceAccountEmail: () => Effect.Effect<
    string,
    GoogleDriveAuthError,
    never
  >;
}

// Create the auth service implementation using Service Account
const createGoogleDriveAuthService = (
  configService: ConfigService,
): GoogleDriveAuthService => {
  let authCache: GoogleAuth | null = null;

  const createGoogleAuth = (config: ReturnType<ConfigService["getConfig"]>) => {
    return new GoogleAuth({
      keyFile: config.googleDrive.serviceAccountKeyPath,
      scopes: [...config.googleDrive.scopes], // Convert readonly array to mutable
    });
  };

  return {
    getAuthenticatedClient: () =>
      Effect.gen(function* () {
        const config = configService.getConfig();

        // Validate service account key path is configured
        if (!config.googleDrive.serviceAccountKeyPath) {
          return yield* Effect.fail(
            new GoogleDriveAuthError(
              "Google Drive service account key path is required",
              500,
            ),
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
            new GoogleDriveAuthError(
              `Cannot read service account key file at: ${keyPath}`,
              500,
            ),
        });

        // Create Google Auth instance
        const googleAuth = createGoogleAuth(config);

        // Test authentication by getting credentials
        yield* Effect.tryPromise({
          try: () => googleAuth.getCredentials(),
          catch: (error) =>
            new GoogleDriveAuthError(
              `Service account authentication failed: ${error}`,
              401,
            ),
        });

        // Cache the authenticated client
        authCache = googleAuth;

        return googleAuth;
      }),

    getServiceAccountEmail: () =>
      Effect.gen(function* () {
        const googleAuth = yield* Effect.tryPromise({
          try: async () => {
            const config = configService.getConfig();
            const auth = createGoogleAuth(config);
            const credentials = await auth.getCredentials();

            if (!credentials.client_email) {
              throw new Error(
                "Service account key file does not contain client_email",
              );
            }

            return credentials.client_email;
          },
          catch: (error) =>
            new GoogleDriveAuthError(
              `Failed to get service account email: ${error}`,
              401,
            ),
        });

        return googleAuth;
      }),
  };
};

// Context tag for dependency injection
export const GoogleDriveAuthService =
  Context.GenericTag<GoogleDriveAuthService>(
    "@services/GoogleDriveAuthService",
  );

// Layer for providing the authentication service
export const GoogleDriveAuthServiceLive = Layer.effect(
  GoogleDriveAuthService,
  Effect.succeed(createGoogleDriveAuthService(ConfigService.getInstance())),
);
