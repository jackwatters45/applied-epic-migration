import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { type Config, ConfigService } from "../lib/config.js";
import {
  AuthenticationError,
  NetworkError,
  ParseError,
} from "../lib/errors.js";
import type { AuthToken } from "../lib/types.js";

// Auth service interface
export interface AuthService {
  getAccessToken: () => Effect.Effect<
    AuthToken,
    AuthenticationError | NetworkError | ParseError
  >;
  isTokenExpired: () => boolean;
}

// Create auth service implementation
const createAuthService = (config: Config): AuthService => {
  let tokenCache: { token: AuthToken; expiresAt: number } | null = null;

  const isTokenExpired = (): boolean => {
    if (!tokenCache) return true;
    return Date.now() >= tokenCache.expiresAt;
  };

  return {
    getAccessToken: () =>
      Effect.gen(function* () {
        // Check if we have a valid cached token
        if (tokenCache && !isTokenExpired()) {
          return tokenCache.token;
        }

        if (
          !(
            config.appliedEpic.credentials.clientId &&
            config.appliedEpic.credentials.clientSecret
          )
        ) {
          return yield* Effect.fail(
            new AuthenticationError({
              message: "Client ID and Client Secret are required",
              status: 401,
            }),
          );
        }

        // Prepare the request
        const authHeader = Buffer.from(
          `${config.appliedEpic.credentials.clientId}:${config.appliedEpic.credentials.clientSecret}`,
        ).toString("base64");

        const requestBody = new URLSearchParams({
          grant_type: "client_credentials",
          audience: "api.myappliedproducts.com/epic",
          scope: "epic", // Required for mock API to return data
        });

        console.log("🔐 Auth URL:", config.appliedEpic.authUrl);
        console.log("🔐 Auth request body:", requestBody.toString());

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(config.appliedEpic.authUrl, {
              method: "POST",
              headers: {
                Authorization: `Basic ${authHeader}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: requestBody,
            }),
          catch: (error) =>
            new NetworkError({
              message: `Failed to connect to auth server: ${error}`,
              status: 0,
            }),
        });

        if (!response.ok) {
          const errorData = yield* Effect.tryPromise({
            try: () => response.json() as Promise<{ detail?: string }>,
            catch: () => ({ detail: undefined }),
          }).pipe(Effect.orElseSucceed(() => ({ detail: undefined })));

          return yield* Effect.fail(
            new AuthenticationError({
              message: errorData.detail || "Failed to obtain access token",
              status: response.status,
            }),
          );
        }

        const tokenData: AuthToken = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (error) =>
            new ParseError({
              message: `Failed to parse authentication response: ${error}`,
              status: 0,
            }),
        });

        // Cache the token
        const expiresAt = Date.now() + tokenData.expires_in * 1000 - 60000; // 1 minute buffer
        tokenCache = { token: tokenData, expiresAt };

        return tokenData;
      }),

    isTokenExpired,
  };
};

// Context tag for dependency injection
export const AuthService = Context.GenericTag<AuthService>(
  "@services/AuthService",
);

// Layer for providing the auth service
export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.succeed(
    (() => {
      const configService = ConfigService.getInstance();
      const config = configService.getConfig();
      return createAuthService(config);
    })(),
  ),
);
