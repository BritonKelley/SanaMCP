#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CognitoTokenProvider } from "./auth.js";
import { loadAppConfig } from "./config.js";
import { SanaApiClient } from "./sanaApi.js";
import { createAssessCustomsClearanceRiskHandler } from "./tools/assessCustomsClearanceRisk.js";
import { createLookupTripDetailsHandler } from "./tools/lookupTripDetails.js";
import { createSearchTripsHandler } from "./tools/searchTrips.js";
import {
  AssessCustomsClearanceRiskResponseSchema,
  AssessCustomsClearanceRiskSchema,
  FetchTripResponseSchema,
  LookupTripDetailsSchema,
  SearchTripsResponseSchema,
  TripInventorySchema,
} from "./models.js";

const appConfig = loadAppConfig();
const tokenProvider = new CognitoTokenProvider(appConfig.auth);
const sanaApiClient = new SanaApiClient(
  appConfig.apiBaseUrl,
  appConfig.userAgent,
  tokenProvider
);
const assessCustomsClearanceRisk =
  createAssessCustomsClearanceRiskHandler(sanaApiClient);
const lookupTripDetails = createLookupTripDetailsHandler(sanaApiClient);
const searchTrips = createSearchTripsHandler(sanaApiClient);

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
      "Retrieve full details for a specific trip by its ID. Use this when the user asks about a particular trip, packed items, or medication.",
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

server.registerTool(
  "assess_customs_clearance_risk",
  {
    title: "Assess Customs Clearance Risk",
    description:
      "Assess whether a PACKING or PACKED trip that has not yet started can clear customs based on 6-month medication shelf-life requirements.",
    inputSchema: AssessCustomsClearanceRiskSchema.shape,
    outputSchema: AssessCustomsClearanceRiskResponseSchema.shape,
  },
  assessCustomsClearanceRisk
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
