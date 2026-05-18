const financePlugin = require('../finance-ema-vwap');

const id = 'retail-fulfillment-ema';

function validateProfile(profile) {
  financePlugin.validateProfile(profile);
}

module.exports = {
  id,
  validateProfile,
  createPublisherState: financePlugin.createPublisherState,
  applyPublisherObservation: financePlugin.applyPublisherObservation,
  getPublisherActuals: financePlugin.getPublisherActuals,
  createEngine: financePlugin.createEngine,
};
