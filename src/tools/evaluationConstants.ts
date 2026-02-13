export const DEFAULT_SHELF_LIFE_DAYS = 180;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const UNKNOWN_MEDICATION_NAME = "Unnamed medication";

export const CATEGORIES = {
  ALLERGY: "Allergy",
  ANALGESICS: "Analgesics",
  ANTI_INFECTIVES: "Anti Infectives",
  CARDIAC: "Cardiac",
  GI: "GI",
  RESPIRATORY: "Respiratory",
  TOPICAL: "Topical",
  VITAMINS: "Vitamins",
} as const;

export const ALLERGY_RESPIRATORY_CATEGORIES = [
  CATEGORIES.ALLERGY,
  CATEGORIES.RESPIRATORY,
] as const;

export const LIQUID_OR_CHEWABLE_PRESENTATIONS = new Set([
  "oral suspension",
  "oral solution",
  "oral drops",
  "chewable tablets",
]);

export const SOLID_PRESENTATIONS = new Set([
  "tablets",
  "caplets",
  "capsules",
  "soft gel",
  "soft gel capsules",
  "gelcaps",
]);

export const ORAL_ANTI_INFECTIVE_PRESENTATIONS = new Set([
  "tablets",
  "caplets",
  "capsules",
  "oral suspension",
  "oral solution",
]);

export const INJECTABLE_PRESENTATIONS = new Set(["injection", "vial", "ampules"]);

export const TOPICAL_ANTIFUNGAL_KEYWORDS = [
  "clotrimazole",
  "miconazole",
  "ketoconazole",
  "terbinafine",
  "antifungal",
] as const;

export const TOPICAL_ANTIBIOTIC_KEYWORDS = [
  "bacitracin",
  "neomycin",
  "polymyxin",
  "triple antibiotic",
  "mupirocin",
] as const;

export const PEDIATRIC_NAME_KEYWORDS = [
  "child",
  "children",
  "pediatric",
  "infant",
  "baby",
] as const;

export const MALARIA_TREATMENT_KEYWORDS = ["artemether", "lumefantrine", "coartem"] as const;
export const ALBENDAZOLE_KEYWORDS = ["albendazole"] as const;
export const HYDROCORTISONE_KEYWORDS = ["hydrocortisone"] as const;
export const ASPIRIN_KEYWORDS = ["aspirin"] as const;
export const CEFTRIAXONE_KEYWORDS = ["ceftriaxone"] as const;
export const PEDIATRIC_VITAMIN_KEYWORDS = [
  "child",
  "children",
  "infant",
  "drop",
  "chew",
] as const;
export const INFANT_DROP_VITAMIN_KEYWORDS = [
  "infant",
  "drop",
  "poly-vi-sol",
] as const;
export const HIGH_DOSE_VITAMIN_A_KEYWORDS = ["vitamin a"] as const;
export const HIGH_DOSE_VITAMIN_A_DOSE_TOKEN = "25000";
export const WOUND_CARE_KEYWORDS = [
  "a&d",
  "petroleum jelly",
  "vaseline",
  "zinc",
  "triple antibiotic",
] as const;
export const SODIUM_CHLORIDE_DILUENT_KEYWORDS = [
  "sodium chloride",
  "normal saline",
  "0.9%",
] as const;

export const MALARIA_ENDEMIC_COUNTRY_CODES = new Set([
  "UG",
  "KE",
  "TZ",
  "MG",
  "KH",
  "TH",
  "IN",
  "HN",
  "HT",
  "DO",
]);

export const HIGH_PARASITE_PREVALENCE_COUNTRY_CODES = new Set([
  "UG",
  "KE",
  "TZ",
  "MG",
  "IN",
  "BD",
  "KH",
  "VN",
  "PH",
  "HT",
  "HN",
  "GT",
  "DO",
]);

export type AntibioticType = {
  type: string;
  keywords: string[];
};

export const ANTIBIOTIC_TYPES: AntibioticType[] = [
  { type: "amoxicillin", keywords: ["amoxicillin"] },
  { type: "azithromycin", keywords: ["azithromycin"] },
  { type: "ciprofloxacin", keywords: ["ciprofloxacin"] },
  { type: "metronidazole", keywords: ["metronidazole"] },
  { type: "cephalexin", keywords: ["cephalexin", "cefalexin"] },
  { type: "ceftriaxone", keywords: ["ceftriaxone"] },
  { type: "clindamycin", keywords: ["clindamycin"] },
  { type: "doxycycline", keywords: ["doxycycline"] },
  {
    type: "trimethoprim-sulfamethoxazole",
    keywords: ["trimethoprim", "sulfamethoxazole", "co-trimoxazole"],
  },
];

export type MedicationExpectation = {
  label: string;
  category?: string;
  keywords: string[];
};

