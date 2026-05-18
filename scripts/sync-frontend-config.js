#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  readDemoEnv,
  mergeDemoEnv,
  getSolaceBrowserConfig,
  defaultDemoEnvPath,
} = require('./readDemoEnv');

const repoRoot = path.resolve(__dirname, '..');
const demoEnvPath = process.env.DEMO_ENV_PATH || defaultDemoEnvPath();
const outPath = process.argv[2] || path.join(repoRoot, 'frontend/public/config.js');

const fileEnv = readDemoEnv(demoEnvPath);
const merged = mergeDemoEnv(fileEnv, process.env);
const cfg = getSolaceBrowserConfig(merged);

function line(key, value) {
  if (value === null || value === undefined) {
    return `  ${key}: null,`;
  }
  return `  ${key}: ${JSON.stringify(value)},`;
}

const body = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: demo.env (repo root). Regenerate: npm run sync-config
 * See: .dev/pm/impl-central-config.md
 */
window.__DEMO_CONFIG__ = {
${line('version', cfg.version)}
${line('solaceUrl', cfg.solaceUrl)}
${line('solaceVpn', cfg.solaceVpn)}
${line('solaceUsername', cfg.solaceUsername)}
${line('solacePassword', cfg.solacePassword)}
${line('nqPredictionConsumer', cfg.nqPredictionConsumer)}
}
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body, 'utf8');
console.log(`Wrote ${outPath}`);
