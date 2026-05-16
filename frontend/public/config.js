/**
 * Optional runtime overrides (Docker: may be replaced by docker/dashboard-config.js).
 * wsUrl = WebSocket to the consumer (WS_PORT, default 8081), NOT the HTTP UI (e.g. :3000).
 * null wsUrl = use Vite VITE_WS_URL or default ws://localhost:8081.
 */
window.__DEMO_CONFIG__ = {
  version: '1.2',
  wsUrl: null,
  nqPredictionConsumer: 1,
}
