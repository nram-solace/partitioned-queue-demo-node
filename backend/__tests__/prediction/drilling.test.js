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

const drillingPath = path.join(__dirname, '../../../profiles/drilling.json');

test('drilling plugin resolves and validates observation fields', () => {
  const profile = validateDemoProfile(loadDemoProfile(drillingPath));
  const plugin = resolvePlugin(profile);
  assert.equal(plugin.id, 'oilfield-ops-ema');
  assert.equal(getAlgorithmId(profile), 'oilfield-ops-ema');
  const obs = profile.features.prediction.observationFields;
  assert.equal(obs.seriesKey, 'wellId');
  assert.equal(obs.value, 'wellheadPressure');
  assert.equal(obs.weight, 'chokeSize');
});

test('drilling publisher runtime emits actuals for every partition key', () => {
  const profile = validateDemoProfile(loadDemoProfile(drillingPath));
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

test('drilling observationFromOrder reads wellId, wellheadPressure, and chokeSize', () => {
  const profile = validateDemoProfile(loadDemoProfile(drillingPath));
  const order = {
    wellId: 'W4521',
    wellheadPressure: 2810.5,
    chokeSize: 32,
  };
  const obs = observationFromOrder(order, profile);
  assert.deepEqual(obs, {
    seriesKey: 'W4521',
    value: 2810.5,
    weight: 32,
  });
});

test('drilling PQ consumer tracks wellheadPressure more closely than NQ on scripted stream', () => {
  const profile = validateDemoProfile(loadDemoProfile(drillingPath));
  const pq = createConsumerEngine(profile, 'partitioned');
  const nq = createConsumerEngine(profile, 'non-exclusive');

  let pressure = 2800;
  let pqErr = 0;
  let nqErr = 0;
  const n = 80;

  for (let i = 0; i < n; i++) {
    pressure = parseFloat((pressure * (1 + 0.009 * (Math.random() - 0.5))).toFixed(2));
    const chokeSize = 8 + (i % 20) * 2;
    const { predicted: pqPred } = pq.update(pressure, chokeSize);
    const { predicted: nqPred } = nq.update(pressure, chokeSize);
    pqErr += Math.abs(pqPred - pressure);
    nqErr += Math.abs(nqPred - pressure);
  }

  pqErr /= n;
  nqErr /= n;
  assert.ok(pqErr < nqErr, `expected PQ mean error ${pqErr} < NQ ${nqErr}`);
});

test('drilling prediction event shape uses vNext fields', () => {
  const profile = validateDemoProfile(loadDemoProfile(drillingPath));
  const engine = createConsumerEngine(profile, 'partitioned');
  const { predicted, samplesUsed } = engine.update(2650.0, 24);

  const event = {
    type: 'prediction',
    profileId: profile.id,
    algorithmId: getAlgorithmId(profile),
    seriesKey: 'W4560',
    predicted,
    observed: 2650.0,
    samplesUsed,
    queueType: 'partitioned',
    consumerNumber: 1,
    consumerId: 3,
  };

  assert.equal(event.profileId, 'drilling');
  assert.equal(event.algorithmId, 'oilfield-ops-ema');
  assert.equal(typeof event.seriesKey, 'string');
  assert.equal(typeof event.predicted, 'number');
  assert.equal(typeof event.samplesUsed, 'number');
  assert.equal(event.symbol, undefined);
  assert.equal(event.predictedPrice, undefined);
});
