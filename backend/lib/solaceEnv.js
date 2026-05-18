const path = require('path');
const dotenv = require('dotenv');
const { getSolaceNodeConfig } = require('../../scripts/readDemoEnv');

let loaded = false;

function loadDemoEnv() {
  if (loaded) return;
  dotenv.config({ path: path.resolve(__dirname, '..', '..', 'demo.env') });
  loaded = true;
}

/**
 * @param {{ clientName: string }} opts
 */
function getSolaceSessionProps(opts) {
  loadDemoEnv();
  const { url, vpnName, userName, password } = getSolaceNodeConfig(process.env);
  return {
    url,
    vpnName,
    userName,
    password,
    clientName: opts.clientName,
  };
}

module.exports = {
  loadDemoEnv,
  getSolaceSessionProps,
};
