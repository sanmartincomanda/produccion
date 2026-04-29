import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase.js";

export const DEFAULT_LOGIN_BRANCHES = [
  { id: "CARNES SAN MARTIN GRANADA", label: "CARNES SAN MARTIN GRANADA", aliases: ["CARNES SAN MARTIN GRANADA"] },
  { id: "DIST MERCADO", label: "DIST MERCADO", aliases: ["DIST MERCADO"] },
  { id: "MASAYA", label: "MASAYA", aliases: ["MASAYA"] },
  { id: "MASAYA MERCADO", label: "MASAYA MERCADO", aliases: ["MASAYA MERCADO"] },
  { id: "CEDI PRODUCCION", label: "CEDI PRODUCCION", aliases: ["CEDI PRODUCCION"] },
];

const SICAR_TRIGGER_BRANCH_MAP = {
  "CARNES SAN MARTIN GRANADA": "Granada",
};

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
}

function resolveOfficialBranchFromInput(input) {
  const candidates = [
    input?.id,
    input?.label,
    input?.name,
    input?.nombre,
    ...(Array.isArray(input?.aliases) ? input.aliases : []),
  ]
    .map((value) => normalizeUpper(value))
    .filter(Boolean);

  return (
    DEFAULT_LOGIN_BRANCHES.find((branch) => candidates.includes(normalizeUpper(branch.id)) || candidates.includes(normalizeUpper(branch.label))) || null
  );
}

export function normalizeLoginBranchOptions(input) {
  const source = Array.isArray(input) && input.length > 0 ? input : DEFAULT_LOGIN_BRANCHES;

  return source
    .map((option) => {
      const official = resolveOfficialBranchFromInput(option);
      if (!official) {
        return null;
      }

      return {
        id: official.id,
        label: official.label,
        aliases: Array.from(new Set([official.id, official.label])),
      };
    })
    .filter(Boolean);
}

export function resolveLoginBranch(value, options = DEFAULT_LOGIN_BRANCHES) {
  const normalizedValue = normalizeUpper(value);
  if (!normalizedValue) return null;

  return (
    normalizeLoginBranchOptions(options).find((option) =>
      option.aliases.some((candidate) => normalizeUpper(candidate) === normalizedValue),
    ) || null
  );
}

export function resolveSicarTriggerBranchId(branchId) {
  return SICAR_TRIGGER_BRANCH_MAP[normalizeText(branchId)] || normalizeText(branchId);
}

export async function loadLoginBranchOptions() {
  try {
    const snapshot = await getDoc(doc(db, "appConfig", "branchSelector"));
    const options = snapshot.exists() ? snapshot.data()?.options : null;
    const normalizedOptions = normalizeLoginBranchOptions(options);
    return normalizedOptions.length ? normalizedOptions : normalizeLoginBranchOptions(DEFAULT_LOGIN_BRANCHES);
  } catch (error) {
    return normalizeLoginBranchOptions(DEFAULT_LOGIN_BRANCHES);
  }
}
