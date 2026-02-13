# Sana MCP Tool Roadmap

## Queued Business Tools

1. `assess_customs_clearance_risk` (completed)
2. `find_trip_expiration_risks` (queued)
3. `check_trip_inventory_coverage` (queued)
4. `build_customs_manifest` (queued)
7. `suggest_item_substitutions` (queued)

---

## Completed Support Tools

### `search_items` (completed)
- Purpose: search item master data with pagination and optional filter.
- Endpoints:
  - `/item?page={page}&pageSize={pageSize}&filter={filter}`
  - `/item/{upc}` for direct single-item lookup
- Output highlights:
  - `totalPages`, `totalItems`, `page`
  - `itemsWithQuantity[]`
- Notes:
  - tool now tolerates imperfect source values (blank/unknown `category` or `presentation`, and `quantity: null`) without failing.
  - response stays shape-compatible for both paged and direct `upc` lookup modes.

### `search_item_inventory` (completed)
- Purpose: search lot-level inventory rows with pagination and optional filter.
- Endpoints:
  - `/item-inventory?page={page}&pageSize={pageSize}&filter={filter}`
  - `/item-inventory/with-item/{inventoryId}` for direct single-record lookup
- Output highlights:
  - `totalPages`, `totalItems`, `page`
  - `itemInventoryRows[]` including `inventoryId`, `upc`, `lotNumber`, `expirationDate`, `manufacturedDate`, `quantity`, and item descriptors.
- Notes:
  - only rows with `quantity >= 1` are returned in paged search mode.
  - `manufacturedDate` supports either `MM/YYYY` or `YYYY-MM-DD` from source data.

### `evaluate_item_data_quality` (completed)
- Purpose: identify likely item data problems and return actionable UPC-level findings.
- Checks include:
  - misspellings / out-of-ordinary naming patterns
  - leading/trailing whitespace in text fields
  - null or blank fields
  - invalid/unknown category or presentation values
- Output:
  - `scannedItems`, `scannedPages`, `flaggedItemCount`
  - `flaggedItems[]` with `upc` and short issue `description`.

### `update_item` (completed)
- Purpose: update item master data by UPC.
- Endpoint: `PUT /item`.
- Output:
  - update confirmation payload with the updated `item` object.
- Notes:
  - `quantity` can be sent for API compatibility, but effective inventory is driven by item-inventory totals.

### `find_expired_inventory` (completed)
- Purpose: report currently expired inventory lots.
- Endpoint used: `/item-inventory` (scanned with pagination).
- Expiration rule:
  - `expirationDate` is interpreted as valid through end-of-month for `MM/YYYY`.
- Output:
  - `asOfDate`, `scannedPages`, `scannedItems`, `expiredCount`, `expiredItems[]`
- Notes:
  - excludes historical/non-stock rows where `quantity` is `0` or `null`.

---

## Tool 1: assess_customs_clearance_risk

### Business question
Will this trip likely clear customs with the currently packed medication?

### Goal
Return a clear pass/fail customs assessment with item-level findings and actionable next steps before shipment.

### MCP Tool Name
`assess_customs_clearance_risk`

### Proposed Input
- `tripId` (number, required): target trip to assess
- `countryCode` (string, optional): override destination if needed, default from trip
- `minShelfLifeDays` (number, optional): default policy threshold (default: 180)
- `includeWarnings` (boolean, optional): include medium/low risk observations

### Proposed Output
- `trip`:
  - `tripId`, `name`, `countryCode`, `startDate`, `endDate`, `status`
- `summary`:
  - `assessment`: `PASS | FAIL`
  - `totalItems`
  - `failedItemsCount`
- `breakdown`:
  - `totalExpirationFindings`
  - `expirationFindingsByMonth`: `{ expirationMonth: MM/YYYY, count }[]`
  - `failedItemsByBox`: `{ boxNumber, items: [{ itemName, expirationDate, instances }] }[]`
    - duplicate `itemName + expirationDate` rows are grouped with `instances`
- `findings` (array):
  - `severity`: `HIGH | MEDIUM`
  - `type`: `EXPIRATION | DATA_GAP | TRIP_INELIGIBLE`
  - `upc`, `itemName`, `lotNumber`, `expirationDate`, `inventoryId`
  - `message`
  - `recommendedAction`
- `nextSteps` (array of string)

### Data sources
- Existing:
  - `/trip/{id}` only -> packed items, trip dates, lot/expiration/details needed for assessment

### High-level implementation flow
1. Load trip details from `tripId`.
2. Validate trip eligibility:
   - `status` must be `PACKING` or `PACKED`
   - trip must not have departed yet (trip start date has not passed)
3. For each trip item:
   - validate required customs fields present in trip payload
   - evaluate expiration risk versus trip entry/start date + `minShelfLifeDays` (default 180)
4. Aggregate findings into summary and breakdown sections.
5. Return structured content for agent reasoning and human review.

### Initial customs policy strategy (MVP)
- Global rule only:
  - medication expiration must be at least 6 months (180 days) after entering country
- No restricted categories for now.
- Required fields are validated directly from trip item payload.

### Error handling expectations
- If trip not found -> explicit not found error.
- If trip status/date makes the trip ineligible -> return explicit validation error.
- If no packed items -> return a `PASS` assessment with a data-gap warning and next step to pack/reassess.

### Definition of done (tool 1)
- Tool returns deterministic summary + findings for a valid `tripId`.
- Handles partial API failures without crashing.
- Produces at least one actionable `nextSteps` recommendation when risk exists.
- Includes output schema in `registerTool`.

### Open decisions before implementation
- None currently.
