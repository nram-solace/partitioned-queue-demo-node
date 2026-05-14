/** WebSocket URL for the consumer + dashboard server (must match `WS_PORT` in demo.env). */
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8081'

/**
 * Legacy split caps (no longer used for PQ vs NQ chart bars — those share {@link CHART_ACCURACY_SHARED_MAX_GAP_PERCENT}
 * so a lower mean |Δ| always reads as a higher % on both rows).
 */
export const CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT_PQ = 2.5
export const CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT_NQ = 10

/** @deprecated Prefer {@link CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT_PQ} */
export const CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT = CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT_PQ

/**
 * Minimum number of **chart** points (publisher snapshots) where both actual and that channel’s prediction
 * are present before showing the accuracy bar. Kept small so the bar appears quickly; the rolling window below
 * avoids a misleading reading from only 1–2 ticks.
 */
export const MIN_SAMPLES_FOR_CLOSENESS_METRIC = 2

/** How many recent valid (actual + prediction) chart samples feed the mean |Δ| for the bar (≈ seconds at 1 Hz). */
export const CHART_ACCURACY_GAP_WINDOW = 24

/**
 * Mean chart |Δ|% is mapped to 0–100% for **both** PQ and NQ with this same cap: `100 * (1 - meanGap / cap)`.
 * One scale avoids NQ looking “more accurate” than PQ when its mean error is actually larger (old NQ cap was looser).
 */
export const CHART_ACCURACY_SHARED_MAX_GAP_PERCENT = 5

/** 0–100 closeness from mean gap (% of price) using the given scale cap. */
export function closenessPctFromMeanGap(meanGapPct, capPercent = CHART_ACCURACY_SHARED_MAX_GAP_PERCENT) {
  if (meanGapPct == null || !Number.isFinite(meanGapPct)) return null
  const cap = capPercent
  if (!(cap > 0)) return Math.max(0, Math.min(100, 100 - meanGapPct))
  return Math.max(0, Math.min(100, 100 * (1 - meanGapPct / cap)))
}
