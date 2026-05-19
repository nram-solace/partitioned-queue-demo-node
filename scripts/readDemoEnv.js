const fs = require('fs');
const path = require('path');

const DEFAULT_SOLACE_HOST = 'ws://localhost:8008';
const DEFAULT_SOLACE_VPN = 'default';
const DEFAULT_SOLACE_USERNAME = 'default';
const DEFAULT_SOLACE_PASSWORD = 'default';
const DEFAULT_PUBLISH_RATE = '10';
const DEFAULT_NQ_PREDICTION_CONSUMER = '1';
const DEFAULT_VERSION = '3.4';
const DEFAULT_PROFILES_DIR = './profiles';
const DEFAULT_MSG_VPN = 'default';
const DEFAULT_SEMP_PORT = '8080';
const DEFAULT_SEMP_WAIT_MAX_ITERATIONS = '120';
const DEFAULT_SEMP_WAIT_SLEEP_SECS = '3';

const ENV_KEYS = [
  'SOLACE_HOST',
  'SOLACE_PUBLIC_URL',
  'SOLACE_VPN',
  'SOLACE_USERNAME',
  'SOLACE_PASSWORD',
  'PUBLISH_RATE',
  'NQ_PREDICTION_CONSUMER',
  'PROFILES_DIR',
  'VERSION',
  'MSG_VPN',
  'SEMP_PORT',
  'SEMP_WAIT_MAX_ITERATIONS',
  'SEMP_WAIT_SLEEP_SECS',
];

/**
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function readDemoEnv(filePath) {
  const out = {};
  if (!filePath || !fs.existsSync(filePath)) return out;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * @param {Record<string, string|undefined>} fileEnv
 * @param {NodeJS.ProcessEnv} [procEnv]
 */
function mergeDemoEnv(fileEnv = {}, procEnv = process.env) {
  const out = { ...fileEnv };
  for (const key of ENV_KEYS) {
    const raw = procEnv[key];
    if (raw != null && String(raw).trim() !== '') {
      out[key] = String(raw).trim();
    }
  }
  return out;
}

function pick(env, key) {
  const v = env[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/**
 * @param {Record<string, string>} [env]
 */
function getSolaceNodeConfig(env = {}) {
  return {
    url: pick(env, 'SOLACE_HOST') || DEFAULT_SOLACE_HOST,
    vpnName: pick(env, 'SOLACE_VPN') || DEFAULT_SOLACE_VPN,
    userName: pick(env, 'SOLACE_USERNAME') || DEFAULT_SOLACE_USERNAME,
    password: pick(env, 'SOLACE_PASSWORD') || DEFAULT_SOLACE_PASSWORD,
  };
}

/**
 * Values for `window.__DEMO_CONFIG__`.
 * `solaceUrl: null` only when both Node and browser URLs are the localhost default (VM rewrite).
 * Cloud `wss://` in SOLACE_HOST must not become null (would rewrite to ws://page-host:8008).
 * @param {Record<string, string>} [env]
 */
function getSolaceBrowserConfig(env = {}) {
  const host = pick(env, 'SOLACE_HOST') || DEFAULT_SOLACE_HOST;
  const publicUrl = pick(env, 'SOLACE_PUBLIC_URL') || host;
  const vpn = pick(env, 'SOLACE_VPN') || DEFAULT_SOLACE_VPN;
  const userName = pick(env, 'SOLACE_USERNAME') || DEFAULT_SOLACE_USERNAME;
  const password = pick(env, 'SOLACE_PASSWORD') || DEFAULT_SOLACE_PASSWORD;
  const nq = pick(env, 'NQ_PREDICTION_CONSUMER') || DEFAULT_NQ_PREDICTION_CONSUMER;
  const version = pick(env, 'VERSION') || DEFAULT_VERSION;

  let solaceUrl = publicUrl;
  if (publicUrl === DEFAULT_SOLACE_HOST && host === DEFAULT_SOLACE_HOST) {
    solaceUrl = null;
  } else if (publicUrl === DEFAULT_SOLACE_HOST && host !== DEFAULT_SOLACE_HOST) {
    solaceUrl = host;
  }

  return {
    solaceUrl,
    solaceVpn: vpn === DEFAULT_SOLACE_VPN ? null : vpn,
    solaceUsername: userName === DEFAULT_SOLACE_USERNAME ? null : userName,
    solacePassword: password === DEFAULT_SOLACE_PASSWORD ? null : password,
    nqPredictionConsumer: nq === DEFAULT_NQ_PREDICTION_CONSUMER ? null : parseInt(nq, 10),
    version,
  };
}

function defaultDemoEnvPath() {
  return path.resolve(__dirname, '..', 'demo.env');
}

module.exports = {
  ENV_KEYS,
  DEFAULT_SOLACE_HOST,
  DEFAULT_SOLACE_VPN,
  DEFAULT_SOLACE_USERNAME,
  DEFAULT_SOLACE_PASSWORD,
  DEFAULT_PUBLISH_RATE,
  DEFAULT_NQ_PREDICTION_CONSUMER,
  DEFAULT_VERSION,
  readDemoEnv,
  mergeDemoEnv,
  getSolaceNodeConfig,
  getSolaceBrowserConfig,
  defaultDemoEnvPath,
};
