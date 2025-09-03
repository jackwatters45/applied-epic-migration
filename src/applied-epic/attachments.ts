import { Schema } from "effect";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ConfigService } from "../lib/config.js";
import type { AuthenticationError } from "../lib/errors.js";
import { NetworkError, ParseError } from "../lib/errors.js";
import type {
  Attachment,
  AttachmentsResponse,
  ListAttachmentsParams,
} from "../lib/types.js";
import { AuthService } from "./auth.js";

// Schema for attachment query parameters
export const AttachmentQueryParams = Schema.Struct({
  // Date filters
  attachedOn_before: Schema.optional(Schema.String),
  attachedOn_after: Schema.optional(Schema.String),
  editedOn_before: Schema.optional(Schema.String),
  editedOn_after: Schema.optional(Schema.String),
  inactiveOn_before: Schema.optional(Schema.String),
  inactiveOn_after: Schema.optional(Schema.String),

  // Status filters
  active_status: Schema.optional(Schema.String),
  fileStatus: Schema.optional(Schema.String),
  clientAccessible: Schema.optional(Schema.Boolean),
  systemGenerated: Schema.optional(Schema.Boolean),
  has_client_accessed: Schema.optional(Schema.Boolean),

  // Entity filters
  account: Schema.optional(Schema.String),
  policy: Schema.optional(Schema.String),
  claim: Schema.optional(Schema.String),
  opportunity: Schema.optional(Schema.String),
  activity: Schema.optional(Schema.String),
  service: Schema.optional(Schema.String),
  certificate: Schema.optional(Schema.String),
  line: Schema.optional(Schema.String),
  quote: Schema.optional(Schema.String),
  disbursement: Schema.optional(Schema.String),
  cancellation: Schema.optional(Schema.String),
  reconciliation: Schema.optional(Schema.String),
  evidence: Schema.optional(Schema.String),
  governmentReconciliation: Schema.optional(Schema.String),
  carrierSubmission: Schema.optional(Schema.String),
  marketingSubmission: Schema.optional(Schema.String),

  // Organization filters
  organization: Schema.optional(Schema.String),
  folder: Schema.optional(Schema.String),
  include_subfolders: Schema.optional(Schema.Boolean),

  // Text filters
  description: Schema.optional(Schema.String),
  description_contains: Schema.optional(Schema.String),

  // Access filters
  accountType: Schema.optional(Schema.String),
  accessible_by_employee_code: Schema.optional(Schema.String),

  // Pagination
  limit: Schema.optional(Schema.Number),
  offset: Schema.optional(Schema.Number),

  // Other
  embed: Schema.optional(Schema.String),
});

export type AttachmentQueryParams = Schema.Schema.Type<
  typeof AttachmentQueryParams
>;

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

// Create attachments service implementation
const createAttachmentsService = (
  authService: AuthService,
  configService: ConfigService,
): AttachmentsService => ({
  listAttachments: (params?: AttachmentQueryParams) =>
    Effect.gen(function* () {
      const token = yield* authService.getAccessToken();
      const config = configService.getConfig();

      // Validate and build query parameters
      const queryParams = new URLSearchParams();
      if (params) {
        // Parse params through schema for validation
        const validatedParams = yield* Schema.decodeUnknown(
          AttachmentQueryParams,
        )(params).pipe(
          Effect.mapError(
            (error) =>
              new ParseError({
                message: `Invalid query parameters: ${error.message}`,
                status: 0,
              }),
          ),
        );

        Object.entries(validatedParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, value.toString());
          }
        });
      }

      const url = `${config.appliedEpic.baseUrl}/epic/attachment/v2/attachments${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

      const headers = {
        Authorization: `Bearer ${token.access_token}`,
        Accept: "application/json",
        "Accept-Language": "en-US",
      };

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            method: "GET",
            headers,
          }),
        catch: (error) =>
          new NetworkError({
            message: `Failed to fetch attachments: ${error}`,
            status: 0,
          }),
      });

      if (!response.ok) {
        const errorText = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: () => "",
        }).pipe(Effect.orElseSucceed(() => ""));

        console.error("❌ API Error Response:");
        console.error("   Status:", response.status, response.statusText);
        console.error("   Body:", errorText);

        let errorMessage = `Failed to list attachments: ${response.statusText}`;

        // Try to parse JSON error
        if (errorText) {
          try {
            const parsed = JSON.parse(errorText);
            if (parsed.detail) {
              errorMessage = parsed.detail;
            }
          } catch {
            // If not JSON, use the text as-is
            errorMessage = errorText || errorMessage;
          }
        }

        return yield* Effect.fail(
          new NetworkError({
            message: errorMessage,
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
    }),

  getAttachment: (id: string) =>
    Effect.gen(function* () {
      const token = yield* authService.getAccessToken();
      const config = configService.getConfig();

      const url = `${config.appliedEpic.baseUrl}/epic/attachment/v2/attachments/${id}`;

      const headers = {
        Authorization: `Bearer ${token.access_token}`,
        Accept: "application/json",
        "Accept-Language": "en-US",
      };

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(url, {
            method: "GET",
            headers,
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
    }),
});

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
    return createAttachmentsService(authService, configService);
  }),
);
