const { EmaVwapEngine } = require('./engine');

const id = 'finance-ema-vwap';

function gaussianRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function observationFields(profile) {
  return profile.features.prediction.observationFields;
}

function valueFieldDef(profile) {
  const obs = observationFields(profile);
  return profile.messageFields.find((f) => f.name === obs.value && f.type === 'float');
}

function buildSeriesConfig(profile) {
  const valueField = valueFieldDef(profile);
  if (!valueField?.baselineByPartitionKey || !valueField.volatilityByPartitionKey) {
    return null;
  }
  const cfg = {};
  for (const pk of profile.messaging.partitionKeys) {
    cfg[pk] = {
      baseValue: valueField.baselineByPartitionKey[pk],
      volatility: valueField.volatilityByPartitionKey[pk],
    };
  }
  return cfg;
}

function validateProfile(profile) {
  const obs = observationFields(profile);
  const valueField = valueFieldDef(profile);
  if (!valueField || !valueField.baselineByPartitionKey) {
    throw new Error(
      `${id}: float field "${obs.value}" requires baselineByPartitionKey`,
    );
  }
  const vol = valueField.volatilityByPartitionKey;
  if (!vol || typeof vol !== 'object') {
    throw new Error(`${id}: field "${obs.value}" requires volatilityByPartitionKey`);
  }
  for (const pk of profile.messaging.partitionKeys) {
    if (typeof vol[pk] !== 'number' || !(vol[pk] > 0)) {
      throw new Error(
        `${id}: volatilityByPartitionKey["${pk}"] must be a positive number`,
      );
    }
  }
  const weightField = profile.messageFields.find(
    (f) => f.name === obs.weight && f.type === 'int',
  );
  if (!weightField) {
    throw new Error(`${id}: requires int message field "${obs.weight}"`);
  }
  const seriesField = profile.messageFields.find((f) => f.name === obs.seriesKey);
  if (!seriesField || seriesField.type !== 'partitionKey') {
    throw new Error(`${id}: observationFields.seriesKey must name a partitionKey field`);
  }
}

function createPublisherState(profile) {
  const seriesConfig = buildSeriesConfig(profile);
  if (!seriesConfig) {
    throw new Error(`${id}: unable to build publisher series config`);
  }
  return {
    currentValues: Object.fromEntries(
      profile.messaging.partitionKeys.map((pk) => [pk, seriesConfig[pk].baseValue]),
    ),
    seriesConfig,
  };
}

function applyPublisherObservation(state, order, profile) {
  const obs = observationFields(profile);
  const pk = order[obs.seriesKey];
  const sc = state.seriesConfig[pk] || { baseValue: 100, volatility: 0.003 };
  const prev = state.currentValues[pk] ?? sc.baseValue;
  const raw = prev * (1 + sc.volatility * gaussianRandom());
  state.currentValues[pk] = parseFloat(Math.max(0.01, raw).toFixed(2));
  order[obs.value] = state.currentValues[pk];
}

function getPublisherActuals(state) {
  return { ...state.currentValues };
}

function createEngine(queueType) {
  return new EmaVwapEngine(queueType);
}

module.exports = {
  id,
  validateProfile,
  createPublisherState,
  applyPublisherObservation,
  getPublisherActuals,
  createEngine,
};
