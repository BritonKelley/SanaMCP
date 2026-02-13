import {
  FindExpiredInventoryInputSchema,
  FindExpiredInventoryResponseSchema,
  ItemInventoryListResponseSchema,
} from "../models.js";
import type {
  FindExpiredInventoryResponse,
  ItemInventoryListResponse,
} from "../models.js";
import { SanaApiClient } from "../sanaApi.js";

const DEFAULT_PAGE_SIZE = 100;

function getUtcStartOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function parseAsOfDate(asOfDate?: string): Date {
  if (!asOfDate) {
    return getUtcStartOfToday();
  }

  const parsed = new Date(`${asOfDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid asOfDate format: ${asOfDate}`);
  }

  return parsed;
}

function formatAsOfDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseExpirationToMonthEndUtc(expirationDate: string): Date {
  const [monthPart, yearPart] = expirationDate.split("/");
  const month = Number(monthPart);
  const year = Number(yearPart);

  if (!Number.isInteger(month) || !Number.isInteger(year)) {
    throw new Error(`Invalid expiration date format: ${expirationDate}`);
  }

  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function isExpiredAsOf(expirationDate: string, asOfDateUtc: Date): boolean {
  const expirationMonthEndUtc = parseExpirationToMonthEndUtc(expirationDate);
  return expirationMonthEndUtc.getTime() < asOfDateUtc.getTime();
}

function hasOnHandInventory(quantity: number | null): boolean {
  return quantity !== null && quantity > 0;
}

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

export function createFindExpiredInventoryHandler(sanaApiClient: SanaApiClient) {
  return async function findExpiredInventory(args: unknown) {
    const input = FindExpiredInventoryInputSchema.parse(args);
    const asOfDateUtc = parseAsOfDate(input.asOfDate);
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const filter = input.filter ?? "";

    let scannedPages = 0;
    let scannedItems = 0;
    const expiredItems: ItemInventoryListResponse["itemInventoryRows"] = [];

    const firstPageRaw = await sanaApiClient.request<ItemInventoryListResponse>(
      buildItemInventorySearchPath(0, pageSize, filter)
    );
    const firstPage = ItemInventoryListResponseSchema.parse(firstPageRaw);

    const totalPagesToScan = firstPage.totalPages
      ? input.maxPages
        ? Math.min(firstPage.totalPages, input.maxPages)
        : firstPage.totalPages
      : 0;

    const scanRows = (rows: ItemInventoryListResponse["itemInventoryRows"]) => {
      scannedItems += rows.length;

      for (const row of rows) {
        if (!hasOnHandInventory(row.quantity)) {
          continue;
        }

        if (isExpiredAsOf(row.expirationDate, asOfDateUtc)) {
          expiredItems.push(row);
        }
      }
    };

    if (totalPagesToScan > 0) {
      scannedPages += 1;
      scanRows(firstPage.itemInventoryRows);
    }

    for (let page = 1; page < totalPagesToScan; page += 1) {
      const pageRaw = await sanaApiClient.request<ItemInventoryListResponse>(
        buildItemInventorySearchPath(page, pageSize, filter)
      );
      const parsedPage = ItemInventoryListResponseSchema.parse(pageRaw);
      scannedPages += 1;
      scanRows(parsedPage.itemInventoryRows);
    }

    const structuredContent: FindExpiredInventoryResponse =
      FindExpiredInventoryResponseSchema.parse({
        asOfDate: formatAsOfDate(asOfDateUtc),
        scannedPages,
        scannedItems,
        expiredCount: expiredItems.length,
        expiredItems,
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
