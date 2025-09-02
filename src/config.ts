import type { ApiConfig, AuthCredentials } from "./types.js";

// Configuration service for Applied Epic API
export class ConfigService {
  private static instance: ConfigService;
  private config: ApiConfig;

  private constructor() {
    // Default to mock environment - user should override with production credentials
    this.config = {
      baseUrl: "https://api.mock.myappliedproducts.com",
      authUrl: "https://api.mock.myappliedproducts.com/v1/auth/connect/token",
      credentials: {
        clientId: process.env.APPLIED_EPIC_CLIENT_ID || "",
        clientSecret: process.env.APPLIED_EPIC_CLIENT_SECRET || "",
        baseUrl: "https://api.mock.myappliedproducts.com",
      },
    };
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  getConfig(): ApiConfig {
    return this.config;
  }

  setCredentials(credentials: AuthCredentials): void {
    this.config.credentials = credentials;
  }

  setEnvironment(isProduction: boolean): void {
    if (isProduction) {
      this.config.baseUrl = "https://api.myappliedproducts.com";
      this.config.authUrl =
        "https://api.myappliedproducts.com/v1/auth/connect/token";
      this.config.credentials.baseUrl = "https://api.myappliedproducts.com";
    } else {
      this.config.baseUrl = "https://api.mock.myappliedproducts.com";
      this.config.authUrl =
        "https://api.mock.myappliedproducts.com/v1/auth/connect/token";
      this.config.credentials.baseUrl =
        "https://api.mock.myappliedproducts.com";
    }
  }

  validateCredentials(): boolean {
    return !!(
      this.config.credentials.clientId && this.config.credentials.clientSecret
    );
  }
}
