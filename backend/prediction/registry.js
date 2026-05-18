const PLUGINS = {
  'finance-ema-vwap': require('./plugins/finance-ema-vwap'),
  'retail-fulfillment-ema': require('./plugins/retail-fulfillment-ema'),
  'airline-ops-ema': require('./plugins/airline-ops-ema'),
};

function resolvePlugin(profile) {
  const pluginId = profile?.features?.prediction?.plugin;
  if (typeof pluginId !== 'string' || !pluginId.trim()) {
    throw new Error('features.prediction.plugin is required');
  }
  const plugin = PLUGINS[pluginId];
  if (!plugin) {
    throw new Error(`Unknown prediction plugin: ${pluginId}`);
  }
  if (plugin.id !== pluginId) {
    throw new Error(`Prediction plugin id mismatch: registry key ${pluginId} vs export ${plugin.id}`);
  }
  return plugin;
}

function listPluginIds() {
  return Object.keys(PLUGINS);
}

module.exports = { resolvePlugin, listPluginIds, PLUGINS };
