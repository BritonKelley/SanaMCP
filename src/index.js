"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const zod_1 = require("zod");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/transports/streamableHttp.js");
// ── Define schemas ──────────────────────────────────────────────
const LookupTripDetailsSchema = zod_1.z.object({
    tripId: zod_1.z.string().min(1).describe("Unique trip identifier (e.g. TRP-12345)"),
    includeHistory: zod_1.z.boolean().optional().default(false).describe("Whether to include past status updates"),
});
const TripInventorySchema = zod_1.z.object({
    destination: zod_1.z.string().optional().describe("Optional filter by destination city or code"),
    startDate: zod_1.z.string().optional().describe("Optional ISO date filter: YYYY-MM-DD"),
    limit: zod_1.z.number().int().min(1).max(50).optional().default(20).describe("Max number of trips to return"),
});
const fakeTrips = [
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
async function lookupTripDetails(args) {
    const input = LookupTripDetailsSchema.parse(args);
    const trip = fakeTrips.find(t => t.id === input.tripId);
    if (!trip) {
        throw new Error(`Trip ${input.tripId} not found`);
    }
    let result = { ...trip };
    if (input.includeHistory) {
        // Fake history — in reality you'd query a log/audit table
        result.history = [
            { date: "2026-01-20", note: "Trip created" },
            { date: "2026-02-01", note: "Flight booked" },
        ];
    }
    return result;
}
async function tripInventory(args) {
    const input = TripInventorySchema.parse(args);
    let filtered = fakeTrips;
    if (input.destination) {
        filtered = filtered.filter(t => t.destination.toLowerCase().includes(input.destination.toLowerCase()));
    }
    if (input.startDate) {
        filtered = filtered.filter(t => t.startDate >= input.startDate);
    }
    filtered = filtered.slice(0, input.limit);
    return {
        trips: filtered,
        totalAvailable: fakeTrips.length,
        returned: filtered.length,
    };
}
// ── Create & configure server ───────────────────────────────────
const server = new mcp_js_1.McpServer({
    name: "Trip Management MCP Server",
    version: "1.0.0",
    description: "Tools for looking up trip details and browsing trip inventory",
});
// Register tools with rich metadata (title + description are very important for LLMs)
server.registerTool("lookup_trip_details", {
    title: "Lookup Trip Details",
    description: "Retrieve full details for a specific trip by its ID. Use this when the user asks about a particular trip, booking status, travelers, or history.",
    inputSchema: LookupTripDetailsSchema.shape,
    execute: lookupTripDetails,
});
server.registerTool("trip_inventory", {
    title: "Trip Inventory",
    description: "List available/upcoming trips, optionally filtered by destination or date. Use this to answer questions like 'what trips are planned?', 'show me trips to Europe', or 'upcoming trips in May'.",
    inputSchema: TripInventorySchema.shape,
    execute: tripInventory,
});
// ── Export handler for Streamable HTTP (most common) ────────────
exports.handler = (0, streamableHttp_js_1.createStreamableHTTPHandler)(server);
// For local dev you can also run a simple HTTP server:
if (import.meta.main || process.env.NODE_ENV !== "production") {
    import("node:http").then(async ({ createServer }) => {
        const PORT = 8787;
        createServer((req, res) => {
            (0, exports.handler)(req, res).catch(err => {
                console.error(err);
                res.statusCode = 500;
                res.end("Internal Server Error");
            });
        }).listen(PORT, () => {
            console.log(`🚀 MCP server running on http://localhost:${PORT}`);
            console.log("Test with MCP inspector or compatible client (Claude, etc.)");
        });
    });
}
//# sourceMappingURL=index.js.map