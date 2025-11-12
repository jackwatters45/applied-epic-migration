import { Config, Effect } from "effect";

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
      ).pipe(
        Config.withDefault([
          "https://www.googleapis.com/auth/drive.metadata.readonly",
          "https://www.googleapis.com/auth/drive.file",
        ]),
      );

      const metadataCsvPath = Config.succeed(
        "data/BORDE05_AttachmentMetaData_Report.xlsx - Results.csv",
      );

      const sharedClientDriveId = Config.succeed("0ADXTdKmRqwv7Uk9PVA");
      const testSharedClientDriveId = Config.succeed("0AOulfXIJNYOzUk9PVA");

      const attachmentsFolderId = Config.succeed(
        "1-T0Lemwm8hxzmgfYPrZTaaYQnmRH1Qh4",
      );

      const config = {
        googleDrive: {
          serviceAccountKeyPath,
          scopes,
        },
        metadataCsvPath,
        testSharedClientDriveId,
        sharedClientDriveId,
        attachmentsFolderId,
      };

      return config;
    }),
  },
) {}