export const ESSENTIAL_MEDICATION_EXPECTATIONS: MedicationExpectation[] = [
  {
    label: "Acetaminophen",
    category: CATEGORIES.ANALGESICS,
    keywords: ["acetaminophen"],
  },
  {
    label: "Ibuprofen",
    category: CATEGORIES.ANALGESICS,
    keywords: ["ibuprofen"],
  },
  {
    label: "Amoxicillin",
    category: CATEGORIES.ANTI_INFECTIVES,
    keywords: ["amoxicillin"],
  },
  {
    label: "Azithromycin",
    category: CATEGORIES.ANTI_INFECTIVES,
    keywords: ["azithromycin"],
  },
  {
    label: "Ciprofloxacin",
    category: CATEGORIES.ANTI_INFECTIVES,
    keywords: ["ciprofloxacin"],
  },
  {
    label: "Metronidazole",
    category: CATEGORIES.ANTI_INFECTIVES,
    keywords: ["metronidazole"],
  },
  {
    label: "Cephalexin",
    category: CATEGORIES.ANTI_INFECTIVES,
    keywords: ["cephalexin", "cefalexin"],
  },
  {
    label: "Loratadine/Cetirizine",
    keywords: ["loratadine", "cetirizine"],
  },
  {
    label: "Albuterol inhaler",
    category: CATEGORIES.RESPIRATORY,
    keywords: ["albuterol"],
  },
  {
    label: "Clotrimazole",
    category: CATEGORIES.TOPICAL,
    keywords: ["clotrimazole"],
  },
  {
    label: "Hydrocortisone",
    category: CATEGORIES.TOPICAL,
    keywords: ["hydrocortisone"],
  },
  {
    label: "Omeprazole/Famotidine",
    category: CATEGORIES.GI,
    keywords: ["omeprazole", "famotidine"],
  },
];

export const CRITICAL_MEDICATION_LABELS = new Set([
  "Acetaminophen",
  "Ibuprofen",
  "Amoxicillin",
  "Clotrimazole",
]);

export const READINESS_THRESHOLDS = {
  FORMULATION_CRITICAL_GAP_COUNT: 3,
  PEDIATRIC_CONFIDENCE: {
    ANALGESIC_WEIGHT: 0.35,
    ALLERGY_RESP_WEIGHT: 0.25,
    VITAMIN_WEIGHT: 0.2,
    HIGH_FORMULATION_COUNT: 5,
    HIGH_FORMULATION_WEIGHT: 0.2,
    MID_FORMULATION_COUNT: 2,
    MID_FORMULATION_WEIGHT: 0.1,
    PASS: 0.75,
    WARN: 0.45,
  },
  COMMON_MEDICATION_FORMULATIONS: {
    FAIL_MAX_DISTINCT: 1,
    ACETAMINOPHEN_TARGET_MIN: 5,
    ACETAMINOPHEN_TARGET_MAX: 8,
    IBUPROFEN_TARGET_MIN: 4,
    IBUPROFEN_TARGET_MAX: 6,
  },
  ANTIBIOTIC_DIVERSITY: {
    FAIL_MIN: 3,
    WARN_MIN: 5,
    WARN_MAX: 15,
  },
  GI_DISTINCT_COUNT: {
    FAIL_MIN: 1,
    WARN_MIN: 4,
    WARN_MAX: 8,
  },
  CARDIAC_DISTINCT_COUNT: {
    FAIL_MIN: 1,
    WARN_MIN: 5,
    WARN_MAX: 10,
  },
  INJECTABLE_CEFTRIAXONE: {
    WARN_MIN: 8,
    WARN_MAX: 12,
  },
  VITAMIN_ADULT_MULTIVITAMIN: {
    FAIL_MIN: 10000,
    WARN_MIN: 15000,
    WARN_MAX: 25000,
  },
  VITAMIN_CHILDREN_CHEWABLE: {
    FAIL_MIN: 5000,
    WARN_MIN: 10000,
    WARN_MAX: 20000,
  },
  VITAMIN_PRENATAL: {
    FAIL_MIN: 1000,
    WARN_MIN: 2000,
    WARN_MAX: 4000,
  },
} as const;

export const RULES = {
  TRIP_STATUS: {
    ID: "trip_status_packed",
    NAME: "Trip status indicates packed readiness",
  },
  CORE_CATEGORIES: {
    ID: "core_category_coverage",
    NAME: "Core category coverage",
  },
  NAMED_MEDICATIONS: {
    ID: "named_medication_coverage",
    NAME: "Named medication coverage",
  },
  FORMULATION: {
    ID: "formulation_adequacy_by_context",
    NAME: "Formulation adequacy by context",
  },
  PEDIATRIC: {
    ID: "pediatric_readiness_confidence",
    NAME: "Pediatric readiness confidence",
  },
  COMMON_FORMULATION_DIVERSITY: {
    ID: "common_medication_formulation_diversity",
    NAME: "Common medication formulation diversity",
  },
  ANTIBIOTIC_DIVERSITY: {
    ID: "antibiotic_type_diversity",
    NAME: "Antibiotic type diversity",
  },
  TOPICAL_ANTIFUNGAL_ANTIBIOTIC: {
    ID: "topical_antifungal_and_antibiotic_coverage",
    NAME: "Topical antifungal and antibiotic coverage",
  },
  TOPICAL_DEPTH: {
    ID: "topical_depth_coverage",
    NAME: "Topical depth coverage",
  },
  GI_DEPTH: {
    ID: "gi_depth_coverage",
    NAME: "GI depth coverage",
  },
  CARDIAC_DEPTH: {
    ID: "cardiac_depth_coverage",
    NAME: "Cardiac depth coverage",
  },
  INJECTABLE: {
    ID: "injectable_medication_readiness",
    NAME: "Injectable medication readiness",
  },
  REGION_SPECIFIC: {
    ID: "region_specific_medication_coverage",
    NAME: "Region-specific medication coverage",
  },
  VITAMINS: {
    ID: "vitamin_thresholds",
    NAME: "Vitamin threshold coverage",
  },
  EXPIRATION: {
    ID: "expiration_shelf_life_by_trip_start",
    NAME: "Expiration shelf life beyond trip start",
  },
} as const;
