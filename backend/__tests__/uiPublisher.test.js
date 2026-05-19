const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isThrottledCatalogEvent,
  predictionThrottleKey,
} = require('../lib/uiPublisher');

test('isThrottledCatalogEvent throttles prediction only', () => {
  assert.equal(isThrottledCatalogEvent({ type: 'prediction' }), true);
  assert.equal(isThrottledCatalogEvent({ type: 'order' }), false);
  assert.equal(isThrottledCatalogEvent({ type: 'status' }), false);
  assert.equal(isThrottledCatalogEvent(null), false);
});

test('predictionThrottleKey isolates PQ, NQ, and series', () => {
  const pqAapl = predictionThrottleKey('finance', {
    queueType: 'partitioned',
    seriesKey: 'AAPL',
  });
  const pqMsft = predictionThrottleKey('finance', {
    queueType: 'partitioned',
    seriesKey: 'MSFT',
  });
  const nqAapl = predictionThrottleKey('finance', {
    queueType: 'non-exclusive',
    seriesKey: 'AAPL',
  });
  assert.notEqual(pqAapl, nqAapl);
  assert.notEqual(pqAapl, pqMsft);
});
