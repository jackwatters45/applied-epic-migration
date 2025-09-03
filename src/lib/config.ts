import * as dotenv from "dotenv";

// Load .env file
dotenv.config();

// Configuration for all services
export interface Config {
  readonly appliedEpic: {
    readonly baseUrl: string;
    readonly authUrl: string;
    readonly credentials: {
      readonly clientId: string;
      readonly clientSecret: string;
    };
  };
  readonly googleDrive: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly scopes: readonly string[];
  };
}

export class ConfigService {
  private static instance: ConfigService;
  private config: Config;

  private constructor() {
    // Determine environment
    const environment = process.env.APPLIED_EPIC_ENV || "mock";

    // Set URLs based on environment
    let baseUrl: string;
    switch (environment) {
      case "production":
        baseUrl = "https://api.myappliedproducts.com";
        break;
      default:
        baseUrl = "https://api.mock.myappliedproducts.com";
        break;
    }

    this.config = {
      appliedEpic: {
        baseUrl,
        authUrl: `${baseUrl}/v1/auth/connect/token`,
        credentials: {
          clientId: process.env.APPLIED_EPIC_CLIENT_ID || "",
          clientSecret: process.env.APPLIED_EPIC_CLIENT_SECRET || "",
        },
      },
      googleDrive: {
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        scopes: [
          "https://www.googleapis.com/auth/drive.metadata.readonly",
          "https://www.googleapis.com/auth/drive.file",
        ],
      },
    };
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  getConfig(): Config {
    return this.config;
  }

  validateCredentials(): boolean {
    return !!(
      this.config.appliedEpic.credentials.clientId &&
      this.config.appliedEpic.credentials.clientSecret
    );
  }
}
