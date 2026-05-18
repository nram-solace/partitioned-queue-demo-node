/**
 * Dashboard Solace Web Transport for Docker / public VM deployments.
 * Edit solaceUrl when users open the UI from another machine (browser must reach broker :8008).
 * Example: solaceUrl: 'ws://20.51.158.49:8008'
 * Bind-mounted over /usr/share/nginx/html/config.js — restart frontend after edits.
 */
window.__DEMO_CONFIG__ = {
  version: '3.4',
  solaceUrl: null,
  solaceVpn: null,
  solaceUsername: null,
  solacePassword: null,
  nqPredictionConsumer: null,
}
