import {
  UpdateItemInputSchema,
  UpdateItemResponseSchema,
} from "../models.js";
import type { UpdateItemResponse } from "../models.js";
import { SanaApiClient, SanaApiRequestError } from "../sanaApi.js";

export function createUpdateItemHandler(sanaApiClient: SanaApiClient) {
  return async function updateItem(args: unknown) {
    const input = UpdateItemInputSchema.parse(args);

    let response: unknown;
    try {
      response = await sanaApiClient.put<unknown, typeof input>("/item", input);
    } catch (error) {
      if (error instanceof SanaApiRequestError) {
        throw new Error(
          `Failed to update item ${input.upc}: ${error.message}`
        );
      }

      throw error;
    }

    if (response === null) {
      throw new Error(
        `Update for item ${input.upc} succeeded but API returned an empty confirmation payload.`
      );
    }

    const structuredContent: UpdateItemResponse =
      UpdateItemResponseSchema.parse(response);

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
