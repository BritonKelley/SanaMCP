#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CognitoTokenProvider } from "./auth.js";
import { loadAppConfig } from "./config.js";
import { SanaApiClient } from "./sanaApi.js";
import { createAssessCustomsClearanceRiskHandler } from "./tools/assessCustomsClearanceRisk.js";
import { createEvaluateItemDataQualityHandler } from "./tools/evaluateItemDataQuality.js";
import { createFindExpiredInventoryHandler } from "./tools/findExpiredInventory.js";
import { createLookupTripDetailsHandler } from "./tools/lookupTripDetails.js";
import { createSearchItemInventoryHandler } from "./tools/searchItemInventory.js";
import { createSearchItemsHandler } from "./tools/searchItems.js";
import { createSearchTripsHandler } from "./tools/searchTrips.js";
import { createUpdateItemHandler } from "./tools/updateItem.js";
import {
  AssessCustomsClearanceRiskResponseSchema,
  AssessCustomsClearanceRiskSchema,
  EvaluateItemDataQualityInputSchema,
  EvaluateItemDataQualityResponseSchema,
  FetchTripResponseSchema,
  FindExpiredInventoryInputSchema,
  FindExpiredInventoryResponseSchema,
  ItemInventoryListInputSchema,
  ItemInventoryListResponseSchema,
  ItemListInputSchema,
  ItemListResponseSchema,
  LookupTripDetailsSchema,
  SearchTripsResponseSchema,
  TripInventorySchema,
  UpdateItemInputSchema,
  UpdateItemResponseSchema,
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
const evaluateItemDataQuality =
  createEvaluateItemDataQualityHandler(sanaApiClient);
const findExpiredInventory = createFindExpiredInventoryHandler(sanaApiClient);
const lookupTripDetails = createLookupTripDetailsHandler(sanaApiClient);
const searchItemInventory = createSearchItemInventoryHandler(sanaApiClient);
const searchItems = createSearchItemsHandler(sanaApiClient);
const searchTrips = createSearchTripsHandler(sanaApiClient);
const updateItem = createUpdateItemHandler(sanaApiClient);

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
      "List trips, optionally filtered by destination and/or status (for example PACKED). Use this to answer questions like 'what trips are planned?' or to find trip IDs for lookup_trip_details.",
    inputSchema: TripInventorySchema.shape,
    outputSchema: SearchTripsResponseSchema.shape,
  },
  searchTrips
);

server.registerTool(
  "search_items",
  {
    title: "Search Items",
    description:
      "Search medication item master records by page, page size, and optional filter text.",
    inputSchema: ItemListInputSchema.shape,
    outputSchema: ItemListResponseSchema.shape,
  },
  searchItems
);

server.registerTool(
  "search_item_inventory",
  {
    title: "Search Item Inventory",
    description:
      "Search lot-level item inventory records by page, page size, and optional filter text (returns only rows with quantity >= 1), or fetch one record directly by inventoryId.",
    inputSchema: ItemInventoryListInputSchema.shape,
    outputSchema: ItemInventoryListResponseSchema.shape,
  },
  searchItemInventory
);

server.registerTool(
  "find_expired_inventory",
  {
    title: "Find Expired Inventory",
    description:
      "Scan item inventory rows and return expired entries that still have positive on-hand quantity as of today (or an optional asOfDate).",
    inputSchema: FindExpiredInventoryInputSchema.shape,
    outputSchema: FindExpiredInventoryResponseSchema.shape,
  },
  findExpiredInventory
);

server.registerTool(
  "evaluate_item_data_quality",
  {
    title: "Evaluate Item Data Quality",
    description:
      "Scan item records for misspellings, leading/trailing whitespace, blank or null fields, and unusual item names. Returns UPCs with a short issue summary.",
    inputSchema: EvaluateItemDataQualityInputSchema.shape,
    outputSchema: EvaluateItemDataQualityResponseSchema.shape,
  },
  evaluateItemDataQuality
);

server.registerTool(
  "update_item",
  {
    title: "Update Item",
    description:
      "Update an item master record by UPC using PUT /item and return confirmation payload.",
    inputSchema: UpdateItemInputSchema.shape,
    outputSchema: UpdateItemResponseSchema.shape,
  },
  updateItem
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
