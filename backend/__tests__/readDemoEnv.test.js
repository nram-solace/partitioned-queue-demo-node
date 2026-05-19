const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readDemoEnv,
  mergeDemoEnv,
  getSolaceNodeConfig,
  getSolaceBrowserConfig,
} = require('../../scripts/readDemoEnv');

test('readDemoEnv parses comments and quoted values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-env-'));
  const file = path.join(dir, 'demo.env');
  fs.writeFileSync(
    file,
    `# comment
SOLACE_HOST=ws://broker:8008
SOLACE_VPN="myvpn"
`,
    'utf8',
  );
  const env = readDemoEnv(file);
  assert.equal(env.SOLACE_HOST, 'ws://broker:8008');
  assert.equal(env.SOLACE_VPN, 'myvpn');
});

test('mergeDemoEnv lets process.env override file', () => {
  const merged = mergeDemoEnv({ SOLACE_HOST: 'ws://file:8008' }, { SOLACE_HOST: 'ws://proc:8008' });
  assert.equal(merged.SOLACE_HOST, 'ws://proc:8008');
});

test('getSolaceNodeConfig applies defaults', () => {
  const cfg = getSolaceNodeConfig({});
  assert.equal(cfg.url, 'ws://localhost:8008');
  assert.equal(cfg.vpnName, 'default');
});

test('getSolaceBrowserConfig uses SOLACE_PUBLIC_URL over SOLACE_HOST', () => {
  const cfg = getSolaceBrowserConfig({
    SOLACE_HOST: 'ws://solace-broker:8008',
    SOLACE_PUBLIC_URL: 'ws://20.0.0.1:8008',
  });
  assert.equal(cfg.solaceUrl, 'ws://20.0.0.1:8008');
});

test('getSolaceBrowserConfig nulls localhost default for rewrite', () => {
  const cfg = getSolaceBrowserConfig({ SOLACE_HOST: 'ws://localhost:8008' });
  assert.equal(cfg.solaceUrl, null);
  assert.equal(cfg.solaceVpn, null);
  assert.equal(cfg.nqPredictionConsumer, null);
});

test('getSolaceBrowserConfig keeps cloud wss SOLACE_HOST when PUBLIC_URL omitted', () => {
  const cfg = getSolaceBrowserConfig({
    SOLACE_HOST: 'wss://svc.messaging.solace.cloud:443',
    SOLACE_VPN: 'my-vpn',
  });
  assert.equal(cfg.solaceUrl, 'wss://svc.messaging.solace.cloud:443');
});
