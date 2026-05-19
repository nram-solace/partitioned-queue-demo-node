/** @returns {Record<string, unknown>} */
function readRuntimeDashboardConfig() {
  if (typeof window === 'undefined') return {}
  const c = window.__DEMO_CONFIG__
  if (!c || typeof c !== 'object') return {}
  return c
}

const rt = readRuntimeDashboardConfig()

/** Shown in the dashboard header; set in generated `public/config.js` (`VERSION` in `demo.env`) or `VITE_VERSION`. */
export const VERSION = (() => {
  const fromRt = rt.version
  if (typeof fromRt === 'string' && fromRt.trim() !== '') return fromRt.trim()
  if (typeof fromRt === 'number' && Number.isFinite(fromRt)) return String(fromRt)
  const env = import.meta.env.VITE_VERSION
  if (typeof env === 'string' && env.trim() !== '') return env.trim()
  return '3.4'
})()

/** e.g. `v2.1` for the main title line */
export function dashboardVersionLabel() {
  const s = VERSION
  return s.startsWith('v') ? s : `v${s}`
}

const DEFAULT_SOLACE_WS_PORT = '8008'

function pageHostname() {
  if (typeof window === 'undefined' || !window.location?.hostname) return ''
  return window.location.hostname
}

function pageIsLoopback() {
  const h = pageHostname()
  return h === 'localhost' || h === '127.0.0.1'
}

/** Rewrite ws://localhost:port → ws://<page host>:port for remote VM dashboards. */
function rewriteLocalhostWsUrl(urlStr, defaultPort = DEFAULT_SOLACE_WS_PORT) {
  const pageHost = pageHostname()
  if (!urlStr || !pageHost || pageIsLoopback()) return urlStr
  try {
    const normalized = urlStr.startsWith('ws') ? urlStr : `ws://${urlStr}`
    const u = new URL(normalized)
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return urlStr
    const port = u.port || defaultPort
    return `ws://${pageHost}:${port}`
  } catch {
    return urlStr
  }
}

/**
 * Solace Web Transport session settings for the dashboard (catalog control plane).
 * Runtime values come from `public/config.js` (generated from `demo.env` via `npm run sync-config`).
 * `VITE_SOLACE_*` is an emergency fallback only when config.js is missing.
 */
export function getSolaceSessionConfig() {
  const rtNow = readRuntimeDashboardConfig()
  const fromRt = typeof rtNow.solaceUrl === 'string' ? rtNow.solaceUrl.trim() : ''
  const fromEnv =
    typeof import.meta.env.VITE_SOLACE_URL === 'string' ? import.meta.env.VITE_SOLACE_URL.trim() : ''
  const url = rewriteLocalhostWsUrl(fromRt || fromEnv || 'ws://localhost:8008')

  const vpnName =
    (typeof rtNow.solaceVpn === 'string' && rtNow.solaceVpn.trim()) ||
    (typeof import.meta.env.VITE_SOLACE_VPN === 'string' && import.meta.env.VITE_SOLACE_VPN.trim()) ||
    'default'

  const userName =
    (typeof rtNow.solaceUsername === 'string' && rtNow.solaceUsername.trim()) ||
    (typeof import.meta.env.VITE_SOLACE_USERNAME === 'string' &&
      import.meta.env.VITE_SOLACE_USERNAME.trim()) ||
    'default'

  const password =
    (typeof rtNow.solacePassword === 'string' && rtNow.solacePassword) ||
    (typeof import.meta.env.VITE_SOLACE_PASSWORD === 'string' && import.meta.env.VITE_SOLACE_PASSWORD) ||
    'default'

  let hint = url
  try {
    hint = new URL(url).host
  } catch {
    /* keep full url */
  }

  return { url, vpnName, userName, password, hint }
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
/** At least one prediction sample per channel before showing the accuracy bar. */
export const MIN_SAMPLES_FOR_CLOSENESS_METRIC = 1

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
