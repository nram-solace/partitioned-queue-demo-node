const solace = require('solclientjs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'demo.env') });

const {
  loadDemoProfile,
  validateDemoProfile,
  resolveDemoProfilePathFromEnv,
  generateMessageFromProfile,
  jmsxGroupIdForMessage,
  topicForMessage,
  warnLegacyEnvIgnoredOnce,
  isPricePredictionEnabled,
} = require('./lib/demoProfile');
const { wrapUiEnvelope } = require('./lib/uiEnvelope');
const { statsPublisher } = require('./lib/uiTopics');
const { attachJsonPayload } = require('./lib/catalogPayload');

function gaussianRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function buildSymbolPredictionConfig(profile) {
  const priceField = profile.messageFields.find((f) => f.name === 'price' && f.type === 'float');
  if (!priceField?.baselineByPartitionKey || !priceField.volatilityByPartitionKey) {
    return null;
  }
  const cfg = {};
  for (const sym of profile.messaging.partitionKeys) {
    cfg[sym] = {
      basePrice: priceField.baselineByPartitionKey[sym],
      volatility: priceField.volatilityByPartitionKey[sym],
    };
  }
  return cfg;
}

// Initialize Solace factory
const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10;
solace.SolclientFactory.init(factoryProps);
solace.SolclientFactory.setLogLevel(solace.LogLevel.WARN);

function loadPublisherProfile() {
  const profilePath = resolveDemoProfilePathFromEnv();
  if (process.env.DEMO_PROFILE) {
    warnLegacyEnvIgnoredOnce();
  } else if (process.env.TOPIC_PREFIX || process.env.SYMBOLS) {
    console.warn(
      '[demo profile] TOPIC_PREFIX / SYMBOLS are ignored; messages use DEMO_PROFILE (default ./profiles/finance.json). Remove unused env vars from demo.env to silence.',
    );
  }
  const raw = loadDemoProfile(profilePath);
  const profile = validateDemoProfile(raw);
  console.log(`📋 Demo profile: ${profile.id} (${path.relative(process.cwd(), profilePath) || profilePath})`);
  console.log(`📋 Topic prefix: ${profile.messaging.topicPrefix}`);
  return profile;
}

class DemoPublisher {
  constructor(profile) {
    this.profile = profile;
    this.session = null;
    /** When true, start (or restart) publish intervals after Solace session is UP. */
    this.wantsPublishing = false;
    /** Resolves `connect()` promise on first UP only. */
    this.initialConnectResolve = null;
    this.publishRate = parseInt(process.env.PUBLISH_RATE || '10', 10);
    this.orderCounter = { value: 1 };
    this.publishInterval = null;
    this.statsInterval = null;
    this.publishedCount = 0;
    /** Partition key (e.g. symbol) → number of messages published for that key. */
    this.publishedCountBySymbol = {};

    this.pricePrediction = isPricePredictionEnabled(profile);
    this.symbolPredictionConfig = this.pricePrediction ? buildSymbolPredictionConfig(profile) : null;
    this.currentPrices = null;
    if (this.pricePrediction && this.symbolPredictionConfig) {
      this.currentPrices = Object.fromEntries(
        profile.messaging.partitionKeys.map((s) => [s, this.symbolPredictionConfig[s].basePrice]),
      );
    }
  }

  sendPublisherStats() {
    if (!this.session) {
      return;
    }
    const topicPrefix = this.profile.messaging.topicPrefix;
    const payload = wrapUiEnvelope(this.profile.id, {
      type: 'publisherStats',
      publishedCount: this.publishedCount,
      rate: this.publishRate,
      topicName: `${topicPrefix}/>`,
      publishedCountBySymbol: { ...this.publishedCountBySymbol },
      ...(this.pricePrediction && this.currentPrices
        ? { actualPrices: { ...this.currentPrices } }
        : {}),
    });
    const message = solace.SolclientFactory.createMessage();
    message.setDestination(
      solace.SolclientFactory.createTopicDestination(statsPublisher(this.profile.id)),
    );
    attachJsonPayload(message, payload);
    message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
    try {
      this.session.send(message);
    } catch (error) {
      console.warn('⚠️  Failed to publish publisherStats to catalog topic:', error.message);
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.initialConnectResolve = resolve;
        this.session = solace.SolclientFactory.createSession({
          url: process.env.SOLACE_HOST || 'ws://localhost:8008',
          vpnName: process.env.SOLACE_VPN || 'default',
          userName: process.env.SOLACE_USERNAME || 'default',
          password: process.env.SOLACE_PASSWORD || 'default',
        });

        this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
          console.log('✅ Publisher connected to Solace');
          if (this.initialConnectResolve) {
            this.initialConnectResolve();
            this.initialConnectResolve = null;
          }
          if (this.wantsPublishing) {
            this.ensurePublishIntervals();
          }
        });

        this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent) => {
          console.error('❌ Connection failed:', sessionEvent.infoStr);
          this.initialConnectResolve = null;
          reject(new Error(sessionEvent.infoStr));
        });

        this.session.on(solace.SessionEventCode.DISCONNECTED, () => {
          console.log('⚠️  Publisher disconnected (pausing publish loop until session is UP again)');
          this.pausePublishIntervals();
        });

        this.session.connect();
      } catch (error) {
        this.initialConnectResolve = null;
        reject(error);
      }
    });
  }

  /** Stop publish + stats timers only (session may reconnect; `wantsPublishing` unchanged). */
  pausePublishIntervals() {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /** Start timers when `wantsPublishing` and not already running (used after UP and from `startPublishing`). */
  ensurePublishIntervals() {
    if (!this.wantsPublishing || this.publishInterval) {
      return;
    }
    const intervalMs = 1000 / this.publishRate;
    this.publishInterval = setInterval(() => {
      const order = this.generateOrder();
      this.publishOrder(order);
    }, intervalMs);
    if (!this.statsInterval) {
      this.statsInterval = setInterval(() => {
        this.sendPublisherStats();
      }, 1000);
    }
  }

  generateOrder() {
    const order = generateMessageFromProfile(this.profile, this.orderCounter);
    if (this.pricePrediction && this.symbolPredictionConfig && this.currentPrices) {
      const pk = order[this.profile.messaging.partitionKeyField];
      const sc = this.symbolPredictionConfig[pk] || { basePrice: 100, volatility: 0.003 };
      const prev = this.currentPrices[pk] ?? sc.basePrice;
      const raw = prev * (1 + sc.volatility * gaussianRandom());
      this.currentPrices[pk] = parseFloat(Math.max(0.01, raw).toFixed(2));
      order.price = this.currentPrices[pk];
    }
    return order;
  }

  publishOrder(order) {
    const topic = topicForMessage(this.profile, order);
    const message = solace.SolclientFactory.createMessage();
    message.setDestination(solace.SolclientFactory.createTopicDestination(topic));
    message.setBinaryAttachment(JSON.stringify(order));
    message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);

    const partitionKey = jmsxGroupIdForMessage(this.profile, order);
    const userPropMap = new solace.SDTMapContainer();
    userPropMap.addField('JMSXGroupID', solace.SDTField.create(solace.SDTFieldType.STRING, partitionKey));
    message.setUserPropertyMap(userPropMap);

    const pk = order[this.profile.messaging.partitionKeyField];
    try {
      if (!this.session) {
        return;
      }
      this.session.send(message);
      this.publishedCount++;
      if (pk != null && pk !== '') {
        const sym = String(pk);
        this.publishedCountBySymbol[sym] = (this.publishedCountBySymbol[sym] || 0) + 1;
      }
      console.log(`📤 Published: ${pk} (P${partitionKey}) → ${topic}`);
    } catch (error) {
      console.error('❌ Failed to publish:', error);
    }
  }

  startPublishing() {
    const keys = this.profile.messaging.partitionKeys.join(', ');
    console.log(`🚀 Starting publisher - ${this.publishRate} msg/sec`);
    console.log(`📊 Partition keys: ${keys}`);

    this.wantsPublishing = true;
    this.ensurePublishIntervals();
  }

  stopPublishing() {
    this.wantsPublishing = false;
    this.pausePublishIntervals();
    console.log('⏸️  Publishing stopped');
    this.sendPublisherStats();
  }

  disconnect() {
    this.stopPublishing();
    if (this.session) {
      this.session.disconnect();
    }
  }
}

async function main() {
  let profile;
  try {
    profile = loadPublisherProfile();
  } catch (e) {
    console.error('❌ Failed to load demo profile:', e.message);
    process.exit(1);
  }

  const publisher = new DemoPublisher(profile);

  try {
    await publisher.connect();
    publisher.startPublishing();

    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down publisher...');
      publisher.disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to start publisher:', error);
    process.exit(1);
  }
}

main();
