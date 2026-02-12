import { z } from "zod";

const tripDateSchema = z
  .string()
  .regex(
    /^(?:19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    "Date must be in YYYY-MM-DD format."
  );

const tripItemDateSchema = z
  .string()
  .regex(
    /^(0[1-9]|1[0-2])\/\d{4}$/,
    "Date must be in MM/YYYY format."
  );

const upcSchema = z
  .string()
  .regex(/^\d{8}(\d{4})?$/, "UPC must be 8 digits (UPC-E) or 12 digits (UPC-A).");

const categorySchema = z.enum([
  "Allergy",
  "Analgesics",
  "Anti Infectives",
  "Cardiac",
  "Diabetes",
  "Genitourinary",
  "GI",
  "Respiratory",
  "Supplements",
  "Topical",
  "Vitamins",
]);

const presentationSchema = z.enum([
  "Ampules",
  "Capsules",
  "Caplets",
  "Chewable tablets",
  "Cream",
  "Gelcaps",
  "Inhalation aerosol",
  "Injection",
  "Liquid gel capsules",
  "Nasal spray",
  "Ointment",
  "Ophthalmic solution",
  "Ophthalamic drops",
  "Oral drops",
  "Oral solution",
  "Oral suspension",
  "Otic drops",
  "Rectal Suppository",
  "Sachet",
  "Shampoo",
  "Soft gel",
  "Soft gel capsules",
  "Suspension",
  "Tablets",
  "Topical",
  "Vaginal Suppository",
  "Vial",
]);

export enum TripStatus {
  Created = 'CREATED',
  Packing = 'PACKING',
  Packed = 'PACKED',
  Returned = 'RETURNED',
  Complete = 'COMPLETE',
  Unknown = 'UNKNOWN',
}

export const LookupTripDetailsSchema = z.object({
  tripId: z.number().min(1).describe("Unique trip identifier (e.g. 23)"),
});

export const TripInventorySchema = z.object({
  tripName: z.string().optional().describe("Optional trip name filter. Matches destination, city, or country terms in the trip name."),
});

export const TripSchema = z.object({
  tripId: z.number().min(1).describe("Unique identifier for the trip."),
  name: z.string().describe("Human-readable trip name, usually destination-focused."),
  startDate: tripDateSchema.describe("Trip start date in YYYY-MM-DD format."),
  endDate: tripDateSchema.describe("Trip end date in YYYY-MM-DD format."),
  countryCode: z.string().describe("ISO country code for the trip destination."),
  status: z.enum([
    TripStatus.Created,
    TripStatus.Packing,
    TripStatus.Packed,
    TripStatus.Returned,
    TripStatus.Complete,
    TripStatus.Unknown,
  ]).optional().describe("Current lifecycle status of the trip."),
});

export const TripItemSchema = z.object({
  upc: upcSchema
    .describe("Universal Product Code for the item (8-digit UPC-E or 12-digit UPC-A)."),
  boxNumber: z.number().describe("Packing box number where the item is stored."),
  quantity: z.number().describe("Count of units packed for this item."),
  expirationDate: tripItemDateSchema.describe("Item expiration date in MM/YYYY format."),
  lotNumber: z.string().describe("Manufacturer lot/batch identifier."),
  inventoryId: z.number().describe("Internal inventory record identifier for this item."),
  name: z.string().describe("Display name of the medication or supply."),
  brand: z.string().describe("Brand name of the item."),
  manufacturer: z.string().describe("Manufacturer of the item."),
  manufacturedDate: tripItemDateSchema.optional().describe("Manufacture date in MM/YYYY format, when available."),
  presentation: presentationSchema.describe("Presentation form of the item."),
  dose: z.string().describe("Dose strength and format for the item."),
  category: categorySchema.describe("Inventory category classification."),
  productAmount: z.number().describe("Total amount contained in a full item unit."),
  productAmountUnit: z.string().describe("Unit of measure for productAmount (e.g., mg, mL)."),
  partialAmount: z.number().nullish().describe("Remaining amount when the unit is partial. Can be null when unknown."),
  partialamountUnit: z.string().optional().describe("Unit of measure for partialAmount."),
});

export const ReturnedItemSchema = z.object({
  name: z.string().describe("Display name of the returned item."),
  upc: upcSchema
    .describe("Universal Product Code for the returned item (8-digit UPC-E or 12-digit UPC-A)."),
  lotNumber: z.string().describe("Manufacturer lot/batch identifier of the returned item."),
  expirationDate: tripItemDateSchema.describe("Returned item expiration date in MM/YYYY format."),
  inventoryId: z.number().describe("Internal inventory record identifier for the returned item."),
  returnedQuantity: z.number().describe("Number of units returned."),
  returnedProductAmount: z.number().describe("Amount returned from the original item contents."),
  originalProductAmount: z.number().describe("Original full amount before return."),
  productAmountUnit: z.string().describe("Unit of measure for returned and original amounts."),
  beingRelabeled: z.boolean().describe("Whether this returned item is currently being relabeled."),
});

export const ReturnedItemsSchema = z.object({
  fulls: z.array(ReturnedItemSchema).describe("Returned items that were sent back as full units."),
  partials: z.array(ReturnedItemSchema).describe("Returned items that were sent back as partial units."),
});

export const FetchTripResponseSchema = z.object({
  trip: TripSchema.describe("Trip-level metadata and status details."),
  items: z.array(TripItemSchema).describe("Inventory items currently associated with the trip."),
  returnedItems: ReturnedItemsSchema.describe("Returned inventory grouped by full and partial returns."),
});

export const SearchTripsResponseSchema = z.object({
  trips: z.array(TripSchema).describe("Trips matching the optional name filter."),
  totalAvailable: z.number().describe("Total number of trips returned in this response."),
  returned: z.number().describe("Count of trips returned after applying filters."),
});

export const ItemListInputSchema = z.object({
  page: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("0-based page index for item search (default API behavior is page 0)."),
  pageSize: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Page size for item search (for example 25)."),
  filter: z
    .string()
    .optional()
    .describe("Optional text filter applied by the Items API."),
});

export const ItemByUpcInputSchema = z.object({
  upc: upcSchema.describe(
    "Universal Product Code for item lookup (8-digit UPC-E or 12-digit UPC-A)."
  ),
});

export const SortStateSchema = z.object({
  empty: z.boolean().describe("True when no sorting is configured."),
  sorted: z.boolean().describe("True when the current page is sorted."),
  unsorted: z.boolean().describe("True when the current page is unsorted."),
});

export const PaginationStateSchema = z.object({
  pageNumber: z.number().int().min(0).describe("Current 0-based page index."),
  pageSize: z.number().int().min(1).describe("Configured page size."),
  sort: SortStateSchema.describe("Sort metadata for this page."),
  offset: z.number().int().min(0).describe("Row offset into the full result set."),
  paged: z.boolean().describe("True when pagination is enabled."),
  unpaged: z.boolean().describe("True when pagination is disabled."),
});

export const ItemSchema = z.object({
  upc: upcSchema.describe("Universal Product Code for the item."),
  name: z.string().describe("Display medication name."),
  manufacturer: z.string().describe("Manufacturer name."),
  brand: z.string().describe("Brand or trade name."),
  presentation: presentationSchema.describe("Presentation form of the item."),
  productAmount: z.number().describe("Amount contained per full item unit."),
  productAmountUnit: z
    .string()
    .describe("Unit of measure for productAmount (for example Tablets or mL)."),
  dose: z.string().describe("Dose strength and format."),
  category: categorySchema.describe("Medication category."),
});

export const ItemWithQuantitySchema = ItemSchema.extend({
  quantity: z
    .number()
    .int()
    .min(0)
    .describe("Current on-hand quantity for this item."),
});

export const ItemListResponseSchema = z.object({
  totalPages: z
    .number()
    .int()
    .min(0)
    .describe("Total available pages for the current item query."),
  totalItems: z
    .number()
    .int()
    .min(0)
    .describe("Total matching item records across all pages."),
  page: PaginationStateSchema.describe("Pagination metadata returned by the Items API."),
  itemsWithQuantity: z
    .array(ItemWithQuantitySchema)
    .describe("Items returned for the requested page, each with on-hand quantity."),
});

export const ItemInventoryListInputSchema = z.object({
  page: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "0-based page index for item-inventory search (default API behavior is page 0)."
    ),
  pageSize: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Page size for item-inventory search (for example 100)."),
  filter: z
    .string()
    .optional()
    .describe("Optional text filter applied by the Item Inventory API."),
});

