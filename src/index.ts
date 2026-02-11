import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CognitoTokenProvider } from "./auth.js";
import { loadAppConfig } from "./config.js";
import {
  FetchTripResponseSchema,
  LookupTripDetailsSchema,
  SearchTripsResponseSchema,
  TripInventorySchema,
} from "./models.js";
import type { FetchTripResponse, Trip } from "./models.js";

const appConfig = loadAppConfig();
const tokenProvider = new CognitoTokenProvider(appConfig.auth);
const SANA_API_BASE = appConfig.apiBaseUrl;
const USER_AGENT = appConfig.userAgent;

class SanaApiRequestError extends Error {
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

async function fetchWithBearer(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      "x-sana-token": `Bearer ${token}`,
    },
  });
}

async function makeSanaRequest<T>(url: string): Promise<T> {
  let accessToken: string;
  try {
    accessToken = await tokenProvider.getAccessToken();
  } catch (error) {
    throw new SanaApiRequestError(
      `Unable to retrieve Cognito access token: ${formatError(error)}`
    );
  }

  let response = await fetchWithBearer(url, accessToken);
  if (response.status === 401) {
    try {
      accessToken = await tokenProvider.forceRefresh();
    } catch (error) {
      throw new SanaApiRequestError(
        `Sana authentication failed while refreshing token: ${formatError(
          error
        )}`,
        401
      );
    }

    response = await fetchWithBearer(url, accessToken);
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

// ── Tool implementations ────────────────────────────────────────

async function lookupTripDetails(args: unknown) {
  const input = LookupTripDetailsSchema.parse(args);
  const tripUrl = `${SANA_API_BASE}/trip/${input.tripId}`;

  let trip: FetchTripResponse;
  try {
    trip = await makeSanaRequest<FetchTripResponse>(tripUrl);
  } catch (error) {
    if (error instanceof SanaApiRequestError && error.status === 404) {
      throw new Error(`Trip ${input.tripId} not found`);
    }

    throw error;
  }

  const structuredContent = FetchTripResponseSchema.parse(trip);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

async function searchTrips(args: unknown) {
  const input = TripInventorySchema.parse(args);
  const tripsUrl = `${SANA_API_BASE}/trip`;

  const trips = await makeSanaRequest<Trip[]>(tripsUrl);

  let filtered = trips;
  if (input.tripName) {
    const normalizedFilter = input.tripName.toLowerCase();
    filtered = trips.filter((t) =>
      t.name.toLowerCase().includes(normalizedFilter)
    );
  }

  const structuredContent = SearchTripsResponseSchema.parse({
    trips: filtered,
    totalAvailable: filtered.length,
    returned: filtered.length,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

// ── Create & configure server ───────────────────────────────────

const server = new McpServer({
  name: "medical_trip",
  version: "1.0.0",
  description: "Tools for looking up medical trip details and browsing medical trip inventory including medication packed on trips.",
});

// Register tools with rich metadata (title + description are very important for LLMs)

server.registerTool(
  "lookup_trip_details",
  {
    title: "Lookup Trip Details",
    description:
      "Retrieve full details for a specific trip by its ID. Use this when the user asks about a particular trip, packed items, ormedication.",
    inputSchema: LookupTripDetailsSchema.shape,
    outputSchema: FetchTripResponseSchema.shape,
  },
  lookupTripDetails
);

server.registerTool(
  "search_trips",
  {
    title: "Search Trips",
    description:
      "List trips, optionally filtered by destination. Use this to answer questions like 'what trips are planned?', 'show me trips to Europe'. Use to find trip IDs for the lookup_trip_details tool.",
    inputSchema: TripInventorySchema.shape,
    outputSchema: SearchTripsResponseSchema.shape,
  },
  searchTrips
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sana MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
