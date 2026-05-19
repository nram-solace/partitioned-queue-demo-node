const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  loadDemoProfile,
  validateDemoProfile,
  generateMessageFromProfile,
} = require('../../lib/demoProfile');
const {
  createPublisherRuntime,
  createConsumerEngine,
  observationFromOrder,
  getAlgorithmId,
} = require('../../prediction/runtime');
const { resolvePlugin } = require('../../prediction/registry');

const carrierPath = path.join(__dirname, '../../../profiles/airline-carrier.json');
const hubPath = path.join(__dirname, '../../../profiles/airline-hub.json');

test('airline-carrier plugin resolves and validates observation fields', () => {
  const profile = validateDemoProfile(loadDemoProfile(carrierPath));
  const plugin = resolvePlugin(profile);
  assert.equal(plugin.id, 'airline-ops-ema');
  assert.equal(getAlgorithmId(profile), 'airline-ops-ema');
  const obs = profile.features.prediction.observationFields;
  assert.equal(obs.seriesKey, 'carrier');
  assert.equal(obs.value, 'delay');
  assert.equal(obs.weight, 'passengers');
  assert.equal(profile.ui.prediction.accuracyMaxGapPercent, 12);
});

test('airline-hub plugin resolves and validates observation fields', () => {
  const profile = validateDemoProfile(loadDemoProfile(hubPath));
  const plugin = resolvePlugin(profile);
  assert.equal(plugin.id, 'airline-ops-ema');
  const obs = profile.features.prediction.observationFields;
  assert.equal(obs.seriesKey, 'hub');
  assert.equal(obs.value, 'delay');
  assert.equal(obs.weight, 'passengers');
  assert.equal(profile.ui.prediction.accuracyMaxGapPercent, 12);
});

test('airline profiles use hub or carrier as seriesKey matching partitionKeyField', () => {
  const carrier = validateDemoProfile(loadDemoProfile(carrierPath));
  const hub = validateDemoProfile(loadDemoProfile(hubPath));
  assert.equal(carrier.messaging.partitionKeyField, carrier.features.prediction.observationFields.seriesKey);
  assert.equal(hub.messaging.partitionKeyField, hub.features.prediction.observationFields.seriesKey);
  assert.deepEqual(carrier.messaging.partitionKeys, ['AA', 'DL', 'UA', 'WN', 'B6']);
  assert.deepEqual(hub.messaging.partitionKeys, ['ATL', 'ORD', 'DFW', 'DEN', 'LAX']);
});

test('airline-carrier publisher runtime emits actuals for every partition key', () => {
  const profile = validateDemoProfile(loadDemoProfile(carrierPath));
  const runtime = createPublisherRuntime(profile);
  const counter = { value: 1 };

  for (let i = 0; i < 120; i++) {
    const order = generateMessageFromProfile(profile, counter);
    runtime.applyObservation(order);
  }

  const actuals = runtime.getActuals();
  for (const pk of profile.messaging.partitionKeys) {
    assert.ok(Object.hasOwn(actuals, pk), `missing actual for ${pk}`);
    assert.equal(typeof actuals[pk], 'number');
    assert.ok(actuals[pk] >= 0);
  }
});

test('airline-hub publisher runtime emits actuals for every partition key', () => {
  const profile = validateDemoProfile(loadDemoProfile(hubPath));
  const runtime = createPublisherRuntime(profile);
  const counter = { value: 1 };

  for (let i = 0; i < 120; i++) {
    const order = generateMessageFromProfile(profile, counter);
    runtime.applyObservation(order);
  }

  const actuals = runtime.getActuals();
  for (const pk of profile.messaging.partitionKeys) {
    assert.ok(Object.hasOwn(actuals, pk), `missing actual for ${pk}`);
    assert.equal(typeof actuals[pk], 'number');
    assert.ok(actuals[pk] >= 0);
  }
});

test('airline-carrier observationFromOrder reads carrier, delay, and passengers', () => {
  const profile = validateDemoProfile(loadDemoProfile(carrierPath));
  const order = {
    carrier: 'AA',
    delay: 12.5,
    passengers: 180,
  };
  const obs = observationFromOrder(order, profile);
  assert.deepEqual(obs, {
    seriesKey: 'AA',
    value: 12.5,
    weight: 180,
  });
});

test('airline-hub observationFromOrder reads hub, delay, and passengers', () => {
  const profile = validateDemoProfile(loadDemoProfile(hubPath));
  const order = {
    hub: 'ATL',
    delay: 15.2,
    passengers: 220,
  };
  const obs = observationFromOrder(order, profile);
  assert.deepEqual(obs, {
    seriesKey: 'ATL',
    value: 15.2,
    weight: 220,
  });
});

test('airline-carrier PQ consumer tracks delay more closely than NQ on scripted stream', () => {
  const profile = validateDemoProfile(loadDemoProfile(carrierPath));
  const pq = createConsumerEngine(profile, 'partitioned');
  const nq = createConsumerEngine(profile, 'non-exclusive');

  let delay = 12;
  let pqErr = 0;
  let nqErr = 0;
  const n = 80;

  for (let i = 0; i < n; i++) {
    delay = parseFloat((delay * (1 + 0.009 * (Math.random() - 0.5))).toFixed(2));
    const passengers = 40 + (i % 20) * 10;
    const { predicted: pqPred } = pq.update(delay, passengers);
    const { predicted: nqPred } = nq.update(delay, passengers);
    pqErr += Math.abs(pqPred - delay);
    nqErr += Math.abs(nqPred - delay);
  }

  pqErr /= n;
  nqErr /= n;
  assert.ok(pqErr < nqErr, `expected PQ mean error ${pqErr} < NQ ${nqErr}`);
});

test('airline-carrier prediction event shape uses vNext fields', () => {
  const profile = validateDemoProfile(loadDemoProfile(carrierPath));
  const engine = createConsumerEngine(profile, 'partitioned');
  const { predicted, samplesUsed } = engine.update(12.0, 150);

  const event = {
    type: 'prediction',
    profileId: profile.id,
    algorithmId: getAlgorithmId(profile),
    seriesKey: 'DL',
    predicted,
    observed: 12.0,
    samplesUsed,
    queueType: 'partitioned',
    consumerNumber: 1,
    consumerId: 3,
  };

  assert.equal(event.profileId, 'airline-carrier');
  assert.equal(event.algorithmId, 'airline-ops-ema');
  assert.equal(typeof event.seriesKey, 'string');
  assert.equal(typeof event.predicted, 'number');
  assert.equal(typeof event.samplesUsed, 'number');
  assert.equal(event.symbol, undefined);
  assert.equal(event.predictedPrice, undefined);
});
