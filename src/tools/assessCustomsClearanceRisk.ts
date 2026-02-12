import {
  AssessCustomsClearanceRiskResponseSchema,
  AssessCustomsClearanceRiskSchema,
  FetchTripResponseSchema,
  TripStatus,
} from "../models.js";
import type {
  AssessCustomsClearanceRiskResponse,
  CustomsClearanceRiskFinding,
  CustomsClearanceRiskBreakdown,
  FetchTripResponse,
} from "../models.js";
import { SanaApiClient, SanaApiRequestError } from "../sanaApi.js";

const DEFAULT_MIN_SHELF_LIFE_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTripDateToUtc(dateString: string): Date {
  const parsed = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid trip date format: ${dateString}`);
  }

  return parsed;
}

function parseTripItemExpirationToUtc(dateString: string): Date {
  const [monthPart, yearPart] = dateString.split("/");
  const month = Number(monthPart);
  const year = Number(yearPart);

  if (!Number.isInteger(month) || !Number.isInteger(year)) {
    throw new Error(`Invalid expiration date format: ${dateString}`);
  }

  // MM/YYYY convention is treated as valid through the end of that month.
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function getTodayUtcStart(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function buildDataGapFinding(
  message: string,
  recommendedAction: string,
  item?: FetchTripResponse["items"][number]
): CustomsClearanceRiskFinding {
  return {
    severity: "MEDIUM",
    type: "DATA_GAP",
    upc: item?.upc,
    itemName: item?.name,
    lotNumber: item?.lotNumber,
    expirationDate: item?.expirationDate,
    inventoryId: item?.inventoryId,
    message,
    recommendedAction,
  };
}

function getItemKey(item: FetchTripResponse["items"][number]): string {
  if (item.inventoryId !== undefined && item.inventoryId !== null) {
    return `inventory:${item.inventoryId}`;
  }

  return `item:${item.boxNumber}|${item.upc}|${item.lotNumber}|${item.expirationDate}`;
}

type ExpirationFindingDetail = {
  boxNumber: number;
  itemName?: string;
  expirationDate: string;
  expirationUtc: Date;
};

export function createAssessCustomsClearanceRiskHandler(
  sanaApiClient: SanaApiClient
) {
  return async function assessCustomsClearanceRisk(args: unknown) {
    const input = AssessCustomsClearanceRiskSchema.parse(args);
    const minShelfLifeDays =
      input.minShelfLifeDays ?? DEFAULT_MIN_SHELF_LIFE_DAYS;
    const includeWarnings = input.includeWarnings ?? true;

    let tripResponse: FetchTripResponse;
    try {
      tripResponse = await sanaApiClient.request<FetchTripResponse>(
        `/trip/${input.tripId}`
      );
    } catch (error) {
      if (error instanceof SanaApiRequestError && error.status === 404) {
        throw new Error(`Trip ${input.tripId} not found`);
      }

      throw error;
    }

    const tripData = FetchTripResponseSchema.parse(tripResponse);
    const tripCountryCode = input.countryCode ?? tripData.trip.countryCode;

    const status = tripData.trip.status;
    if (status !== TripStatus.Packing && status !== TripStatus.Packed) {
      throw new Error(
        `Trip ${input.tripId} is not eligible. Status must be PACKING or PACKED.`
      );
    }

    const tripStartDateUtc = parseTripDateToUtc(tripData.trip.startDate);
    const todayUtc = getTodayUtcStart();
    if (tripStartDateUtc < todayUtc) {
      throw new Error(
        `Trip ${input.tripId} is not eligible. Trip has already started on ${tripData.trip.startDate}.`
      );
    }

    const requiredExpirationUtc = addDaysUtc(tripStartDateUtc, minShelfLifeDays);
    const allFindings: CustomsClearanceRiskFinding[] = [];
    const expirationFindingDetails: ExpirationFindingDetail[] = [];
    const failedItemKeys = new Set<string>();

    if (tripData.items.length === 0) {
      allFindings.push(
        buildDataGapFinding(
          "Trip has no packed medication items to assess.",
          "Validate the packing list and reassess before customs review."
        )
      );
    }

    for (const item of tripData.items) {
      if (!item.lotNumber?.trim()) {
        failedItemKeys.add(getItemKey(item));
        allFindings.push(
          buildDataGapFinding(
            "Medication item is missing lot number required for customs traceability.",
            "Populate lot number in trip packing data before departure.",
            item
          )
        );
      }

      if (!item.expirationDate?.trim()) {
        failedItemKeys.add(getItemKey(item));
        allFindings.push(
          buildDataGapFinding(
            "Medication item is missing expiration date required for customs review.",
            "Populate expiration date in MM/YYYY before departure.",
            item
          )
        );
        continue;
      }

      const itemExpirationUtc = parseTripItemExpirationToUtc(item.expirationDate);
      if (itemExpirationUtc < requiredExpirationUtc) {
        failedItemKeys.add(getItemKey(item));

        allFindings.push({
          severity: "HIGH",
          type: "EXPIRATION",
          upc: item.upc,
          itemName: item.name,
          lotNumber: item.lotNumber,
          expirationDate: item.expirationDate,
          inventoryId: item.inventoryId,
          message: `Item expires before required customs window. Expiration ${item.expirationDate} is earlier than ${minShelfLifeDays} days after trip start date ${tripData.trip.startDate}.`,
          recommendedAction:
            "Replace with a lot that has longer shelf life or remove from shipment.",
        });

        expirationFindingDetails.push({
          boxNumber: item.boxNumber,
          itemName: item.name,
          expirationDate: item.expirationDate,
          expirationUtc: itemExpirationUtc,
        });
      }
    }

    const hasDataGaps = allFindings.some((f) => f.severity === "MEDIUM");
    const failedItemsCount = failedItemKeys.size;
    const assessment = failedItemsCount === 0 ? "PASS" : "FAIL";

    const findings = includeWarnings
      ? allFindings
      : allFindings.filter((f) => f.severity === "HIGH");

    const nextSteps: string[] = [];
    if (failedItemsCount > 0) {
      nextSteps.push(
        "Resolve failed item findings before shipment and reassess customs risk."
      );
    }
    if (hasDataGaps) {
      nextSteps.push(
        "Review MEDIUM-risk data gaps with pharmacy operations before departure."
      );
    }
    if (tripData.items.length === 0) {
      nextSteps.push(
        "Pack medication items and rerun customs risk assessment before travel."
      );
    }
    if (nextSteps.length === 0) {
      nextSteps.push(
        "No customs blocking issues detected under the current 6-month shelf-life policy."
      );
    }

    const expirationBucketCounts = new Map<string, number>();
    for (const detail of expirationFindingDetails) {
      expirationBucketCounts.set(
        detail.expirationDate,
        (expirationBucketCounts.get(detail.expirationDate) ?? 0) + 1
      );
    }

    const expirationFindingsByMonth = [...expirationBucketCounts.entries()]
      .map(([expirationMonth, count]) => ({ expirationMonth, count }))
      .sort(
        (a, b) =>
          parseTripItemExpirationToUtc(a.expirationMonth).getTime() -
          parseTripItemExpirationToUtc(b.expirationMonth).getTime()
      );

    const failedItemsByBoxMap = new Map<
      number,
      Map<
        string,
        {
          itemName: string;
          expirationDate: string;
          instances: number;
          expirationUtc: Date;
        }
      >
    >();

    const sortedExpirationDetails = [...expirationFindingDetails].sort(
      (a, b) =>
        a.boxNumber - b.boxNumber ||
        a.expirationUtc.getTime() - b.expirationUtc.getTime()
    );

    for (const detail of sortedExpirationDetails) {
      const boxItems = failedItemsByBoxMap.get(detail.boxNumber) ?? new Map();
      const normalizedItemName = (detail.itemName ?? "Unknown medication").trim();
      const aggregationKey = `${normalizedItemName}|${detail.expirationDate}`;
      const existing = boxItems.get(aggregationKey);
      if (existing) {
        existing.instances += 1;
      } else {
        boxItems.set(aggregationKey, {
          itemName: normalizedItemName,
          expirationDate: detail.expirationDate,
          instances: 1,
          expirationUtc: detail.expirationUtc,
        });
      }
      failedItemsByBoxMap.set(detail.boxNumber, boxItems);
    }

    const failedItemsByBox = [...failedItemsByBoxMap.entries()]
      .sort(([boxA], [boxB]) => boxA - boxB)
      .map(([boxNumber, items]) => ({
        boxNumber,
        items: [...items.values()]
          .sort(
            (a, b) =>
              a.expirationUtc.getTime() - b.expirationUtc.getTime() ||
              a.itemName.localeCompare(b.itemName)
          )
          .map(({ expirationUtc, ...item }) => item),
      }));

    const breakdown: CustomsClearanceRiskBreakdown = {
      totalExpirationFindings: expirationFindingDetails.length,
      expirationFindingsByMonth,
      failedItemsByBox,
    };

    const structuredContent: AssessCustomsClearanceRiskResponse =
      AssessCustomsClearanceRiskResponseSchema.parse({
        trip: {
          ...tripData.trip,
          countryCode: tripCountryCode,
        },
        summary: {
          assessment,
          totalItems: tripData.items.length,
          failedItemsCount,
        },
        breakdown,
        findings,
        nextSteps,
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
