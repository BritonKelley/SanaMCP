import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ── Define schemas ──────────────────────────────────────────────

const LookupTripDetailsSchema = z.object({
  tripId: z.string().min(1).describe("Unique trip identifier (e.g. TRP-12345)"),
  includeHistory: z.boolean().optional().default(false).describe("Whether to include past status updates"),
});

const TripInventorySchema = z.object({
  destination: z.string().optional().describe("Optional filter by destination city or code"),
  startDate: z.string().optional().describe("Optional ISO date filter: YYYY-MM-DD"),
  limit: z.number().int().min(1).max(50).optional().default(20).describe("Max number of trips to return"),
});

// ── Fake "database" ─────────────────────────────────────────────

type Trip = {
  id: string;
  destination: string;
  startDate: string;
  status: "planned" | "booked" | "in-progress" | "completed";
  travelers: string[];
  lastUpdated: string;
};

const fakeTrips: Trip[] = [
  {
    id: "TRP-001",
    destination: "Paris",
    startDate: "2026-04-10",
    status: "booked",
    travelers: ["Alice", "Bob"],
    lastUpdated: "2026-02-01T14:30:00Z",
  },
  {
    id: "TRP-002",
    destination: "Tokyo",
    startDate: "2026-05-15",
    status: "planned",
    travelers: ["Charlie"],
    lastUpdated: "2026-02-05T09:15:00Z",
  },
  // ... add more as needed
];

// ── Tool implementations ────────────────────────────────────────

async function lookupTripDetails(args: unknown) {
  const input = LookupTripDetailsSchema.parse(args);

  const trip = fakeTrips.find(t => t.id === input.tripId);
  if (!trip) {
    throw new Error(`Trip ${input.tripId} not found`);
  }

  let result = { ...trip };

  if (input.includeHistory) {
    // Fake history — in reality you'd query a log/audit table
    (result as any).history = [
      { date: "2026-01-20", note: "Trip created" },
      { date: "2026-02-01", note: "Flight booked" },
    ];
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function tripInventory(args: unknown) {
  const input = TripInventorySchema.parse(args);

  let filtered = fakeTrips;

  if (input.destination) {
    filtered = filtered.filter(t =>
      t.destination.toLowerCase().includes(input.destination!.toLowerCase())
    );
  }

  if (input.startDate) {
    filtered = filtered.filter(t => t.startDate >= input.startDate!);
  }

  filtered = filtered.slice(0, input.limit);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          trips: filtered,
          totalAvailable: fakeTrips.length,
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
  "trip_inventory",
  {
    title: "Trip Inventory",
    description:
      "List available/upcoming trips, optionally filtered by destination or date. Use this to answer questions like 'what trips are planned?', 'show me trips to Europe', or 'upcoming trips in May'.",
    inputSchema: TripInventorySchema.shape,
  },
  tripInventory
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