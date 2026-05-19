const solace = require('solclientjs');
const { getSolaceSessionProps, loadDemoEnv, formatSolaceConnectTarget } = require('./lib/solaceEnv');

loadDemoEnv();

const {
  listDemoProfiles,
  resolveProfilesDir,
  generateMessageFromProfile,
  jmsxGroupIdForMessage,
  topicForMessage,
} = require('./lib/demoProfile');
const { createPublisherRuntime } = require('./prediction/runtime');
const { wrapUiEnvelope } = require('./lib/uiEnvelope');
const { statsPublisher } = require('./lib/uiTopics');
const { attachJsonPayload } = require('./lib/catalogPayload');

const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10;
solace.SolclientFactory.init(factoryProps);
solace.SolclientFactory.setLogLevel(solace.LogLevel.WARN);

class DemoPublisher {
  constructor(profile) {
    this.profile = profile;
    this.session = null;
    this.wantsPublishing = false;
    this.initialConnectResolve = null;
    this.publishRate = parseInt(process.env.PUBLISH_RATE || '10', 10);
    this.orderCounter = { value: 1 };
    this.publishInterval = null;
    this.statsInterval = null;
    this.publishedCount = 0;
    this.publishedCountBySymbol = {};
    this.prediction = createPublisherRuntime(profile);
  }

  sendPublisherStats() {
    if (!this.session) return;
    const topicPrefix = this.profile.messaging.topicPrefix;
    const payload = wrapUiEnvelope(this.profile.id, {
      type: 'publisherStats',
      publishedCount: this.publishedCount,
      rate: this.publishRate,
      topicName: `${topicPrefix}/>`,
      publishedCountBySymbol: { ...this.publishedCountBySymbol },
      actuals: this.prediction.getActuals(),
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
      console.warn(`⚠️  [${this.profile.id}] publisherStats publish failed:`, error.message);
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.initialConnectResolve = resolve;
        this.session = solace.SolclientFactory.createSession(
          getSolaceSessionProps({
            clientName: `Publisher-${this.profile.id}-${Date.now()}`,
          }),
        );

        this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
          console.log(`✅ Publisher connected [${this.profile.id}]`);
          if (this.initialConnectResolve) {
            this.initialConnectResolve();
            this.initialConnectResolve = null;
          }
          if (this.wantsPublishing) this.ensurePublishIntervals();
        });

        this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent) => {
          this.initialConnectResolve = null;
          reject(
            new Error(
              `${sessionEvent.infoStr || 'Connection failed'} (${formatSolaceConnectTarget()})`,
            ),
          );
        });

        this.session.on(solace.SessionEventCode.DISCONNECTED, () => {
          this.pausePublishIntervals();
        });

        this.session.connect();
      } catch (error) {
        this.initialConnectResolve = null;
        reject(error);
      }
    });
  }

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

  ensurePublishIntervals() {
    if (!this.wantsPublishing || this.publishInterval) return;
    const intervalMs = 1000 / this.publishRate;
    this.publishInterval = setInterval(() => {
      this.publishOrder(this.generateOrder());
    }, intervalMs);
    if (!this.statsInterval) {
      this.statsInterval = setInterval(() => this.sendPublisherStats(), 1000);
    }
  }

  generateOrder() {
    const order = generateMessageFromProfile(this.profile, this.orderCounter);
    this.prediction.applyObservation(order);
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
    userPropMap.addField(
      'JMSXGroupID',
      solace.SDTField.create(solace.SDTFieldType.STRING, partitionKey),
    );
    message.setUserPropertyMap(userPropMap);

    const pk = order[this.profile.messaging.partitionKeyField];
    try {
      if (!this.session) return;
      this.session.send(message);
      this.publishedCount++;
      if (pk != null && pk !== '') {
        const sym = String(pk);
        this.publishedCountBySymbol[sym] = (this.publishedCountBySymbol[sym] || 0) + 1;
      }
    } catch (error) {
      console.error(`❌ [${this.profile.id}] publish failed:`, error);
    }
  }

  startPublishing() {
    this.wantsPublishing = true;
    this.ensurePublishIntervals();
  }

  stopPublishing() {
    this.wantsPublishing = false;
    this.pausePublishIntervals();
    this.sendPublisherStats();
  }

  disconnect() {
    this.stopPublishing();
    if (this.session) this.session.disconnect();
  }
}

async function main() {
  let profiles;
  try {
    profiles = listDemoProfiles(resolveProfilesDir());
  } catch (e) {
    console.error('❌ Failed to load demo profiles:', e.message);
    process.exit(1);
  }

  const publishers = profiles.map((profile) => new DemoPublisher(profile));

  try {
    for (const pub of publishers) {
      await pub.connect();
      pub.startPublishing();
      console.log(
        `🚀 Publisher [${pub.profile.id}] ${pub.publishRate} msg/sec → ${pub.profile.messaging.topicPrefix}`,
      );
    }

    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down publishers...');
      publishers.forEach((p) => p.disconnect());
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to start publishers:', error);
    process.exit(1);
  }
}

main();
