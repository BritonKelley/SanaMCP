import { ItemListInputSchema, ItemListResponseSchema } from "../models.js";
import type { ItemListResponse } from "../models.js";
import { SanaApiClient } from "../sanaApi.js";

const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 25;

function buildItemSearchPath(page: number, pageSize: number, filter: string): string {
  const queryParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    filter,
  });

  return `/item?${queryParams.toString()}`;
}

export function createSearchItemsHandler(sanaApiClient: SanaApiClient) {
  return async function searchItems(args: unknown) {
    const input = ItemListInputSchema.parse(args);
    const page = input.page ?? DEFAULT_PAGE;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const filter = input.filter ?? "";

    const response = await sanaApiClient.request<ItemListResponse>(
      buildItemSearchPath(page, pageSize, filter)
    );

    const structuredContent = ItemListResponseSchema.parse(response);

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
