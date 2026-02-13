import {
  ItemInventoryListInputSchema,
  ItemInventoryListResponseSchema,
  ItemInventorySchema,
} from "../models.js";
import type { ItemInventoryListResponse } from "../models.js";
import { SanaApiClient, SanaApiRequestError } from "../sanaApi.js";

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

function buildItemInventoryByIdPath(inventoryId: number): string {
  return `/item-inventory/with-item/${inventoryId}`;
}

function normalizeSingleInventoryResponse(rawResponse: unknown) {
  if (!rawResponse || typeof rawResponse !== "object") {
    throw new Error("Inventory lookup returned invalid payload.");
  }

  const responseObj = rawResponse as Record<string, unknown>;
  const candidates: unknown[] = [
    responseObj.itemInventoryRow,
    responseObj.itemInventory,
    responseObj.item,
    responseObj.data,
    rawResponse,
  ];

  if (
    Array.isArray(responseObj.itemInventoryRows) &&
    responseObj.itemInventoryRows.length > 0
  ) {
    candidates.unshift(responseObj.itemInventoryRows[0]);
  }

  for (const candidate of candidates) {
    const parsed = ItemInventorySchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }
  }

  throw new Error("Inventory lookup response did not match expected shape.");
}

export function createSearchItemInventoryHandler(sanaApiClient: SanaApiClient) {
  return async function searchItemInventory(args: unknown) {
    const input = ItemInventoryListInputSchema.parse(args);

    if (input.inventoryId) {
      let inventoryResponse: unknown;
      try {
        inventoryResponse = await sanaApiClient.request<unknown>(
          buildItemInventoryByIdPath(input.inventoryId)
        );
      } catch (error) {
        if (error instanceof SanaApiRequestError && error.status === 404) {
          throw new Error(`Inventory record ${input.inventoryId} not found`);
        }
        throw error;
      }

      const item = normalizeSingleInventoryResponse(inventoryResponse);
      const structuredContent = ItemInventoryListResponseSchema.parse({
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
        itemInventoryRows: [item],
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

    const response = await sanaApiClient.request<ItemInventoryListResponse>(
      buildItemInventorySearchPath(page, pageSize, filter)
    );

    const structuredContent = ItemInventoryListResponseSchema.parse({
      ...response,
      itemInventoryRows: response.itemInventoryRows.filter(
        (row) => row.quantity !== null && row.quantity >= 1
      ),
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
