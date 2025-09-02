import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AuthService } from "./auth.js";
import { ConfigService } from "./config.js";
import {
  type AuthenticationError,
  NetworkError,
  ParseError,
} from "./errors.js";
import type {
  Attachment,
  AttachmentsResponse,
  ListAttachmentsParams,
} from "./types.js";

// Attachments service interface
export interface AttachmentsService {
  listAttachments: (
    params?: ListAttachmentsParams,
  ) => Effect.Effect<
    AttachmentsResponse,
    NetworkError | ParseError | AuthenticationError
  >;
  getAttachment: (
    id: string,
  ) => Effect.Effect<
    Attachment,
    NetworkError | ParseError | AuthenticationError
  >;
}

// Attachments service implementation
class AttachmentsServiceImpl implements AttachmentsService {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  listAttachments(
    params?: ListAttachmentsParams,
  ): Effect.Effect<
    AttachmentsResponse,
    NetworkError | ParseError | AuthenticationError
  > {
    const self = this;
    return Effect.gen(function* () {
      const token = yield* self.authService.getAccessToken();
      const config = self.configService.getConfig();

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, value.toString());
          }
        });
      }

      const url = `${config.baseUrl}/epic/attachment/v2/attachments${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token.access_token}`,
              Accept: "application/json",
            },
          }),
        catch: (error) =>
          new NetworkError({
            message: `Failed to fetch attachments: ${error}`,
            status: 0,
          }),
      });

      if (!response.ok) {
        const errorData = yield* Effect.tryPromise({
          try: () => response.json() as Promise<{ detail?: string }>,
          catch: () => ({ detail: undefined }),
        }).pipe(Effect.orElseSucceed(() => ({ detail: undefined })));

        return yield* Effect.fail(
          new NetworkError({
            message:
              errorData.detail ||
              `Failed to list attachments: ${response.statusText}`,
            status: response.status,
          }),
        );
      }

      const data: AttachmentsResponse = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: (error) =>
          new ParseError({
            message: `Failed to parse attachments response: ${error}`,
            status: 0,
          }),
      });

      return data;
    });
  }

  getAttachment(
    id: string,
  ): Effect.Effect<
    Attachment,
    NetworkError | ParseError | AuthenticationError
  > {
    const self = this;
    return Effect.gen(function* () {
      const token = yield* self.authService.getAccessToken();
      const config = self.configService.getConfig();

      const url = `${config.baseUrl}/epic/attachment/v2/attachments/${id}`;

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token.access_token}`,
              Accept: "application/json",
            },
          }),
        catch: (error) =>
          new NetworkError({
            message: `Failed to fetch attachment ${id}: ${error}`,
            status: 0,
          }),
      });

      if (!response.ok) {
        const errorData = yield* Effect.tryPromise({
          try: () => response.json() as Promise<{ detail?: string }>,
          catch: () => ({ detail: undefined }),
        }).pipe(Effect.orElseSucceed(() => ({ detail: undefined })));

        return yield* Effect.fail(
          new NetworkError({
            message:
              errorData.detail ||
              `Failed to get attachment ${id}: ${response.statusText}`,
            status: response.status,
          }),
        );
      }

      const data: Attachment = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: (error) =>
          new ParseError({
            message: `Failed to parse attachment response: ${error}`,
            status: 0,
          }),
      });

      return data;
    });
  }
}

// Context tag for dependency injection
export const AttachmentsService = Context.GenericTag<AttachmentsService>(
  "@services/AttachmentsService",
);

// Layer for providing the attachments service
export const AttachmentsServiceLive = Layer.effect(
  AttachmentsService,
  Effect.gen(function* () {
    const authService = yield* AuthService;
    const configService = ConfigService.getInstance();
    return new AttachmentsServiceImpl(authService, configService);
  }),
);
