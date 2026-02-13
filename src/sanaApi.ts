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

  private async fetchWithBearer(
    url: string,
    token: string,
    init?: RequestInit
  ): Promise<Response> {
    return fetch(url, {
      ...init,
      headers: {
        "User-Agent": this.userAgent,
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest",
        "x-sana-token": `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
  }

  private async parseResponseBody<T>(response: Response): Promise<T | null> {
    if (response.status === 204 || response.status === 205) {
      return null;
    }

    const responseText = await response.text();
    if (!responseText.trim()) {
      return null;
    }

    try {
      return JSON.parse(responseText) as T;
    } catch {
      throw new SanaApiRequestError(
        `Sana API returned non-JSON response (${response.status})`,
        response.status,
        responseText
      );
    }
  }

  private async requestWithMethod<T>(
    method: "GET" | "PUT",
    path: string,
    body?: unknown
  ): Promise<T | null> {
    const requestUrl = `${this.apiBaseUrl}${path}`;

    let accessToken: string;
    try {
      accessToken = await this.tokenProvider.getAccessToken();
    } catch (error) {
      throw new SanaApiRequestError(
        `Unable to retrieve Cognito access token: ${formatError(error)}`
      );
    }

    const requestInit: RequestInit = {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };

    let response = await this.fetchWithBearer(requestUrl, accessToken, requestInit);
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

      response = await this.fetchWithBearer(requestUrl, accessToken, requestInit);
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

    return this.parseResponseBody<T>(response);
  }

  async request<T>(path: string): Promise<T> {
    const response = await this.requestWithMethod<T>("GET", path);
    if (response === null) {
      throw new SanaApiRequestError(
        "Sana API returned an empty response for a GET request."
      );
    }

    return response;
  }

  async put<TResponse, TBody>(path: string, body: TBody): Promise<TResponse | null> {
    return this.requestWithMethod<TResponse>("PUT", path, body);
  }
}
