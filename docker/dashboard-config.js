/**
 * Dashboard WebSocket + UI tuning for Docker deployments.
 * Edit wsUrl when users open the UI from another machine (browser must reach consumer on the host).
 * Example: wsUrl: 'ws://20.51.158.49:8081'
 * This file is bind-mounted over /usr/share/nginx/html/config.js — restart the frontend container after edits.
 */
window.__DEMO_CONFIG__ = {
  version: '1.3',
  wsUrl: null,
  nqPredictionConsumer: null,
}
