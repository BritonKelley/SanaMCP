import type { CognitoTokenProvider } from "./auth.js";

export class SanaApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string
  ) {
    super(message);
    this.name = "SanaApiRequestError";
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class SanaApiClient {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly userAgent: string,
    private readonly tokenProvider: Pick<
      CognitoTokenProvider,
      "getAccessToken" | "forceRefresh"
    >
  ) {}

  private async fetchWithBearer(url: string, token: string): Promise<Response> {
    return fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "x-sana-token": `Bearer ${token}`,
      },
    });
  }

  async request<T>(path: string): Promise<T> {
    const requestUrl = `${this.apiBaseUrl}${path}`;

    let accessToken: string;
    try {
      accessToken = await this.tokenProvider.getAccessToken();
    } catch (error) {
      throw new SanaApiRequestError(
        `Unable to retrieve Cognito access token: ${formatError(error)}`
      );
    }

    let response = await this.fetchWithBearer(requestUrl, accessToken);
    if (response.status === 401) {
      try {
        accessToken = await this.tokenProvider.forceRefresh();
      } catch (error) {
        throw new SanaApiRequestError(
          `Sana authentication failed while refreshing token: ${formatError(
            error
          )}`,
          401
        );
      }

      response = await this.fetchWithBearer(requestUrl, accessToken);
    }

    if (!response.ok) {
      const responseBody = await response.text();
      const bodySnippet = responseBody.slice(0, 500);
      throw new SanaApiRequestError(
        `Sana API request failed (${response.status}): ${bodySnippet}`,
        response.status,
        responseBody
      );
    }

    return (await response.json()) as T;
  }
}
