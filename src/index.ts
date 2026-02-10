import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FetchTripResponse, Trip } from "./models";

// ── Define schemas ──────────────────────────────────────────────

const LookupTripDetailsSchema = z.object({
  tripId: z.number().min(1).describe("Unique trip identifier (e.g. 23)"),
});

const TripInventorySchema = z.object({
  tripName: z.string().optional().describe("Optional filter by destination city or country. Matches the trip's name field."),
});

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

  let result = { ...trip };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
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

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          trips: filtered,
          totalAvailable: filtered.length,
          returned: filtered.length,
        }, null, 2),
      },
    ],
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