export const ItemInventoryRowSchema = ItemWithQuantitySchema.extend({
  inventoryId: z
    .number()
    .int()
    .min(1)
    .describe("Unique inventory record identifier."),
  lotNumber: z.string().describe("Manufacturer lot or batch number."),
  expirationDate: tripItemDateSchema.describe("Inventory lot expiration in MM/YYYY format."),
  manufacturedDate: tripItemDateSchema
    .nullable()
    .describe("Inventory lot manufactured date in MM/YYYY format. Null when unknown."),
});

export const ItemInventoryListResponseSchema = z.object({
  totalPages: z
    .number()
    .int()
    .min(0)
    .describe("Total available pages for the current item-inventory query."),
  totalItems: z
    .number()
    .int()
    .min(0)
    .describe("Total matching item-inventory records across all pages."),
  page: PaginationStateSchema.describe(
    "Pagination metadata returned by the Item Inventory API."
  ),
  itemInventoryRows: z
    .array(ItemInventoryRowSchema)
    .describe("Inventory rows returned for the requested page."),
});

const CustomsRiskSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
const CustomsRiskTypeSchema = z.enum([
  "EXPIRATION",
  "DATA_GAP",
  "TRIP_INELIGIBLE",
]);

export const AssessCustomsClearanceRiskSchema = z.object({
  tripId: z.number().min(1).describe("Target trip identifier to assess."),
  countryCode: z
    .string()
    .optional()
    .describe(
      "Optional destination country override. Defaults to the trip countryCode."
    ),
  minShelfLifeDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Minimum remaining shelf life in days after country entry. Defaults to 180."
    ),
  includeWarnings: z
    .boolean()
    .optional()
    .describe("Include MEDIUM/LOW findings in output. Defaults to true."),
});

