import { z } from "zod";
import type { AppConfig } from "./config.js";

const CognitoTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
});

const EXPIRY_SKEW_MS = 60_000;

export class CognitoTokenProvider {
  private accessToken: string | null = null;
  private expiresAtMs = 0;
  private refreshInFlight: Promise<string> | null = null;

  constructor(private readonly authConfig: AppConfig["auth"]) {}

  async getAccessToken(): Promise<string> {
    if (this.hasUsableToken()) {
      return this.accessToken as string;
    }

    return this.refresh(false);
  }

  async forceRefresh(): Promise<string> {
    return this.refresh(true);
  }

  private hasUsableToken(): boolean {
    return (
      this.accessToken !== null &&
      Date.now() + EXPIRY_SKEW_MS < this.expiresAtMs
    );
  }

  private async refresh(force: boolean): Promise<string> {
    if (!force && this.hasUsableToken()) {
      return this.accessToken as string;
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.fetchAccessToken().finally(() => {
      this.refreshInFlight = null;
    });

    return this.refreshInFlight;
  }

  private async fetchAccessToken(): Promise<string> {
    const { tokenUrl, clientId, clientSecret, scope } = this.authConfig;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      grant_type: "client_credentials",
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `Failed to retrieve Cognito token (${response.status}): ${responseBody}`
      );
    }

    const rawToken = (await response.json()) as unknown;
    const tokenPayload = CognitoTokenResponseSchema.parse(rawToken);

    this.accessToken = tokenPayload.access_token;
    this.expiresAtMs =
      Date.now() + (tokenPayload.expires_in ?? 3600) * 1000;

    return this.accessToken;
  }
}
