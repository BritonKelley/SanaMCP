import { z } from "zod";
import {
  EvaluateItemDataQualityInputSchema,
  EvaluateItemDataQualityResponseSchema,
} from "../models.js";
import type {
  EvaluateItemDataQualityResponse,
  ItemDataQualityIssue,
} from "../models.js";
import { SanaApiClient } from "../sanaApi.js";

const DEFAULT_PAGE_SIZE = 100;
const UNKNOWN_UPC = "<missing upc>";
const UPC_PATTERN = /^\d{8}(\d{4})?$/;

const ALLOWED_CATEGORIES = new Set([
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

const ALLOWED_PRESENTATIONS = new Set([
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

const RawItemRowSchema = z.object({}).passthrough();
const RawItemPageSchema = z.object({
  totalPages: z.number().int().min(0),
  totalItems: z.number().int().min(0),
  itemsWithQuantity: z.array(RawItemRowSchema),
});

type RawItemRow = z.infer<typeof RawItemRowSchema>;

type ItemIssueAccumulator = {
  upc: string;
  name?: string;
  issues: Set<string>;
};

function buildItemSearchPath(page: number, pageSize: number, filter: string): string {
  const queryParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    filter,
  });

  return `/item?${queryParams.toString()}`;
}

function readText(row: RawItemRow, field: string): string | null {
  const value = row[field];
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return String(value);
  }

  return value;
}

function addTextFieldIssues(row: RawItemRow, field: string, issues: Set<string>): string {
  const value = readText(row, field);
  if (value === null) {
    issues.add(`${field} is null`);
    return "";
  }

  if (value.trim().length === 0) {
    issues.add(`${field} is blank`);
  }

  if (value !== value.trim()) {
    issues.add(`${field} has leading/trailing whitespace`);
  }

  return value;
}

function addNumericFieldIssues(
  row: RawItemRow,
  field: string,
  issues: Set<string>,
  options?: { integer?: boolean; min?: number }
): number | null {
  const value = row[field];
  if (value === null || value === undefined) {
    issues.add(`${field} is null`);
    return null;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    issues.add(`${field} is not numeric`);
    return null;
  }

  if (options?.integer && !Number.isInteger(value)) {
    issues.add(`${field} is not an integer`);
  }

  if (options?.min !== undefined && value < options.min) {
    issues.add(`${field} is below ${options.min}`);
  }

  return value;
}

function addSuspiciousNameIssues(name: string, issues: Set<string>): void {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return;
  }

  if (trimmedName.length > 40) {
    issues.add("name appears unusually long");
  }

  if (/\bexp(?:iration)?\.?\b/i.test(trimmedName) || /\b\d{1,2}\/\d{2,4}\b/.test(trimmedName)) {
    issues.add("name appears to include expiration text");
  }

  if (/\b\d+\s*(?:fl\.?\s*oz|bottles?|packs?)\b/i.test(trimmedName)) {
    issues.add("name appears to include packaging metadata");
  }

  if (/\s{2,}/.test(trimmedName)) {
    issues.add("name contains repeated whitespace");
  }
}

function normalizeUpc(rawUpc: string): string {
  const trimmed = rawUpc.trim();
  if (!trimmed) {
    return UNKNOWN_UPC;
  }

  return trimmed;
}

function collectIssuesForRow(row: RawItemRow): ItemIssueAccumulator | null {
  const issues = new Set<string>();

  const rawUpc = addTextFieldIssues(row, "upc", issues);
  const upc = normalizeUpc(rawUpc);
  if (upc !== UNKNOWN_UPC && !UPC_PATTERN.test(upc)) {
    issues.add("upc format is invalid");
  }

  const name = addTextFieldIssues(row, "name", issues);
  addTextFieldIssues(row, "manufacturer", issues);
  addTextFieldIssues(row, "brand", issues);
  const presentation = addTextFieldIssues(row, "presentation", issues).trim();
  addNumericFieldIssues(row, "productAmount", issues, { min: 0 });
  addTextFieldIssues(row, "productAmountUnit", issues);
  addTextFieldIssues(row, "dose", issues);
  const category = addTextFieldIssues(row, "category", issues).trim();
  addNumericFieldIssues(row, "quantity", issues, { integer: true, min: 0 });

  if (category && !ALLOWED_CATEGORIES.has(category)) {
    issues.add(`category "${category}" is not recognized`);
  }

  if (presentation && !ALLOWED_PRESENTATIONS.has(presentation)) {
    issues.add(`presentation "${presentation}" is not recognized`);
  }

  addSuspiciousNameIssues(name, issues);

  if (issues.size === 0) {
    return null;
  }

  const normalizedName = name.trim();
  return {
    upc,
    name: normalizedName || undefined,
    issues,
  };
}

function mergeIssue(
  findingsByUpc: Map<string, ItemIssueAccumulator>,
  issue: ItemIssueAccumulator
): void {
  const existing = findingsByUpc.get(issue.upc);
  if (!existing) {
    findingsByUpc.set(issue.upc, issue);
    return;
  }

  for (const itemIssue of issue.issues) {
    existing.issues.add(itemIssue);
  }

  if (!existing.name && issue.name) {
    existing.name = issue.name;
  }
}

export function createEvaluateItemDataQualityHandler(sanaApiClient: SanaApiClient) {
  return async function evaluateItemDataQuality(args: unknown) {
    const input = EvaluateItemDataQualityInputSchema.parse(args);
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const filter = input.filter ?? "";

    const findingsByUpc = new Map<string, ItemIssueAccumulator>();
    let scannedItems = 0;
    let scannedPages = 0;

    const firstPageRaw = await sanaApiClient.request<unknown>(
      buildItemSearchPath(0, pageSize, filter)
    );
    const firstPage = RawItemPageSchema.parse(firstPageRaw);

    const maxPages = input.maxPages
      ? Math.min(firstPage.totalPages, input.maxPages)
      : firstPage.totalPages;
    const totalPagesToScan = firstPage.totalPages === 0 ? 0 : Math.max(maxPages, 1);

    const scanRows = (rows: RawItemRow[]) => {
      scannedItems += rows.length;
      for (const row of rows) {
        const issue = collectIssuesForRow(row);
        if (issue) {
          mergeIssue(findingsByUpc, issue);
        }
      }
    };

    if (totalPagesToScan > 0) {
      scannedPages += 1;
      scanRows(firstPage.itemsWithQuantity);
    }

    for (let page = 1; page < totalPagesToScan; page += 1) {
      const pageRaw = await sanaApiClient.request<unknown>(
        buildItemSearchPath(page, pageSize, filter)
      );
      const parsedPage = RawItemPageSchema.parse(pageRaw);
      scannedPages += 1;
      scanRows(parsedPage.itemsWithQuantity);
    }

    const flaggedItems: ItemDataQualityIssue[] = [...findingsByUpc.values()]
      .sort((a, b) => a.upc.localeCompare(b.upc))
      .map((entry) => ({
        upc: entry.upc,
        name: entry.name,
        description: [...entry.issues].sort().join("; "),
      }));

    const structuredContent: EvaluateItemDataQualityResponse =
      EvaluateItemDataQualityResponseSchema.parse({
        scannedItems,
        scannedPages,
        flaggedItemCount: flaggedItems.length,
        flaggedItems,
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
