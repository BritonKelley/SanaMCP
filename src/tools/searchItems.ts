import {
  ItemListInputSchema,
  ItemListResponseSchema,
  ItemWithQuantitySchema,
} from "../models.js";
import type { ItemListResponse } from "../models.js";
import { SanaApiClient, SanaApiRequestError } from "../sanaApi.js";

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

function buildItemLookupPath(upc: string): string {
  return `/item/${encodeURIComponent(upc)}`;
}

function normalizeSingleItemResponse(rawResponse: unknown) {
  if (!rawResponse || typeof rawResponse !== "object") {
    throw new Error("Item lookup returned invalid payload.");
  }

  const responseObj = rawResponse as Record<string, unknown>;
  const itemObj =
    responseObj.item && typeof responseObj.item === "object"
      ? (responseObj.item as Record<string, unknown>)
      : responseObj;

  const normalized = {
    ...itemObj,
    quantity: itemObj.quantity ?? null,
  };

  return ItemWithQuantitySchema.parse(normalized);
}

export function createSearchItemsHandler(sanaApiClient: SanaApiClient) {
  return async function searchItems(args: unknown) {
    const input = ItemListInputSchema.parse(args);

    if (input.upc) {
      let itemResponse: unknown;
      try {
        itemResponse = await sanaApiClient.request<unknown>(
          buildItemLookupPath(input.upc)
        );
      } catch (error) {
        if (error instanceof SanaApiRequestError && error.status === 404) {
          throw new Error(`Item ${input.upc} not found`);
        }
        throw error;
      }

      const item = normalizeSingleItemResponse(itemResponse);
      const structuredContent = ItemListResponseSchema.parse({
        totalPages: 1,
        totalItems: 1,
        page: {
          pageNumber: 0,
          pageSize: 1,
          sort: {
            empty: true,
            sorted: false,
            unsorted: true,
          },
          offset: 0,
          paged: true,
          unpaged: false,
        },
        itemsWithQuantity: [item],
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
    }

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
