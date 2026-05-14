const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  loadDemoProfile,
  validateDemoProfile,
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
});

test('parse and validate profiles/finance.json', () => {
  const p = loadDemoProfile(financePath);
  validateDemoProfile(p);
  assert.equal(p.id, 'finance');
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
    /partitionKeys\.length === 5/,
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
    assert.match(gid, /^[0-4]$/);
  }
});
