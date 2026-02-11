import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  FetchTripResponseSchema,
  LookupTripDetailsSchema,
  SearchTripsResponseSchema,
  TripInventorySchema,
} from "./models";
import type { FetchTripResponse, SearchTripsResponse, Trip } from "./models";

// Helper function for making NWS API requests
const NWS_API_BASE = "https://pvjd48s9rb.execute-api.us-east-1.amazonaws.com/prod/api";
const USER_AGENT = "pill-mcp-app/1.0";
const token = "You thought ;) Need to setup getting auth.";

async function makePILLRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Requested-With': 'XMLHttpRequest',
    'x-sana-token': `Bearer ${token}`
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

// ── Tool implementations ────────────────────────────────────────

async function lookupTripDetails(args: unknown) {
  const input = LookupTripDetailsSchema.parse(args);
  const tripUrl = `${NWS_API_BASE}/trip/${input.tripId}`;

  const trip = await makePILLRequest<FetchTripResponse>(tripUrl)
  if (!trip) {
    throw new Error(`Trip ${input.tripId} not found`);
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
  const tripsUrl = `${NWS_API_BASE}/trip`;

  const trips = await makePILLRequest<Trip[]>(tripsUrl)

  let filtered = trips || [];
  if (input.tripName && trips) {
    filtered = trips.filter(t => t.name.toLowerCase().includes(input.tripName!.toLowerCase()));
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
      "Retrieve full details for a specific trip by its ID. Use this when the user asks about a particular trip, booking status, travelers, or history.",
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
  console.error("PILL MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
