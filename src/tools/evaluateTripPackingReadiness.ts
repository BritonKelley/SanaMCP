import {
  EvaluateTripPackingReadinessInputSchema,
  EvaluateTripPackingReadinessResponseSchema,
  FetchTripResponseSchema,
  TripStatus,
} from "../models.js";
import type {
  EvaluateTripPackingReadinessResponse,
  FetchTripResponse,
  TripPackingReadinessCheck,
} from "../models.js";
import { SanaApiClient, SanaApiRequestError } from "../sanaApi.js";
import {
  ALBENDAZOLE_KEYWORDS,
  ALLERGY_RESPIRATORY_CATEGORIES,
  ANTIBIOTIC_TYPES,
  ASPIRIN_KEYWORDS,
  CATEGORIES,
  CEFTRIAXONE_KEYWORDS,
  CRITICAL_MEDICATION_LABELS,
  DEFAULT_SHELF_LIFE_DAYS,
  ESSENTIAL_MEDICATION_EXPECTATIONS,
  HIGH_DOSE_VITAMIN_A_DOSE_TOKEN,
  HIGH_DOSE_VITAMIN_A_KEYWORDS,
  HIGH_PARASITE_PREVALENCE_COUNTRY_CODES,
  HYDROCORTISONE_KEYWORDS,
  INFANT_DROP_VITAMIN_KEYWORDS,
  INJECTABLE_PRESENTATIONS,
  LIQUID_OR_CHEWABLE_PRESENTATIONS,
  MALARIA_ENDEMIC_COUNTRY_CODES,
  MALARIA_TREATMENT_KEYWORDS,
  MS_PER_DAY,
  ORAL_ANTI_INFECTIVE_PRESENTATIONS,
  PEDIATRIC_NAME_KEYWORDS,
  PEDIATRIC_VITAMIN_KEYWORDS,
  READINESS_THRESHOLDS,
  RULES,
  SODIUM_CHLORIDE_DILUENT_KEYWORDS,
  SOLID_PRESENTATIONS,
  TOPICAL_ANTIBIOTIC_KEYWORDS,
  TOPICAL_ANTIFUNGAL_KEYWORDS,
  UNKNOWN_MEDICATION_NAME,
  WOUND_CARE_KEYWORDS,
} from "./evaluationConstants.js";

type RuleStatus = "PASS" | "WARN" | "FAIL";
type ExpiredTripMedicationLocation = {
  itemName: string;
  boxNumber: number;
  expirationDate: string;
  instances: number;
};

