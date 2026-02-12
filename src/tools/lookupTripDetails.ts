import {
  FetchTripResponseSchema,
  LookupTripDetailsSchema,
} from "../models.js";
import type { FetchTripResponse } from "../models.js";
import { SanaApiClient, SanaApiRequestError } from "../sanaApi.js";

export function createLookupTripDetailsHandler(sanaApiClient: SanaApiClient) {
  return async function lookupTripDetails(args: unknown) {
    const input = LookupTripDetailsSchema.parse(args);

    let trip: FetchTripResponse;
    try {
      trip = await sanaApiClient.request<FetchTripResponse>(
        `/trip/${input.tripId}`
      );
    } catch (error) {
      if (error instanceof SanaApiRequestError && error.status === 404) {
        throw new Error(`Trip ${input.tripId} not found`);
      }

      throw error;
    }

    const structuredContent = FetchTripResponseSchema.parse(trip);

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
