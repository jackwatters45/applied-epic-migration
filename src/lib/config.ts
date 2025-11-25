import { Config, Effect } from "effect";

export enum SharedDriveId {
  PROD = "0ADXTdKmRqwv7Uk9PVA",
  TEST = "0AOulfXIJNYOzUk9PVA",
  TEST_2 = "0ADcheCHr_qkFUk9PVA",
  TEST_3 = "0AN4wFrvCjZ9JUk9PVA",
  TEST_4 = "0ADy0CWHS9dyFUk9PVA",
}

export class ConfigService extends Effect.Service<ConfigService>()(
  "ConfigService",
  {
    effect: Effect.gen(function* () {
      const serviceAccountKeyPath = yield* Config.string(
        "GOOGLE_SERVICE_ACCOUNT_KEY_PATH",
      ).pipe(Config.withDefault("./.private_key.json"));

      const scopes = yield* Config.array(
        Config.string(),
        "GOOGLE_DRIVE_SCOPES",
      ).pipe(Config.withDefault(["https://www.googleapis.com/auth/drive"]));

      const metadataCsvPath = Config.succeed(
        "data/BORDE05_AttachmentMetaData_Report.xlsx - Results.csv",
      );

      const sharedClientDriveId = Config.succeed(SharedDriveId.TEST_4);

      const attachmentsFolderId = Config.succeed(
        "1-T0Lemwm8hxzmgfYPrZTaaYQnmRH1Qh4",
      );

      const limitToFirstFolder = yield* Config.boolean(
        "LIMIT_TO_FIRST_FOLDER",
      ).pipe(Config.withDefault(false));

      const skipDuplicateMerging = yield* Config.boolean(
        "SKIP_DUPLICATE_MERGING",
      ).pipe(Config.withDefault(false));

      const config = {
        googleDrive: {
          serviceAccountKeyPath,
          scopes,
        },
        metadataCsvPath,
        sharedClientDriveId,
        attachmentsFolderId,
        limitToFirstFolder,
        skipDuplicateMerging,
      };

      return config;
    }),
  },
) {}
