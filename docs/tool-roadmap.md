# Sana MCP Tool Roadmap

## Business Tool Status

1. `find_trip_expiration_risks` (completed)
2. `check_trip_inventory_coverage` (completed via `evaluate_trip_packing_readiness`)
3. `build_customs_manifest` (queued)
4. `suggest_item_substitutions` (queued)

---

## Completed Business Tools

### `evaluate_trip_packing_readiness` (completed)
- Purpose: evaluate whether a trip is packed and ready using deterministic packing rules.
- Data source: `/trip/{id}`.
- Output highlights:
  - overall `rating` (`GREEN|YELLOW|RED`)
  - `summary` check counts and pediatric readiness confidence (%)
  - detailed `checks[]` and focused `reasons[]`
  - prioritized `recommendedActions[]`
- Coverage includes:
  - core category presence
  - named medication coverage
  - formulation adequacy and common medication formulation diversity
  - antibiotic diversity
  - topical, GI, cardiac, injectable depth checks
  - region-specific medication checks by country mapping
  - vitamin red-flag minimum thresholds (`FAIL`) and preferred ranges (`WARN`)
  - expiration checks against trip start date, including high-priority expired-med list with box numbers
- Notes:
  - all thresholds, keyword sets, rule identifiers, and country mappings are centralized in `src/tools/evaluationConstants.ts` for easy policy tuning.

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
  - tool tolerates imperfect source values (blank/unknown `category` or `presentation`, and `quantity: null`) without failing.
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
  - `flaggedItems[]` with `upc` and short issue `description`

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

## Next Up

### `build_customs_manifest` (queued)
- Proposed scope:
  - produce a customs-ready manifest grouped by box with medication, lot, expiration, and quantities.
  - include a validation summary for missing/invalid customs-required fields.

### `suggest_item_substitutions` (queued)
- Proposed scope:
  - suggest replacements when a medication is expired, unavailable, or under target levels.
  - prioritize same-category and same-presentation substitutions from current inventory.
