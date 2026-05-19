const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isThrottledCatalogEvent } = require('../lib/uiPublisher');

test('isThrottledCatalogEvent throttles prediction only', () => {
  assert.equal(isThrottledCatalogEvent({ type: 'prediction' }), true);
  assert.equal(isThrottledCatalogEvent({ type: 'order' }), false);
  assert.equal(isThrottledCatalogEvent({ type: 'status' }), false);
  assert.equal(isThrottledCatalogEvent(null), false);
});
