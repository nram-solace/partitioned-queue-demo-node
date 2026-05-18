const solace = require('solclientjs');
const { loadDemoEnv } = require('./lib/solaceEnv');

loadDemoEnv();

const { DashboardBridge } = require('./lib/dashboardBridge');

const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10;
solace.SolclientFactory.init(factoryProps);
solace.SolclientFactory.setLogLevel(solace.LogLevel.WARN);

async function main() {
  const bridge = new DashboardBridge();
  try {
    await bridge.start();
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down consumers...');
      bridge.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to start dashboard bridge:', error);
    process.exit(1);
  }
}

main();
