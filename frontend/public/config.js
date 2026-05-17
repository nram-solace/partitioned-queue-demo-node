/**
 * Runtime overrides (Docker: bind-mount docker/dashboard-config.js over this file).
 * solaceUrl = Web Transport to PubSub+ (:8008), NOT the HTTP UI (:3000).
 */
window.__DEMO_CONFIG__ = {
  version: '2.1',
  solaceUrl: null,
  solaceVpn: null,
  solaceUsername: null,
  solacePassword: null,
  nqPredictionConsumer: 1,
}
