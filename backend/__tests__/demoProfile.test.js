const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  loadDemoProfile,
  validateDemoProfile,
  listDemoProfiles,
  getQueueNames,
  generateMessageFromProfile,
  jmsxGroupIdForMessage,
  topicForMessage,
} = require('../lib/demoProfile');

const financePath = path.join(__dirname, '../../profiles/finance.json');
const retailPath = path.join(__dirname, '../../profiles/retail.json');
const airlineCarrierPath = path.join(__dirname, '../../profiles/airline-carrier.json');
const airlineHubPath = path.join(__dirname, '../../profiles/airline-hub.json');
const drillingPath = path.join(__dirname, '../../profiles/drilling.json');

test('parse and validate profiles/retail.json', () => {
  const p = loadDemoProfile(retailPath);
  validateDemoProfile(p);
  assert.equal(p.id, 'retail');
  assert.equal(p.features.prediction.plugin, 'retail-fulfillment-ema');
  assert.equal(p.ui.prediction.valueFormat, 'currency');
});

test('parse and validate profiles/finance.json', () => {
  const p = loadDemoProfile(financePath);
  validateDemoProfile(p);
  assert.equal(p.id, 'finance');
  assert.equal(p.features.prediction.plugin, 'finance-ema-vwap');
  assert.equal(p.messaging.partitionKeys.length, 8);
  assert.equal(getQueueNames(p).partitioned, 'Finance_PQ');
});

test('parse and validate profiles/airline-carrier.json', () => {
  const p = loadDemoProfile(airlineCarrierPath);
  validateDemoProfile(p);
  assert.equal(p.id, 'airline-carrier');
  assert.equal(p.features.prediction.plugin, 'airline-ops-ema');
  assert.equal(p.ui.prediction.valueFormat, 'decimal');
});

test('parse and validate profiles/airline-hub.json', () => {
  const p = loadDemoProfile(airlineHubPath);
  validateDemoProfile(p);
  assert.equal(p.id, 'airline-hub');
  assert.equal(p.messaging.partitionKeyField, 'hub');
});

test('parse and validate profiles/drilling.json', () => {
  const p = loadDemoProfile(drillingPath);
  validateDemoProfile(p);
  assert.equal(p.id, 'drilling');
  assert.equal(p.features.prediction.plugin, 'oilfield-ops-ema');
  assert.equal(p.messaging.partitionKeyField, 'wellId');
  assert.equal(p.ui.prediction.valueFormat, 'number');
  assert.deepEqual(p.messaging.topicLevels, ['region', 'state', 'status']);
});

test('drilling topicForMessage inserts topicLevels between prefix and suffix', () => {
  const p = validateDemoProfile(loadDemoProfile(drillingPath));
  const topic = topicForMessage(p, {
    wellId: 'W4501',
    region: 'PERMIAN',
    state: 'TX',
    status: 'DRILLED',
  });
  assert.equal(topic, 'qdemo/ops/drilling/well/PERMIAN/TX/DRILLED/W4501');
});

test('topicLevels referencing an unknown field fails validation', () => {
  const p = loadDemoProfile(drillingPath);
  p.messaging.topicLevels = ['region', 'notAField'];
  assert.throws(() => validateDemoProfile(p), /topicLevels references unknown message field/);
});

test('topicLevels overlapping topicSuffixFromField fails validation', () => {
  const p = loadDemoProfile(drillingPath);
  p.messaging.topicLevels = ['region', 'wellId'];
  assert.throws(() => validateDemoProfile(p), /must not include messaging\.topicSuffixFromField/);
});

test('listDemoProfiles loads all packaged profiles with prediction', () => {
  const profiles = listDemoProfiles(path.join(__dirname, '../../profiles'));
  assert.equal(profiles.length, 5);
  assert.deepEqual(
    profiles.map((p) => p.id),
    ['airline-carrier', 'airline-hub', 'drilling', 'finance', 'retail'],
  );
  for (const p of profiles) {
    assert.ok(p.features.prediction.plugin);
    assert.ok(p.ui.prediction.tabLabel);
  }
});

test('legacy pricePrediction flag is rejected', () => {
  const p = loadDemoProfile(financePath);
  p.features = { pricePrediction: true };
  assert.throws(() => validateDemoProfile(p), /Unknown features key/);
});

test('missing prediction fails validation', () => {
  const p = loadDemoProfile(retailPath);
  delete p.features.prediction;
  assert.throws(() => validateDemoProfile(p), /features\.prediction/);
});

test('unknown prediction plugin fails validation', () => {
  const p = loadDemoProfile(financePath);
  p.features.prediction.plugin = 'not-a-plugin';
  assert.throws(() => validateDemoProfile(p), /Unknown prediction plugin/);
});

test('missing queues fails validation', () => {
  const p = loadDemoProfile(financePath);
  delete p.queues;
  assert.throws(() => validateDemoProfile(p), /queues/);
});

test('invalid profile throws actionable error', () => {
  assert.throws(
    () => validateDemoProfile({}),
    /id/,
  );
  assert.throws(
    () =>
      validateDemoProfile({
        id: 'x',
        branding: { appTitle: 't' },
        messaging: {
          topicPrefix: 't',
          partitionKeys: ['a'],
          partitionKeyField: 'symbol',
          topicSuffixFromField: 'symbol',
        },
        messageFields: [{ name: 'symbol', type: 'partitionKey' }],
        ui: { displayFields: [{ field: 'symbol', label: 'S', format: 'text' }] },
      }),
    /partitionKeys\.length between 3 and 16/,
  );
});

test('generated message has topic suffix and valid JMSXGroupID index', () => {
  const p = validateDemoProfile(loadDemoProfile(financePath));
  const counter = { value: 1 };
  const prefix = p.messaging.topicPrefix;
  for (let i = 0; i < 50; i++) {
    const msg = generateMessageFromProfile(p, counter);
    const topic = topicForMessage(p, msg);
    assert.ok(topic.startsWith(`${prefix}/`), `topic should start with "${prefix}/"`);
    const gid = jmsxGroupIdForMessage(p, msg);
    const maxIdx = p.messaging.partitionKeys.length - 1;
    assert.match(gid, /^\d+$/);
    assert.ok(Number(gid) >= 0 && Number(gid) <= maxIdx, `JMSXGroupID index ${gid} out of range 0..${maxIdx}`);
  }
});
