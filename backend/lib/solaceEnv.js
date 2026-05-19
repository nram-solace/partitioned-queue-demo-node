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

/** Log session URL/VPN on connect failure (password omitted). */
function formatSolaceConnectTarget() {
  loadDemoEnv();
  const { url, vpnName, userName } = getSolaceNodeConfig(process.env);
  return `${userName}@${url} vpn=${vpnName}`;
}

/** Warn when compose broker overrides were not applied (localhost ≠ broker container). */
function warnIfDockerLocalhostBrokerUrl() {
  if (process.env.RUNNING_IN_DOCKER !== '1') return;
  loadDemoEnv();
  const { url } = getSolaceNodeConfig(process.env);
  if (!/localhost|127\.0\.0\.1/.test(url)) return;
  console.error(
    '❌ SOLACE_HOST is',
    url,
    'inside a container — that points at this container, not solace-broker.',
  );
  console.error(
    '   Fix: git pull, rebuild, and recreate from repo root:',
  );
  console.error(
    '   docker compose up -d --build --force-recreate consumer publisher',
  );
  console.error(
    '   Expected SOLACE_HOST in container: ws://solace-broker:8008 (see docker compose config).',
  );
}

module.exports = {
  loadDemoEnv,
  getSolaceSessionProps,
  formatSolaceConnectTarget,
  warnIfDockerLocalhostBrokerUrl,
};
