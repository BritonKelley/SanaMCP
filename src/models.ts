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
  upc: z
    .string()
    .regex(/^\d{8}(\d{4})?$/, "UPC must be 8 digits (UPC-E) or 12 digits (UPC-A).")
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
  upc: z
    .string()
    .regex(/^\d{8}(\d{4})?$/, "UPC must be 8 digits (UPC-E) or 12 digits (UPC-A).")
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

export type LookupTripDetailsInput = z.infer<typeof LookupTripDetailsSchema>;
export type TripInventoryInput = z.infer<typeof TripInventorySchema>;
export type Trip = z.infer<typeof TripSchema>;
export type TripItem = z.infer<typeof TripItemSchema>;
export type ReturnedItem = z.infer<typeof ReturnedItemSchema>;
export type ReturnedItems = z.infer<typeof ReturnedItemsSchema>;
export type FetchTripResponse = z.infer<typeof FetchTripResponseSchema>;
export type SearchTripsResponse = z.infer<typeof SearchTripsResponseSchema>;
