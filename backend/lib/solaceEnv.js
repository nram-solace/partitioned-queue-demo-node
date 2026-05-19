const path = require('path');
const dotenv = require('dotenv');
const {
  getSolaceNodeConfig,
  DOCKER_BUNDLED_BROKER_URL,
  DEFAULT_SOLACE_HOST,
} = require('../../scripts/readDemoEnv');

let loaded = false;

function loadDemoEnv() {
  if (loaded) return;
  dotenv.config({ path: path.resolve(__dirname, '..', '..', 'demo.env') });
  loaded = true;
}

function pick(env, key) {
  const v = env[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
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

/** Log how the container resolved its broker URL (once at startup). */
function logDockerBrokerUrlResolution() {
  if (process.env.RUNNING_IN_DOCKER !== '1') return;
  loadDemoEnv();
  const configured = pick(process.env, 'SOLACE_HOST') || DEFAULT_SOLACE_HOST;
  const { url } = getSolaceNodeConfig(process.env);
  if (url === configured) return;
  console.log(
    `ℹ️  Node broker URL: ${url} (demo.env SOLACE_HOST=${configured} is for the host; bundled broker in Docker)`,
  );
}

module.exports = {
  loadDemoEnv,
  getSolaceSessionProps,
  formatSolaceConnectTarget,
  logDockerBrokerUrlResolution,
  DOCKER_BUNDLED_BROKER_URL,
};
