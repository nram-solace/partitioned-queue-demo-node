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

test('listDemoProfiles loads finance and retail with prediction', () => {
  const profiles = listDemoProfiles(path.join(__dirname, '../../profiles'));
  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].id, 'finance');
  assert.equal(profiles[1].id, 'retail');
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
