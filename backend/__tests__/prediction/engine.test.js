const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadDemoProfile, validateDemoProfile } = require('../../lib/demoProfile');
const { EmaVwapEngine } = require('../../prediction/plugins/finance-ema-vwap/engine');

const financePath = path.join(__dirname, '../../../profiles/finance.json');
const retailPath = path.join(__dirname, '../../../profiles/retail.json');

function meanAbsError(engine, stream) {
  let sum = 0;
  for (const { value, weight } of stream) {
    const { predicted } = engine.update(value, weight);
    sum += Math.abs(predicted - value);
  }
  return sum / stream.length;
}

test('PQ engine tracks observations more closely than NQ on scripted stream', () => {
  const stream = [];
  let price = 100;
  for (let i = 0; i < 80; i++) {
    price = parseFloat((price * (1 + 0.002 * (Math.random() - 0.5))).toFixed(2));
    stream.push({ value: price, weight: 200 + (i % 50) });
  }

  const pqErr = meanAbsError(new EmaVwapEngine('partitioned'), stream);
  const nqErr = meanAbsError(new EmaVwapEngine('non-exclusive'), stream);
  assert.ok(pqErr < nqErr, `expected PQ error ${pqErr} < NQ error ${nqErr}`);
});

test('packaged profiles register prediction plugins', () => {
  const finance = validateDemoProfile(loadDemoProfile(financePath));
  const retail = validateDemoProfile(loadDemoProfile(retailPath));
  assert.equal(finance.features.prediction.plugin, 'finance-ema-vwap');
  assert.equal(retail.features.prediction.plugin, 'retail-fulfillment-ema');
  assert.ok(finance.ui.prediction.tabLabel);
  assert.ok(retail.ui.prediction.valueLabel);
});
