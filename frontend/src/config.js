/** WebSocket URL for the consumer + dashboard server (must match `WS_PORT` in solace.env). */
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8081'

/**
 * Closeness bar (0–100): from cumulative **mean** |Δ| (% of price), where each sample is taken when a PQ/NQ
 * **prediction** is emitted (paired with last published actual) — not once per unrelated publisher tick.
 * **0%** means that mean reached this scale max, not “zero similarity” to actual.
 */
export const CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT = 2.5

/** 0–100 closeness from mean gap (% of price); same scale as {@link CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT}. */
export function closenessPctFromMeanGap(meanGapPct) {
  if (meanGapPct == null || !Number.isFinite(meanGapPct)) return null
  const cap = CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT
  if (!(cap > 0)) return Math.max(0, Math.min(100, 100 - meanGapPct))
  return Math.max(0, Math.min(100, 100 * (1 - meanGapPct / cap)))
}
