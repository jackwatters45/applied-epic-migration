import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import { authenticate } from "@google-cloud/local-auth";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { ConfigService } from "../lib/config.js";

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
    OAuth2Client,
    GoogleDriveAuthError
  >;
}

// Helper functions for credentials management
const saveCredentials = (
  client: OAuth2Client,
): Effect.Effect<void, GoogleDriveAuthError> =>
  Effect.gen(function* () {
    const credentialsPath = path.join(process.cwd(), "credentials.json");
    const tokenPath = path.join(process.cwd(), "token.json");

    // Read credentials file
    const credentialsContent = yield* Effect.tryPromise({
      try: () => fs.readFile(credentialsPath, "utf8"),
      catch: (error) =>
        new GoogleDriveAuthError(`Failed to read credentials file: ${error}`),
    });

    const keys = JSON.parse(credentialsContent);
    const key = keys.installed || keys.web;

    const payload = JSON.stringify({
      type: "authorized_user",
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
    });

    // Save token
    yield* Effect.tryPromise({
      try: () => fs.writeFile(tokenPath, payload),
      catch: (error) =>
        new GoogleDriveAuthError(`Failed to save token: ${error}`),
    });
  });

const loadSavedCredentialsIfExist = (): Effect.Effect<
  OAuth2Client | null,
  GoogleDriveAuthError
> =>
  Effect.gen(function* () {
    const tokenPath = path.join(process.cwd(), "token.json");

    const content = yield* Effect.tryPromise({
      try: () => fs.readFile(tokenPath, "utf8"),
      catch: () => null, // File doesn't exist, return null
    }).pipe(Effect.orElseSucceed(() => null));

    if (!content) {
      return null;
    }

    const credentials = JSON.parse(content);
    const client = google.auth.fromJSON(credentials) as OAuth2Client;

    return client;
  });

// Create the auth service implementation
const createGoogleDriveAuthService = (
  configService: ConfigService,
): GoogleDriveAuthService => {
  let clientCache: OAuth2Client | null = null;

  return {
    getAuthenticatedClient: () =>
      Effect.gen(function* () {
        // Check if we have a cached client
        if (clientCache) {
          return clientCache;
        }

        const config = configService.getConfig();

        // Try to load saved credentials first
        const savedClient = yield* loadSavedCredentialsIfExist();
        if (savedClient) {
          clientCache = savedClient;
          return savedClient;
        }

        // If no saved credentials, authenticate
        const client = yield* Effect.tryPromise({
          try: async () => {
            const auth = await authenticate({
              scopes: [...config.googleDrive.scopes],
              keyfilePath: path.join(process.cwd(), "credentials.json"),
            });
            return auth;
          },
          catch: (error) =>
            new GoogleDriveAuthError(`Authentication failed: ${error}`),
        });

        // Save credentials for future use
        if (client.credentials) {
          yield* saveCredentials(client);
        }

        clientCache = client;
        return client;
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
