import { SearchTripsResponseSchema, TripInventorySchema } from "../models.js";
import type { Trip } from "../models.js";
import { SanaApiClient } from "../sanaApi.js";

export function createSearchTripsHandler(sanaApiClient: SanaApiClient) {
  return async function searchTrips(args: unknown) {
    const input = TripInventorySchema.parse(args);
    const trips = await sanaApiClient.request<Trip[]>("/trip");

    let filtered = trips;
    if (input.tripName) {
      const normalizedFilter = input.tripName.toLowerCase();
      filtered = filtered.filter((t) =>
        t.name.toLowerCase().includes(normalizedFilter)
      );
    }
    if (input.status) {
      filtered = filtered.filter((t) => t.status === input.status);
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
  };
}
