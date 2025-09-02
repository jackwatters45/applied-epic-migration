import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ConfigService } from "./config.js";
import { AuthenticationError, NetworkError, ParseError } from "./lib/errors.js";
import type { AuthToken } from "./lib/types.js";

// Auth service interface
export interface AuthService {
  getAccessToken: () => Effect.Effect<
    AuthToken,
    AuthenticationError | NetworkError | ParseError
  >;
  isTokenExpired: () => boolean;
}

// Auth service implementation
class AuthServiceImpl implements AuthService {
  private tokenCache: { token: AuthToken; expiresAt: number } | null = null;

  constructor(private configService: ConfigService) {}

  getAccessToken(): Effect.Effect<
    AuthToken,
    AuthenticationError | NetworkError | ParseError
  > {
    const self = this;
    return Effect.gen(function* () {
      // Check if we have a valid cached token
      if (self.tokenCache && !self.isTokenExpired()) {
        return self.tokenCache.token;
      }

      const config = self.configService.getConfig();

      if (!self.configService.validateCredentials()) {
        return yield* Effect.fail(
          new AuthenticationError({
            message: "Client ID and Client Secret are required",
            status: 401,
          }),
        );
      }

      // Prepare the request
      const authHeader = Buffer.from(
        `${config.credentials.clientId}:${config.credentials.clientSecret}`,
      ).toString("base64");

      const requestBody = new URLSearchParams({
        grant_type: "client_credentials",
        audience: "api.myappliedproducts.com/epic",
      });

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(config.authUrl, {
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
      self.tokenCache = { token: tokenData, expiresAt };

      return tokenData;
    });
  }

  isTokenExpired(): boolean {
    if (!this.tokenCache) return true;
    return Date.now() >= this.tokenCache.expiresAt;
  }
}

// Context tag for dependency injection
export const AuthService = Context.GenericTag<AuthService>(
  "@services/AuthService",
);

// Layer for providing the auth service
export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.succeed(new AuthServiceImpl(ConfigService.getInstance())),
);
