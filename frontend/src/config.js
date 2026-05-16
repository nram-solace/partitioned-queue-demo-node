/** @returns {Record<string, unknown>} */
function readRuntimeDashboardConfig() {
  if (typeof window === 'undefined') return {}
  const c = window.__DEMO_CONFIG__
  if (!c || typeof c !== 'object') return {}
  return c
}

const rt = readRuntimeDashboardConfig()

/** Shown in the dashboard header; set in `public/config.js` / `docker/dashboard-config.js` as `version`, or `VITE_DASHBOARD_VERSION`. */
export const DASHBOARD_VERSION = (() => {
  const fromRt = rt.version
  if (typeof fromRt === 'string' && fromRt.trim() !== '') return fromRt.trim()
  if (typeof fromRt === 'number' && Number.isFinite(fromRt)) return String(fromRt)
  const env = import.meta.env.VITE_DASHBOARD_VERSION
  if (typeof env === 'string' && env.trim() !== '') return env.trim()
  return '1.3'
})()

/** e.g. `v1.3` for the main title line */
export function dashboardVersionLabel() {
  const s = DASHBOARD_VERSION
  return s.startsWith('v') ? s : `v${s}`
}

/** Default consumer WebSocket port (must match `WS_PORT` in demo.env / docker). */
const DASHBOARD_WS_PORT = '8081'

/**
 * WebSocket URL for the consumer + dashboard server.
 * Call this when opening the socket (not at module load) so `/config.js` has set `window.__DEMO_CONFIG__` first.
 * If you open the UI by VM IP/hostname (not localhost) and Vite still has `ws://localhost:8081`, this returns
 * `ws://<same host as the page>:8081` so the browser hits the mapped consumer port on that machine.
 */
export function getDashboardWsUrl() {
  const rtNow = readRuntimeDashboardConfig()
  if (typeof rtNow.wsUrl === 'string' && rtNow.wsUrl.trim() !== '') {
    return rtNow.wsUrl.trim()
  }

  const fromEnv = typeof import.meta.env.VITE_WS_URL === 'string' ? import.meta.env.VITE_WS_URL.trim() : ''
  const pageHost =
    typeof window !== 'undefined' && window.location && typeof window.location.hostname === 'string'
      ? window.location.hostname
      : ''
  const pageIsLoopback = pageHost === 'localhost' || pageHost === '127.0.0.1'

  const rewriteLocalhostToPageHost = (urlStr) => {
    if (!urlStr || !pageHost || pageIsLoopback) return urlStr
    try {
      const normalized = urlStr.startsWith('ws') ? urlStr : `ws://${urlStr}`
      const u = new URL(normalized)
      if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return urlStr
      const port = u.port || DASHBOARD_WS_PORT
      return `ws://${pageHost}:${port}`
    } catch {
      return urlStr
    }
  }

  if (fromEnv) {
    return rewriteLocalhostToPageHost(fromEnv)
  }

  if (pageHost && !pageIsLoopback) {
    return `ws://${pageHost}:${DASHBOARD_WS_PORT}`
  }

  return `ws://localhost:${DASHBOARD_WS_PORT}`
}

/** NQ prediction chart uses one canonical consumer index (1–5); match backend `NQ_PREDICTION_CONSUMER`. */
export const NQ_PREDICTION_CONSUMER = parseInt(
  (rt.nqPredictionConsumer != null && rt.nqPredictionConsumer !== ''
    ? String(rt.nqPredictionConsumer)
    : '') ||
    import.meta.env.VITE_NQ_PREDICTION_CONSUMER ||
    '1',
  10,
)

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
