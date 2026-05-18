const { resolvePlugin } = require('./registry');

function observationFromOrder(order, profile) {
  const obs = profile.features.prediction.observationFields;
  const seriesKey = order[obs.seriesKey];
  const value = order[obs.value];
  const weight = order[obs.weight];
  if (seriesKey == null || seriesKey === '') {
    return null;
  }
  if (typeof value !== 'number' || typeof weight !== 'number') {
    return null;
  }
  return {
    seriesKey: String(seriesKey),
    value,
    weight,
  };
}

function createPublisherRuntime(profile) {
  const plugin = resolvePlugin(profile);
  const state = plugin.createPublisherState(profile);
  return {
    pluginId: plugin.id,
    state,
    applyObservation(order) {
      plugin.applyPublisherObservation(state, order, profile);
    },
    getActuals() {
      return plugin.getPublisherActuals(state, profile);
    },
  };
}

function createConsumerEngine(profile, queueType) {
  const plugin = resolvePlugin(profile);
  return plugin.createEngine(queueType, profile);
}

function getAlgorithmId(profile) {
  return resolvePlugin(profile).id;
}

module.exports = {
  observationFromOrder,
  createPublisherRuntime,
  createConsumerEngine,
  getAlgorithmId,
  resolvePlugin,
};
