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

const retailPath = path.join(__dirname, '../../../profiles/retail.json');

test('retail plugin resolves and validates observation fields', () => {
  const profile = validateDemoProfile(loadDemoProfile(retailPath));
  const plugin = resolvePlugin(profile);
  assert.equal(plugin.id, 'retail-fulfillment-ema');
  assert.equal(getAlgorithmId(profile), 'retail-fulfillment-ema');
  const obs = profile.features.prediction.observationFields;
  assert.equal(obs.seriesKey, 'storeId');
  assert.equal(obs.value, 'lineTotal');
  assert.equal(obs.weight, 'units');
});

test('retail publisher runtime emits actuals for every partition key', () => {
  const profile = validateDemoProfile(loadDemoProfile(retailPath));
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
    assert.ok(actuals[pk] > 0);
  }
});

test('retail observationFromOrder reads storeId, lineTotal, and units', () => {
  const profile = validateDemoProfile(loadDemoProfile(retailPath));
  const order = {
    storeId: 'STORE-EAST',
    lineTotal: 118.42,
    units: 12,
  };
  const obs = observationFromOrder(order, profile);
  assert.deepEqual(obs, {
    seriesKey: 'STORE-EAST',
    value: 118.42,
    weight: 12,
  });
});

test('retail PQ consumer tracks lineTotal more closely than NQ on scripted stream', () => {
  const profile = validateDemoProfile(loadDemoProfile(retailPath));
  const pq = createConsumerEngine(profile, 'partitioned');
  const nq = createConsumerEngine(profile, 'non-exclusive');

  let lineTotal = 120;
  let pqErr = 0;
  let nqErr = 0;
  const n = 80;

  for (let i = 0; i < n; i++) {
    lineTotal = parseFloat((lineTotal * (1 + 0.009 * (Math.random() - 0.5))).toFixed(2));
    const units = 4 + (i % 20);
    const { predicted: pqPred } = pq.update(lineTotal, units);
    const { predicted: nqPred } = nq.update(lineTotal, units);
    pqErr += Math.abs(pqPred - lineTotal);
    nqErr += Math.abs(nqPred - lineTotal);
  }

  pqErr /= n;
  nqErr /= n;
  assert.ok(pqErr < nqErr, `expected PQ mean error ${pqErr} < NQ ${nqErr}`);
});

test('retail prediction event shape uses vNext fields', () => {
  const profile = validateDemoProfile(loadDemoProfile(retailPath));
  const engine = createConsumerEngine(profile, 'partitioned');
  const { predicted, samplesUsed } = engine.update(95.5, 8);

  const event = {
    type: 'prediction',
    profileId: profile.id,
    algorithmId: getAlgorithmId(profile),
    seriesKey: 'STORE-WEST',
    predicted,
    observed: 95.5,
    samplesUsed,
    queueType: 'partitioned',
    consumerNumber: 1,
    consumerId: 3,
  };

  assert.equal(event.profileId, 'retail');
  assert.equal(event.algorithmId, 'retail-fulfillment-ema');
  assert.equal(typeof event.seriesKey, 'string');
  assert.equal(typeof event.predicted, 'number');
  assert.equal(typeof event.samplesUsed, 'number');
  assert.equal(event.symbol, undefined);
  assert.equal(event.predictedPrice, undefined);
});
