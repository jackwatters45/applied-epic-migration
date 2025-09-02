// Simple configuration for Applied Epic API
export interface ApiConfig {
  readonly baseUrl: string;
  readonly authUrl: string;
  readonly credentials: {
    readonly clientId: string;
    readonly clientSecret: string;
  };
}

export class ConfigService {
  private static instance: ConfigService;
  private config: ApiConfig;

  private constructor() {
    // Determine environment
    const environment = process.env.APPLIED_EPIC_ENV || "mock";
    const isProduction = environment === "production";

    // Set URLs based on environment
    const baseUrl = isProduction
      ? "https://api.myappliedproducts.com"
      : "https://api.mock.myappliedproducts.com";

    this.config = {
      baseUrl,
      authUrl: `${baseUrl}/v1/auth/connect/token`,
      credentials: {
        clientId: process.env.APPLIED_EPIC_CLIENT_ID || "",
        clientSecret: process.env.APPLIED_EPIC_CLIENT_SECRET || "",
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

  validateCredentials(): boolean {
    return !!(
      this.config.credentials.clientId && this.config.credentials.clientSecret
    );
  }
}
