import { Config, Effect } from "effect";

export class ConfigService extends Effect.Service<ConfigService>()(
  "ConfigService",
  {
    effect: Effect.gen(function* () {
      const serviceAccountKeyPath = yield* Config.string(
        "GOOGLE_SERVICE_ACCOUNT_KEY_PATH",
      ).pipe(Config.withDefault("service-account-key.json"));

      const scopes = yield* Config.array(
        Config.string(),
        "GOOGLE_DRIVE_SCOPES",
      ).pipe(
        Config.withDefault([
          "https://www.googleapis.com/auth/drive.metadata.readonly",
          "https://www.googleapis.com/auth/drive.file",
        ]),
      );

      const config = {
        googleDrive: {
          serviceAccountKeyPath,
          scopes,
        },
      };

      return config;
    }),
  },
) {}