function normalize(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function includesAny(text: string, keywords: readonly string[]): boolean {
  const normalized = normalize(text);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function hasKeywordInAnyField(
  item: FetchTripResponse["items"][number],
  keywords: readonly string[]
): boolean {
  const haystack = `${item.name ?? ""} ${item.brand ?? ""} ${item.dose ?? ""} ${
    item.presentation ?? ""
  }`;
  return includesAny(haystack, keywords);
}

function isCategory(item: FetchTripResponse["items"][number], category: string): boolean {
  return normalize(item.category) === normalize(category);
}

function isAnyCategory(
  item: FetchTripResponse["items"][number],
  categories: readonly string[]
): boolean {
  return categories.some((category) => isCategory(item, category));
}

function hasPresentation(
  item: FetchTripResponse["items"][number],
  presentations: Set<string>
): boolean {
  return presentations.has(normalize(item.presentation));
}

function asNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function sumQuantity(
  items: FetchTripResponse["items"],
  predicate: (item: FetchTripResponse["items"][number]) => boolean
): number {
  return items.reduce((total, item) => {
    if (!predicate(item)) {
      return total;
    }
    return total + asNonNegativeNumber(item.quantity);
  }, 0);
}

function countDistinctNames(
  items: FetchTripResponse["items"],
  predicate: (item: FetchTripResponse["items"][number]) => boolean
): number {
  const names = new Set<string>();
  for (const item of items) {
    if (!predicate(item)) {
      continue;
    }
    const normalizedName = normalize(item.name);
    if (normalizedName) {
      names.add(normalizedName);
    }
  }
  return names.size;
}

function evaluateRangeStatus(
  value: number,
  failMin: number,
  warnMin: number,
  warnMax?: number
): RuleStatus {
  if (value < failMin) {
    return "FAIL";
  }
  const belowPreferred = value < warnMin;
  const abovePreferred = typeof warnMax === "number" ? value > warnMax : false;
  if (belowPreferred || abovePreferred) {
    return "WARN";
  }
  return "PASS";
}

function parseTripDateToUtc(dateString: string): Date {
  const parsed = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid trip date format: ${dateString}`);
  }

  return parsed;
}

function parseExpirationMonthEndUtc(dateString: string): Date {
  const [monthPart, yearPart] = dateString.split("/");
  const month = Number(monthPart);
  const year = Number(yearPart);
  if (!Number.isInteger(month) || !Number.isInteger(year)) {
    throw new Error(`Invalid expiration date format: ${dateString}`);
  }

  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function isPediatricSignal(item: FetchTripResponse["items"][number]): boolean {
  const name = normalize(item.name);
  const dose = normalize(item.dose);
  return (
    PEDIATRIC_NAME_KEYWORDS.some((keyword) => name.includes(keyword)) ||
    dose.includes("/5ml") ||
    dose.includes("/ml")
  );
}

function estimateTabletLikeUnits(item: FetchTripResponse["items"][number]): number {
  const quantity = Number(item.quantity ?? 0);
  const productAmount = Number(item.productAmount ?? 0);
  const unit = normalize(item.productAmountUnit);
  const unitIsTabletLike = unit.includes("tablet") || unit.includes("capsule");
  if (!Number.isFinite(quantity) || !Number.isFinite(productAmount)) {
    return 0;
  }

  if (unitIsTabletLike) {
    return quantity * productAmount;
  }

  return quantity;
}

function createCheck(
  ruleId: string,
  ruleName: string,
  status: RuleStatus,
  message: string,
  recommendedAction?: string,
  evidence?: unknown
): TripPackingReadinessCheck {
  return {
    ruleId,
    ruleName,
    status,
    message,
    recommendedAction,
    evidence,
  };
}

export function createEvaluateTripPackingReadinessHandler(
  sanaApiClient: SanaApiClient
) {
  return async function evaluateTripPackingReadiness(args: unknown) {
    const input = EvaluateTripPackingReadinessInputSchema.parse(args);
    const shelfLifeDays = input.shelfLifeDays ?? DEFAULT_SHELF_LIFE_DAYS;
    const includeEvidence = input.includeEvidence ?? true;

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
    const items = tripData.items;
    const checks: TripPackingReadinessCheck[] = [];

    const tripStatus = tripData.trip.status;
    if (tripStatus === TripStatus.Packed) {
      checks.push(
        createCheck(
          RULES.TRIP_STATUS.ID,
          RULES.TRIP_STATUS.NAME,
          "PASS",
          "Trip status is PACKED."
        )
      );
    } else if (tripStatus === TripStatus.Packing) {
      checks.push(
        createCheck(
          RULES.TRIP_STATUS.ID,
          RULES.TRIP_STATUS.NAME,
          "WARN",
          "Trip status is PACKING and may still be in progress.",
          "Complete packing workflow and confirm status is PACKED before departure."
        )
      );
    } else {
      checks.push(
        createCheck(
          RULES.TRIP_STATUS.ID,
          RULES.TRIP_STATUS.NAME,
          "FAIL",
          `Trip status is ${tripStatus ?? "UNKNOWN"}, not PACKED.`,
          "Move trip to PACKED status only after required packing checks pass."
        )
      );
    }

    const hasAnalgesics = items.some((item) =>
      isCategory(item, CATEGORIES.ANALGESICS)
    );
    const hasAntiInfectives = items.some((item) =>
      isCategory(item, CATEGORIES.ANTI_INFECTIVES)
    );
    const hasAllergyResp = items.some((item) =>
      isAnyCategory(item, ALLERGY_RESPIRATORY_CATEGORIES)
    );
    const hasTopical = items.some((item) => isCategory(item, CATEGORIES.TOPICAL));
    const hasGi = items.some((item) => isCategory(item, CATEGORIES.GI));
    const hasVitamins = items.some((item) => isCategory(item, CATEGORIES.VITAMINS));
    const hasCardiac = items.some((item) => isCategory(item, CATEGORIES.CARDIAC));

    const missingCore: string[] = [];
    if (!hasAnalgesics) missingCore.push(CATEGORIES.ANALGESICS);
    if (!hasAntiInfectives) missingCore.push(CATEGORIES.ANTI_INFECTIVES);
    if (!hasAllergyResp) missingCore.push("Allergy/Respiratory");
    if (!hasTopical) missingCore.push(CATEGORIES.TOPICAL);
    if (!hasGi) missingCore.push(CATEGORIES.GI);
    if (!hasVitamins) missingCore.push(CATEGORIES.VITAMINS);
    if (!hasCardiac) missingCore.push(CATEGORIES.CARDIAC);

    checks.push(
      missingCore.length === 0
        ? createCheck(
            RULES.CORE_CATEGORIES.ID,
            RULES.CORE_CATEGORIES.NAME,
            "PASS",
            "All 7 core categories are represented."
          )
        : createCheck(
            RULES.CORE_CATEGORIES.ID,
            RULES.CORE_CATEGORIES.NAME,
            "FAIL",
            `Missing core categories: ${missingCore.join(", ")}.`,
            "Pack medications for each missing core category before final readiness approval.",
            includeEvidence ? { missingCoreCategories: missingCore } : undefined
          )
    );

    const missingMedications: string[] = [];
    for (const expectation of ESSENTIAL_MEDICATION_EXPECTATIONS) {
      const found = items.some(
        (item) =>
          (!expectation.category || isCategory(item, expectation.category)) &&
          hasKeywordInAnyField(item, expectation.keywords)
      );
      if (!found) {
        missingMedications.push(expectation.label);
      }
    }
    const missingCriticalMedications = missingMedications.filter((medication) =>
      CRITICAL_MEDICATION_LABELS.has(medication)
    );

    checks.push(
      createCheck(
        RULES.NAMED_MEDICATIONS.ID,
        RULES.NAMED_MEDICATIONS.NAME,
        missingCriticalMedications.length > 0
          ? "FAIL"
          : missingMedications.length > 0
          ? "WARN"
          : "PASS",
        missingMedications.length === 0
          ? "Named medication baseline is covered across core categories."
          : `Missing named medications: ${missingMedications.join(", ")}.`,
        missingMedications.length > 0
          ? "Add the missing named medications to close category-level clinical gaps."
          : undefined,
        includeEvidence
          ? {
              missingMedications,
              missingCriticalMedications,
            }
          : undefined
      )
    );

    const hasAnalgesicAdultSolid = items.some(
      (item) =>
        isCategory(item, CATEGORIES.ANALGESICS) &&
        hasPresentation(item, SOLID_PRESENTATIONS)
    );
    const hasAnalgesicPediatricLiquidOrChewable = items.some(
      (item) =>
        isCategory(item, CATEGORIES.ANALGESICS) &&
        hasPresentation(item, LIQUID_OR_CHEWABLE_PRESENTATIONS)
    );
    const hasAllergyRespPediatricLiquidOrChewable = items.some(
      (item) =>
        isAnyCategory(item, ALLERGY_RESPIRATORY_CATEGORIES) &&
        hasPresentation(item, LIQUID_OR_CHEWABLE_PRESENTATIONS)
    );
    const hasAntiInfectiveOralCoverage = items.some(
      (item) =>
        isCategory(item, CATEGORIES.ANTI_INFECTIVES) &&
        hasPresentation(item, ORAL_ANTI_INFECTIVE_PRESENTATIONS)
    );
    const hasTopicalAntifungal = items.some(
      (item) =>
        isCategory(item, CATEGORIES.TOPICAL) &&
        hasKeywordInAnyField(item, TOPICAL_ANTIFUNGAL_KEYWORDS)
    );
    const hasTopicalAntibiotic = items.some(
      (item) =>
        isAnyCategory(item, [CATEGORIES.TOPICAL, CATEGORIES.ANTI_INFECTIVES]) &&
        hasKeywordInAnyField(item, TOPICAL_ANTIBIOTIC_KEYWORDS)
    );

    const formulationGaps: string[] = [];
    if (!hasAnalgesicAdultSolid) {
      formulationGaps.push("Adult solid analgesic formulation");
    }
    if (!hasAnalgesicPediatricLiquidOrChewable) {
      formulationGaps.push("Pediatric liquid/chewable analgesic formulation");
    }
    if (!hasAllergyRespPediatricLiquidOrChewable) {
      formulationGaps.push("Pediatric liquid/chewable allergy/respiratory formulation");
    }
    if (!hasAntiInfectiveOralCoverage) {
      formulationGaps.push("Oral anti-infective formulation coverage");
    }
    if (!hasTopicalAntifungal) {
      formulationGaps.push("Topical antifungal coverage");
    }
    if (!hasTopicalAntibiotic) {
      formulationGaps.push("Topical antibiotic coverage");
    }

    const hasCriticalFormulationGap =
      !hasAnalgesicAdultSolid || !hasAnalgesicPediatricLiquidOrChewable;
    const formulationStatus: RuleStatus =
      formulationGaps.length === 0
        ? "PASS"
        : hasCriticalFormulationGap ||
          formulationGaps.length >= READINESS_THRESHOLDS.FORMULATION_CRITICAL_GAP_COUNT
        ? "FAIL"
        : "WARN";

    checks.push(
      createCheck(
        RULES.FORMULATION.ID,
        RULES.FORMULATION.NAME,
        formulationStatus,
        formulationGaps.length
          ? `Missing formulation coverage: ${formulationGaps.join(", ")}.`
          : "Coverage includes expected adult/pediatric and topical formulation patterns.",
        formulationGaps.length
          ? "Add the missing formulations to improve practical clinical usability across adult and pediatric cases."
          : undefined,
        includeEvidence
          ? {
              missingFormulationCoverage: formulationGaps,
            }
          : undefined
      )
    );

    const pediatricFormulationCount = items.filter((item) => {
      if (!hasPresentation(item, LIQUID_OR_CHEWABLE_PRESENTATIONS)) {
        return false;
      }
      return (
        isPediatricSignal(item) ||
        isAnyCategory(item, [
          CATEGORIES.ANALGESICS,
          CATEGORIES.ALLERGY,
          CATEGORIES.RESPIRATORY,
          CATEGORIES.VITAMINS,
        ])
      );
    }).length;

    const hasPediatricAnalgesic = hasAnalgesicPediatricLiquidOrChewable;
    const hasPediatricAllergyResp = hasAllergyRespPediatricLiquidOrChewable;
    const hasPediatricVitamins = items.some(
      (item) =>
        isCategory(item, CATEGORIES.VITAMINS) &&
        (hasKeywordInAnyField(item, PEDIATRIC_VITAMIN_KEYWORDS) ||
          hasPresentation(item, LIQUID_OR_CHEWABLE_PRESENTATIONS))
    );

    let pediatricConfidence = 0;
    if (hasPediatricAnalgesic) {
      pediatricConfidence += READINESS_THRESHOLDS.PEDIATRIC_CONFIDENCE.ANALGESIC_WEIGHT;
    }
    if (hasPediatricAllergyResp) {
      pediatricConfidence += READINESS_THRESHOLDS.PEDIATRIC_CONFIDENCE.ALLERGY_RESP_WEIGHT;
    }
    if (hasPediatricVitamins) {
      pediatricConfidence += READINESS_THRESHOLDS.PEDIATRIC_CONFIDENCE.VITAMIN_WEIGHT;
    }
    if (
      pediatricFormulationCount >=
      READINESS_THRESHOLDS.PEDIATRIC_CONFIDENCE.HIGH_FORMULATION_COUNT
    ) {
      pediatricConfidence +=
        READINESS_THRESHOLDS.PEDIATRIC_CONFIDENCE.HIGH_FORMULATION_WEIGHT;
    } else if (
      pediatricFormulationCount >=
      READINESS_THRESHOLDS.PEDIATRIC_CONFIDENCE.MID_FORMULATION_COUNT
    ) {
      pediatricConfidence +=
        READINESS_THRESHOLDS.PEDIATRIC_CONFIDENCE.MID_FORMULATION_WEIGHT;
    }
    pediatricConfidence = Math.min(1, Number(pediatricConfidence.toFixed(2)));
    const pediatricConfidencePercent = Number(
      (pediatricConfidence * 100).toFixed(0)
    );

    const pediatricStatus: RuleStatus =
      pediatricConfidence >= READINESS_THRESHOLDS.PEDIATRIC_CONFIDENCE.PASS
        ? "PASS"
        : pediatricConfidence >= READINESS_THRESHOLDS.PEDIATRIC_CONFIDENCE.WARN
        ? "WARN"
        : "FAIL";

    checks.push(
      createCheck(
        RULES.PEDIATRIC.ID,
        RULES.PEDIATRIC.NAME,
        pediatricStatus,
        `Pediatric readiness confidence is ${pediatricConfidencePercent}% based on available liquid/chewable coverage.`,
        pediatricStatus === "PASS"
          ? undefined
          : "Increase pediatric liquid/chewable and infant-friendly formulations in key categories.",
        includeEvidence
          ? {
              pediatricFormulationCount,
              hasPediatricAnalgesic,
              hasPediatricAllergyResp,
              hasPediatricVitamins,
              confidencePercent: pediatricConfidencePercent,
            }
          : undefined
      )
    );

    const acetaminophenPresentations = new Set<string>();
    const ibuprofenPresentations = new Set<string>();
    for (const item of items) {
      const name = normalize(item.name);
      const presentation = normalize(item.presentation) || "unknown";
      if (name.includes("acetaminophen")) {
        acetaminophenPresentations.add(presentation);
      }
      if (name.includes("ibuprofen")) {
        ibuprofenPresentations.add(presentation);
      }
    }

    const acetaminophenFormulationCount = acetaminophenPresentations.size;
    const ibuprofenFormulationCount = ibuprofenPresentations.size;
    const commonFormulationStatus: RuleStatus =
      acetaminophenFormulationCount <=
        READINESS_THRESHOLDS.COMMON_MEDICATION_FORMULATIONS.FAIL_MAX_DISTINCT ||
      ibuprofenFormulationCount <=
        READINESS_THRESHOLDS.COMMON_MEDICATION_FORMULATIONS.FAIL_MAX_DISTINCT
        ? "FAIL"
        : acetaminophenFormulationCount <
            READINESS_THRESHOLDS.COMMON_MEDICATION_FORMULATIONS.ACETAMINOPHEN_TARGET_MIN ||
          acetaminophenFormulationCount >
            READINESS_THRESHOLDS.COMMON_MEDICATION_FORMULATIONS.ACETAMINOPHEN_TARGET_MAX ||
          ibuprofenFormulationCount <
            READINESS_THRESHOLDS.COMMON_MEDICATION_FORMULATIONS.IBUPROFEN_TARGET_MIN ||
          ibuprofenFormulationCount >
            READINESS_THRESHOLDS.COMMON_MEDICATION_FORMULATIONS.IBUPROFEN_TARGET_MAX
        ? "WARN"
        : "PASS";

    checks.push(
      createCheck(
        RULES.COMMON_FORMULATION_DIVERSITY.ID,
        RULES.COMMON_FORMULATION_DIVERSITY.NAME,
        commonFormulationStatus,
        `Acetaminophen formulations: ${acetaminophenFormulationCount} (target ${READINESS_THRESHOLDS.COMMON_MEDICATION_FORMULATIONS.ACETAMINOPHEN_TARGET_MIN}-${READINESS_THRESHOLDS.COMMON_MEDICATION_FORMULATIONS.ACETAMINOPHEN_TARGET_MAX}); Ibuprofen formulations: ${ibuprofenFormulationCount} (target ${READINESS_THRESHOLDS.COMMON_MEDICATION_FORMULATIONS.IBUPROFEN_TARGET_MIN}-${READINESS_THRESHOLDS.COMMON_MEDICATION_FORMULATIONS.IBUPROFEN_TARGET_MAX}).`,
        commonFormulationStatus === "PASS"
          ? undefined
          : "Add additional formulations for acetaminophen and/or ibuprofen to improve adult and pediatric dispensing flexibility.",
        includeEvidence
          ? {
              acetaminophenPresentations: [...acetaminophenPresentations],
              ibuprofenPresentations: [...ibuprofenPresentations],
            }
          : undefined
      )
    );

    const recognizedAntibioticTypes = new Set<string>();
    for (const item of items) {
      if (!isCategory(item, CATEGORIES.ANTI_INFECTIVES)) {
        continue;
      }
      const name = normalize(item.name);
      for (const antibiotic of ANTIBIOTIC_TYPES) {
        if (antibiotic.keywords.some((keyword) => name.includes(keyword))) {
          recognizedAntibioticTypes.add(antibiotic.type);
        }
      }
    }

    const antibioticTypeCount = recognizedAntibioticTypes.size;
    const antibioticDiversityStatus: RuleStatus =
      antibioticTypeCount < READINESS_THRESHOLDS.ANTIBIOTIC_DIVERSITY.FAIL_MIN
        ? "FAIL"
        : antibioticTypeCount < READINESS_THRESHOLDS.ANTIBIOTIC_DIVERSITY.WARN_MIN ||
          antibioticTypeCount > READINESS_THRESHOLDS.ANTIBIOTIC_DIVERSITY.WARN_MAX
        ? "WARN"
        : "PASS";

    checks.push(
      createCheck(
        RULES.ANTIBIOTIC_DIVERSITY.ID,
        RULES.ANTIBIOTIC_DIVERSITY.NAME,
        antibioticDiversityStatus,
        `Recognized antibiotic types: ${antibioticTypeCount}.`,
        antibioticDiversityStatus === "PASS"
          ? undefined
          : "Increase distinct antibiotic types (oral/topical/injectable) to improve infection-treatment coverage.",
        includeEvidence
          ? {
              antibioticTypes: [...recognizedAntibioticTypes].sort(),
            }
          : undefined
      )
    );

    const topicalCoverageStatus: RuleStatus =
      hasTopicalAntifungal && hasTopicalAntibiotic ? "PASS" : "FAIL";
    checks.push(
      createCheck(
        RULES.TOPICAL_ANTIFUNGAL_ANTIBIOTIC.ID,
        RULES.TOPICAL_ANTIFUNGAL_ANTIBIOTIC.NAME,
        topicalCoverageStatus,
        hasTopicalAntifungal && hasTopicalAntibiotic
          ? "Topical antifungal and topical antibiotic coverage present."
          : "Missing topical antifungal and/or topical antibiotic coverage.",
        hasTopicalAntifungal && hasTopicalAntibiotic
          ? undefined
          : "Add clotrimazole (or equivalent antifungal) and triple-antibiotic style topical coverage.",
        includeEvidence
          ? {
              hasTopicalAntifungal,
              hasTopicalAntibiotic,
            }
          : undefined
      )
    );

    const hasHydrocortisone = items.some(
      (item) =>
        isCategory(item, CATEGORIES.TOPICAL) &&
        hasKeywordInAnyField(item, HYDROCORTISONE_KEYWORDS)
    );
    const hasWoundCare = items.some(
      (item) =>
        isCategory(item, CATEGORIES.TOPICAL) &&
        hasKeywordInAnyField(item, WOUND_CARE_KEYWORDS)
    );
    const topicalDepthStatus: RuleStatus =
      !hasHydrocortisone && !hasWoundCare
        ? "FAIL"
        : !hasHydrocortisone || !hasWoundCare
        ? "WARN"
        : "PASS";
    checks.push(
      createCheck(
        RULES.TOPICAL_DEPTH.ID,
        RULES.TOPICAL_DEPTH.NAME,
        topicalDepthStatus,
        `Hydrocortisone present: ${hasHydrocortisone ? "yes" : "no"}; wound-care topical coverage present: ${
          hasWoundCare ? "yes" : "no"
        }.`,
        topicalDepthStatus === "PASS"
          ? undefined
          : "Add hydrocortisone and wound-care topical medications (A&D/petroleum jelly/triple-antibiotic style products).",
        includeEvidence
          ? {
              hasHydrocortisone,
              hasWoundCare,
            }
          : undefined
      )
    );

    const giDistinctMedicationCount = countDistinctNames(items, (item) =>
      isCategory(item, CATEGORIES.GI)
    );
    const giCoverageStatus = evaluateRangeStatus(
      giDistinctMedicationCount,
      READINESS_THRESHOLDS.GI_DISTINCT_COUNT.FAIL_MIN,
      READINESS_THRESHOLDS.GI_DISTINCT_COUNT.WARN_MIN,
      READINESS_THRESHOLDS.GI_DISTINCT_COUNT.WARN_MAX
    );
    checks.push(
      createCheck(
        RULES.GI_DEPTH.ID,
        RULES.GI_DEPTH.NAME,
        giCoverageStatus,
        `Distinct GI medications: ${giDistinctMedicationCount} (target ${READINESS_THRESHOLDS.GI_DISTINCT_COUNT.WARN_MIN}-${READINESS_THRESHOLDS.GI_DISTINCT_COUNT.WARN_MAX}).`,
        giCoverageStatus === "PASS"
          ? undefined
          : "Adjust GI mix to maintain at least 4 distinct medications (acid reducer, antacid, anti-diarrheal, laxative coverage).",
        includeEvidence
          ? {
              giDistinctMedicationCount,
            }
          : undefined
      )
    );

    const cardiacDistinctMedicationCount = countDistinctNames(items, (item) =>
      isCategory(item, CATEGORIES.CARDIAC)
    );
    const hasAspirin81 = items.some(
      (item) =>
        isCategory(item, CATEGORIES.CARDIAC) &&
        hasKeywordInAnyField(item, ASPIRIN_KEYWORDS) &&
        normalize(item.dose).includes("81")
    );
    const cardiacCoverageStatus: RuleStatus =
      cardiacDistinctMedicationCount < READINESS_THRESHOLDS.CARDIAC_DISTINCT_COUNT.FAIL_MIN
        ? "FAIL"
        : !hasAspirin81 ||
          cardiacDistinctMedicationCount <
            READINESS_THRESHOLDS.CARDIAC_DISTINCT_COUNT.WARN_MIN ||
          cardiacDistinctMedicationCount >
            READINESS_THRESHOLDS.CARDIAC_DISTINCT_COUNT.WARN_MAX
        ? "WARN"
        : "PASS";
    checks.push(
      createCheck(
        RULES.CARDIAC_DEPTH.ID,
        RULES.CARDIAC_DEPTH.NAME,
        cardiacCoverageStatus,
        `Distinct cardiac medications: ${cardiacDistinctMedicationCount} (target ${READINESS_THRESHOLDS.CARDIAC_DISTINCT_COUNT.WARN_MIN}-${READINESS_THRESHOLDS.CARDIAC_DISTINCT_COUNT.WARN_MAX}). Aspirin 81mg present: ${
          hasAspirin81 ? "yes" : "no"
        }.`,
        cardiacCoverageStatus === "PASS"
          ? undefined
          : "Increase cardiac medication breadth and confirm aspirin 81mg availability.",
        includeEvidence
          ? {
              cardiacDistinctMedicationCount,
              hasAspirin81,
            }
          : undefined
      )
    );

    const ceftriaxoneVialCount = sumQuantity(
      items,
      (item) =>
        isCategory(item, CATEGORIES.ANTI_INFECTIVES) &&
        hasKeywordInAnyField(item, CEFTRIAXONE_KEYWORDS) &&
        hasPresentation(item, INJECTABLE_PRESENTATIONS)
    );
    const sodiumChlorideDiluentCount = sumQuantity(items, (item) =>
      hasKeywordInAnyField(item, SODIUM_CHLORIDE_DILUENT_KEYWORDS)
    );
    const injectableReadinessStatus: RuleStatus =
      ceftriaxoneVialCount === 0 || sodiumChlorideDiluentCount === 0
        ? "FAIL"
        : ceftriaxoneVialCount < READINESS_THRESHOLDS.INJECTABLE_CEFTRIAXONE.WARN_MIN ||
          ceftriaxoneVialCount > READINESS_THRESHOLDS.INJECTABLE_CEFTRIAXONE.WARN_MAX
        ? "WARN"
        : "PASS";
    checks.push(
      createCheck(
        RULES.INJECTABLE.ID,
        RULES.INJECTABLE.NAME,
        injectableReadinessStatus,
        `Ceftriaxone injectable vials: ${ceftriaxoneVialCount} (target ${READINESS_THRESHOLDS.INJECTABLE_CEFTRIAXONE.WARN_MIN}-${READINESS_THRESHOLDS.INJECTABLE_CEFTRIAXONE.WARN_MAX}). Sodium Chloride 0.9% dilution items: ${sodiumChlorideDiluentCount}.`,
        injectableReadinessStatus === "PASS"
          ? undefined
          : "Ensure Ceftriaxone injectable stock is in range and include Sodium Chloride 0.9% for dilution.",
        includeEvidence
          ? {
              ceftriaxoneVialCount,
              sodiumChlorideDiluentCount,
            }
          : undefined
      )
    );

    const tripCountryCode = (tripData.trip.countryCode ?? "").trim().toUpperCase();
    const requiresMalariaCoverage =
      MALARIA_ENDEMIC_COUNTRY_CODES.has(tripCountryCode);
    const requiresAlbendazoleCoverage =
      HIGH_PARASITE_PREVALENCE_COUNTRY_CODES.has(tripCountryCode);
    const hasMalariaTreatment = items.some((item) =>
      hasKeywordInAnyField(item, MALARIA_TREATMENT_KEYWORDS)
    );
    const hasAlbendazole = items.some((item) =>
      hasKeywordInAnyField(item, ALBENDAZOLE_KEYWORDS)
    );
    const missingRegionSpecificCoverage: string[] = [];
    if (requiresMalariaCoverage && !hasMalariaTreatment) {
      missingRegionSpecificCoverage.push("Artemether/Lumefantrine");
    }
    if (requiresAlbendazoleCoverage && !hasAlbendazole) {
      missingRegionSpecificCoverage.push("Albendazole");
    }
    const regionSpecificStatus: RuleStatus =
      missingRegionSpecificCoverage.length > 0 ? "FAIL" : "PASS";
    checks.push(
      createCheck(
        RULES.REGION_SPECIFIC.ID,
        RULES.REGION_SPECIFIC.NAME,
        regionSpecificStatus,
        missingRegionSpecificCoverage.length > 0
          ? `Missing destination-specific medications for ${tripCountryCode}: ${missingRegionSpecificCoverage.join(
              ", "
            )}.`
          : requiresMalariaCoverage || requiresAlbendazoleCoverage
          ? `Region-specific medications are present for destination ${tripCountryCode}.`
          : `Destination ${tripCountryCode} is not in the configured malaria/parasite high-risk country map.`,
        regionSpecificStatus === "PASS"
          ? undefined
          : "Add the missing region-specific medications before departure. Review local epidemiology guidance if destination risk is uncertain.",
        includeEvidence
          ? {
              tripCountryCode,
              requiresMalariaCoverage,
              requiresAlbendazoleCoverage,
              hasMalariaTreatment,
              hasAlbendazole,
              missingRegionSpecificCoverage,
              mappingNote:
                "Country-level mapping is used. Rural/region-specific risk within a country is not modeled in this rule.",
            }
          : undefined
      )
    );

    let adultMultivitaminTablets = 0;
    let childrenChewableVitaminTablets = 0;
    let prenatalVitaminTablets = 0;

    for (const item of items) {
      if (!isCategory(item, CATEGORIES.VITAMINS)) {
        continue;
      }

      const name = normalize(item.name);
      const presentation = normalize(item.presentation);
      const estimatedUnits = estimateTabletLikeUnits(item);

      const isPrenatal = name.includes("prenatal");
      const isChildren = name.includes("child") || name.includes("children");
      const isInfant = name.includes("infant");
      const isChewable = presentation === "chewable tablets" || name.includes("chew");

      if (isPrenatal) {
        prenatalVitaminTablets += estimatedUnits;
      } else if (isChildren || isInfant || isChewable) {
        childrenChewableVitaminTablets += estimatedUnits;
      } else if (name.includes("multivitamin")) {
        adultMultivitaminTablets += estimatedUnits;
      }
    }

    const hasInfantDrops = items.some(
      (item) =>
        isCategory(item, CATEGORIES.VITAMINS) &&
        hasKeywordInAnyField(item, INFANT_DROP_VITAMIN_KEYWORDS)
    );
    const hasHighDoseVitaminA = items.some(
      (item) =>
        isCategory(item, CATEGORIES.VITAMINS) &&
        hasKeywordInAnyField(item, HIGH_DOSE_VITAMIN_A_KEYWORDS) &&
        normalize(item.dose).includes(HIGH_DOSE_VITAMIN_A_DOSE_TOKEN)
    );

    const vitaminFailThresholdMisses: string[] = [];
    if (
      adultMultivitaminTablets <
      READINESS_THRESHOLDS.VITAMIN_ADULT_MULTIVITAMIN.FAIL_MIN
    ) {
      vitaminFailThresholdMisses.push(
        `Adult multivitamins below red-flag minimum (${adultMultivitaminTablets} < ${READINESS_THRESHOLDS.VITAMIN_ADULT_MULTIVITAMIN.FAIL_MIN})`
      );
    }
    if (
      childrenChewableVitaminTablets <
      READINESS_THRESHOLDS.VITAMIN_CHILDREN_CHEWABLE.FAIL_MIN
    ) {
      vitaminFailThresholdMisses.push(
        `Children's chewable/infant vitamins below red-flag minimum (${childrenChewableVitaminTablets} < ${READINESS_THRESHOLDS.VITAMIN_CHILDREN_CHEWABLE.FAIL_MIN})`
      );
    }
    if (prenatalVitaminTablets < READINESS_THRESHOLDS.VITAMIN_PRENATAL.FAIL_MIN) {
      vitaminFailThresholdMisses.push(
        `Prenatal vitamins below red-flag minimum (${prenatalVitaminTablets} < ${READINESS_THRESHOLDS.VITAMIN_PRENATAL.FAIL_MIN})`
      );
    }

    const vitaminPreferredRangeMisses: string[] = [];
    if (
      adultMultivitaminTablets <
        READINESS_THRESHOLDS.VITAMIN_ADULT_MULTIVITAMIN.WARN_MIN ||
      adultMultivitaminTablets >
        READINESS_THRESHOLDS.VITAMIN_ADULT_MULTIVITAMIN.WARN_MAX
    ) {
      vitaminPreferredRangeMisses.push(
        `Adult multivitamins outside preferred range (${adultMultivitaminTablets}; target ${READINESS_THRESHOLDS.VITAMIN_ADULT_MULTIVITAMIN.WARN_MIN}-${READINESS_THRESHOLDS.VITAMIN_ADULT_MULTIVITAMIN.WARN_MAX})`
      );
    }
    if (
      childrenChewableVitaminTablets <
        READINESS_THRESHOLDS.VITAMIN_CHILDREN_CHEWABLE.WARN_MIN ||
      childrenChewableVitaminTablets >
        READINESS_THRESHOLDS.VITAMIN_CHILDREN_CHEWABLE.WARN_MAX
    ) {
      vitaminPreferredRangeMisses.push(
        `Children's chewable vitamins outside preferred range (${childrenChewableVitaminTablets}; target ${READINESS_THRESHOLDS.VITAMIN_CHILDREN_CHEWABLE.WARN_MIN}-${READINESS_THRESHOLDS.VITAMIN_CHILDREN_CHEWABLE.WARN_MAX})`
      );
    }
    if (
      prenatalVitaminTablets < READINESS_THRESHOLDS.VITAMIN_PRENATAL.WARN_MIN ||
      prenatalVitaminTablets > READINESS_THRESHOLDS.VITAMIN_PRENATAL.WARN_MAX
    ) {
      vitaminPreferredRangeMisses.push(
        `Prenatal vitamins outside preferred range (${prenatalVitaminTablets}; target ${READINESS_THRESHOLDS.VITAMIN_PRENATAL.WARN_MIN}-${READINESS_THRESHOLDS.VITAMIN_PRENATAL.WARN_MAX})`
      );
    }
    if (!hasInfantDrops) {
      vitaminPreferredRangeMisses.push(
        "Infant vitamin drops not detected in packed vitamins."
      );
    }
    if (!hasHighDoseVitaminA) {
      vitaminPreferredRangeMisses.push(
        "High-dose Vitamin A (25,000 IU) not detected."
      );
    }

    const vitaminStatus: RuleStatus =
      vitaminFailThresholdMisses.length > 0
        ? "FAIL"
        : vitaminPreferredRangeMisses.length > 0
        ? "WARN"
        : "PASS";

    checks.push(
      createCheck(
        RULES.VITAMINS.ID,
        RULES.VITAMINS.NAME,
        vitaminStatus,
        vitaminStatus === "PASS"
          ? "Vitamin red-flag minimums and preferred ranges are satisfied."
          : `Vitamin issues: ${[
              ...vitaminFailThresholdMisses,
              ...vitaminPreferredRangeMisses,
            ].join("; ")}.`,
        vitaminStatus === "PASS"
          ? undefined
          : "Adjust vitamin quantities to clear red-flag minimums and move toward preferred target ranges.",
        includeEvidence
          ? {
              adultMultivitaminTablets,
              childrenChewableVitaminTablets,
              prenatalVitaminTablets,
              hasInfantDrops,
              hasHighDoseVitaminA,
              vitaminFailThresholdMisses,
              vitaminPreferredRangeMisses,
            }
          : undefined
      )
    );

    const tripStartUtc = parseTripDateToUtc(tripData.trip.startDate);
    const requiredExpirationUtc = addDaysUtc(tripStartUtc, shelfLifeDays);
    let nonCompliantExpirationCount = 0;
    let expiredAsOfTripStartCount = 0;
    let invalidExpirationCount = 0;
    const expiredByLocation = new Map<string, ExpiredTripMedicationLocation>();

    for (const item of items) {
      try {
        const expirationUtc = parseExpirationMonthEndUtc(item.expirationDate);
        if (expirationUtc < tripStartUtc) {
          expiredAsOfTripStartCount += 1;
          const itemName = item.name.trim() || UNKNOWN_MEDICATION_NAME;
          const key = `${itemName}|${item.boxNumber}|${item.expirationDate}`;
          const existing = expiredByLocation.get(key);
          if (existing) {
            existing.instances += 1;
          } else {
            expiredByLocation.set(key, {
              itemName,
              boxNumber: item.boxNumber,
              expirationDate: item.expirationDate,
              instances: 1,
            });
          }
        }
        if (expirationUtc < requiredExpirationUtc) {
          nonCompliantExpirationCount += 1;
        }
      } catch {
        invalidExpirationCount += 1;
      }
    }
    const expiredAsOfTripStartItems = [...expiredByLocation.values()].sort(
      (a, b) =>
        a.boxNumber - b.boxNumber ||
        a.itemName.localeCompare(b.itemName) ||
        a.expirationDate.localeCompare(b.expirationDate)
    );
    const expiredMedicationLocationSummary =
      expiredAsOfTripStartItems.length > 0
        ? ` Expired-at-start medications: ${expiredAsOfTripStartItems
            .map((item) =>
              `${item.itemName} (Box ${item.boxNumber}, exp ${item.expirationDate}${
                item.instances > 1 ? `, ${item.instances} instances` : ""
              })`
            )
            .join("; ")}.`
        : "";
    const allItemsBelowShelfLifeThreshold =
      items.length > 0 && nonCompliantExpirationCount === items.length;

    let expirationStatus: RuleStatus;
    if (items.length === 0) {
      expirationStatus = "FAIL";
    } else if (expiredAsOfTripStartCount > 0) {
      expirationStatus = "FAIL";
    } else if (allItemsBelowShelfLifeThreshold) {
      expirationStatus = "FAIL";
    } else if (nonCompliantExpirationCount > 0 || invalidExpirationCount > 0) {
      expirationStatus = "WARN";
    } else {
      expirationStatus = "PASS";
    }

    checks.push(
      createCheck(
        RULES.EXPIRATION.ID,
        RULES.EXPIRATION.NAME,
        expirationStatus,
        `Expired as of trip start: ${expiredAsOfTripStartCount}/${items.length}. Items below shelf-life threshold: ${nonCompliantExpirationCount}/${items.length}. Invalid expiration values: ${invalidExpirationCount}. All items below shelf-life threshold: ${
          allItemsBelowShelfLifeThreshold ? "yes" : "no"
        }.${expiredMedicationLocationSummary}`,
        expirationStatus === "PASS"
          ? undefined
          : expiredAsOfTripStartCount > 0
          ? "Remove or replace medications that are expired by trip start date. Then replace additional items expiring before the 6-month shelf-life threshold."
          : allItemsBelowShelfLifeThreshold
          ? "All packed medications are too close to expiration. Repack with inventory that remains valid at least 6 months beyond trip start."
          : "Replace items expiring too soon so all packed medications remain valid at least 6 months beyond trip start.",
        includeEvidence
          ? {
              shelfLifeDays,
              requiredExpirationDate: requiredExpirationUtc.toISOString(),
              tripStartDate: tripStartUtc.toISOString(),
              expiredAsOfTripStartCount,
              expiredAsOfTripStartItems,
              nonCompliantExpirationCount,
              invalidExpirationCount,
              allItemsBelowShelfLifeThreshold,
            }
          : undefined
      )
    );

    const totalChecks = checks.length;
    const passedChecks = checks.filter((check) => check.status === "PASS").length;
    const warningChecks = checks.filter((check) => check.status === "WARN").length;
    const failedChecks = checks.filter((check) => check.status === "FAIL").length;

    const rating =
      failedChecks > 0 ? "RED" : warningChecks > 0 ? "YELLOW" : "GREEN";
    const reasons = rating === "GREEN" ? [] : checks.filter((c) => c.status !== "PASS");

    const recommendedActions = [
      ...new Set(
        reasons
          .map((reason) => reason.recommendedAction)
          .filter((value): value is string => Boolean(value && value.trim()))
      ),
    ];
    if (recommendedActions.length === 0 && rating === "GREEN") {
      recommendedActions.push(
        "Trip meets current packing readiness rules. Maintain this baseline through departure."
      );
    }

    const structuredContent: EvaluateTripPackingReadinessResponse =
      EvaluateTripPackingReadinessResponseSchema.parse({
        trip: tripData.trip,
        rating,
        summary: {
          totalChecks,
          passedChecks,
          warningChecks,
          failedChecks,
          totalPackedItems: items.length,
          formulationAdequacyStatus: formulationStatus,
          pediatricReadinessStatus: pediatricStatus,
          pediatricReadinessConfidence: pediatricConfidencePercent,
        },
        reasons,
        checks,
        recommendedActions,
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