export const CustomsClearanceRiskFindingSchema = z.object({
  severity: CustomsRiskSeveritySchema,
  type: CustomsRiskTypeSchema,
  upc: z.string().optional(),
  itemName: z.string().optional(),
  lotNumber: z.string().optional(),
  expirationDate: z.string().optional(),
  inventoryId: z.number().optional(),
  message: z.string(),
  recommendedAction: z.string(),
});

export const CustomsClearanceRiskSummarySchema = z.object({
  assessment: z
    .enum(["PASS", "FAIL"])
    .describe("Simple customs assessment outcome for the trip."),
  totalItems: z.number(),
  failedItemsCount: z
    .number()
    .describe("Count of distinct items that failed customs assessment."),
});

export const CustomsExpirationFindingsByMonthSchema = z.object({
  expirationMonth: z
    .string()
    .describe("Expiration month bucket in MM/YYYY format."),
  count: z.number().describe("Number of expiration findings in this month."),
});

export const CustomsFailedItemInBoxSchema = z.object({
  itemName: z.string(),
  expirationDate: z.string(),
  instances: z
    .number()
    .int()
    .min(1)
    .describe("How many failed entries share this same item and expiration."),
});

export const CustomsFailedItemsByBoxSchema = z.object({
  boxNumber: z.number(),
  items: z.array(CustomsFailedItemInBoxSchema),
});

export const CustomsClearanceRiskBreakdownSchema = z.object({
  totalExpirationFindings: z.number(),
  expirationFindingsByMonth: z.array(CustomsExpirationFindingsByMonthSchema),
  failedItemsByBox: z.array(CustomsFailedItemsByBoxSchema),
});

export const AssessCustomsClearanceRiskResponseSchema = z.object({
  trip: TripSchema,
  summary: CustomsClearanceRiskSummarySchema,
  breakdown: CustomsClearanceRiskBreakdownSchema,
  findings: z.array(CustomsClearanceRiskFindingSchema),
  nextSteps: z.array(z.string()),
});

export type LookupTripDetailsInput = z.infer<typeof LookupTripDetailsSchema>;
export type TripInventoryInput = z.infer<typeof TripInventorySchema>;
export type Trip = z.infer<typeof TripSchema>;
export type TripItem = z.infer<typeof TripItemSchema>;
export type ReturnedItem = z.infer<typeof ReturnedItemSchema>;
export type ReturnedItems = z.infer<typeof ReturnedItemsSchema>;
export type FetchTripResponse = z.infer<typeof FetchTripResponseSchema>;
export type SearchTripsResponse = z.infer<typeof SearchTripsResponseSchema>;
export type ItemListInput = z.infer<typeof ItemListInputSchema>;
export type ItemByUpcInput = z.infer<typeof ItemByUpcInputSchema>;
export type SortState = z.infer<typeof SortStateSchema>;
export type PaginationState = z.infer<typeof PaginationStateSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type ItemWithQuantity = z.infer<typeof ItemWithQuantitySchema>;
export type ItemListResponse = z.infer<typeof ItemListResponseSchema>;
export type ItemInventoryListInput = z.infer<typeof ItemInventoryListInputSchema>;
export type ItemInventoryRow = z.infer<typeof ItemInventoryRowSchema>;
export type ItemInventoryListResponse = z.infer<
  typeof ItemInventoryListResponseSchema
>;
export type AssessCustomsClearanceRiskInput = z.infer<
  typeof AssessCustomsClearanceRiskSchema
>;
export type CustomsClearanceRiskFinding = z.infer<
  typeof CustomsClearanceRiskFindingSchema
>;
export type CustomsClearanceRiskBreakdown = z.infer<
  typeof CustomsClearanceRiskBreakdownSchema
>;
export type AssessCustomsClearanceRiskResponse = z.infer<
  typeof AssessCustomsClearanceRiskResponseSchema
>;
