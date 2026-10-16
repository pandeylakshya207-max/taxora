/**
 * Workspace reconciliation settings. Stored as JSON on the workspace, always
 * read through resolveReconConfig(), which fills gaps from the defaults and
 * clamps every value to a safe range — a corrupted or hand-edited setting can
 * never produce an engine configuration outside these bounds.
 */

import { DEFAULT_CONFIG, type ReconConfig } from "./engine";

export const LIMITS = {
  roundingTolerancePaise: [0, 10_000], // ₹0 – ₹100
  minInvoiceSimilarity: [0.6, 1],
  fuzzyMaxValueDiffPct: [0, 20],
  probableMaxValueDiffPct: [0, 10],
  probableMaxDateDiffDays: [0, 60],
} as const;

const clamp = (n: unknown, [lo, hi]: readonly [number, number], fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;

export function resolveReconConfig(stored: unknown): ReconConfig {
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const fuzzy = (s.fuzzy ?? {}) as Record<string, unknown>;
  const probable = (s.probable ?? {}) as Record<string, unknown>;
  return {
    ...DEFAULT_CONFIG,
    roundingTolerancePaise: Math.round(clamp(s.roundingTolerancePaise, LIMITS.roundingTolerancePaise, DEFAULT_CONFIG.roundingTolerancePaise)),
    fuzzy: {
      minInvoiceSimilarity: clamp(fuzzy.minInvoiceSimilarity, LIMITS.minInvoiceSimilarity, DEFAULT_CONFIG.fuzzy.minInvoiceSimilarity),
      maxValueDiffPct: clamp(fuzzy.maxValueDiffPct, LIMITS.fuzzyMaxValueDiffPct, DEFAULT_CONFIG.fuzzy.maxValueDiffPct),
    },
    probable: {
      maxValueDiffPct: clamp(probable.maxValueDiffPct, LIMITS.probableMaxValueDiffPct, DEFAULT_CONFIG.probable.maxValueDiffPct),
      maxDateDiffDays: Math.round(clamp(probable.maxDateDiffDays, LIMITS.probableMaxDateDiffDays, DEFAULT_CONFIG.probable.maxDateDiffDays)),
    },
    // Weights stay at the documented defaults; they are not user-editable yet.
    weights: DEFAULT_CONFIG.weights,
  };
}
