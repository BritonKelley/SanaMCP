import {
  ItemInventoryListInputSchema,
  ItemInventoryListResponseSchema,
} from "../models.js";
import type { ItemInventoryListResponse } from "../models.js";
import { SanaApiClient } from "../sanaApi.js";

const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 100;

function buildItemInventorySearchPath(
  page: number,
  pageSize: number,
  filter: string
): string {
  const queryParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    filter,
  });

  return `/item-inventory?${queryParams.toString()}`;
}

export function createSearchItemInventoryHandler(sanaApiClient: SanaApiClient) {
  return async function searchItemInventory(args: unknown) {
    const input = ItemInventoryListInputSchema.parse(args);
    const page = input.page ?? DEFAULT_PAGE;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const filter = input.filter ?? "";

    const response = await sanaApiClient.request<ItemInventoryListResponse>(
      buildItemInventorySearchPath(page, pageSize, filter)
    );

    const structuredContent = ItemInventoryListResponseSchema.parse(response);

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
