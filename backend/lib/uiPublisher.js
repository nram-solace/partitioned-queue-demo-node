const solace = require('solclientjs');
const { getSolaceSessionProps } = require('./solaceEnv');
const { wrapUiEnvelope } = require('./uiEnvelope');
const { catalogProfiles, events, sessionSnapshot } = require('./uiTopics');
const { commandWildcard } = require('./commandTopics');
const { slimProfile, attachJsonPayload, parseJsonAttachment } = require('./catalogPayload');

function createSessionProps(suffix) {
  return getSolaceSessionProps({
    clientName: `catalog-ui-${suffix}-${Date.now()}`,
  });
}

/**
 * Solace session for dashboard catalog/events publish and solace/command subscribe.
 */
class CatalogUiSession {
  constructor() {
    this.session = null;
    this.connected = false;
    this.onCommand = null;
  }

  connect({ onCommand } = {}) {
    this.onCommand = onCommand;
    return new Promise((resolve, reject) => {
      this.session = solace.SolclientFactory.createSession(createSessionProps('multi'));

      this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
        this.connected = true;
        this.session.subscribe(
          solace.SolclientFactory.createTopicDestination(commandWildcard()),
          true,
          'ui-commands',
          10000,
        );
        console.log(`📡 UI command subscription: ${commandWildcard()}`);
        resolve();
      });

      this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent) => {
        reject(new Error(sessionEvent.infoStr));
      });

      this.session.on(solace.SessionEventCode.MESSAGE, (message) => {
        this.handleCommandMessage(message);
      });

      this.session.connect();
    });
  }

  handleCommandMessage(message) {
    if (!this.onCommand) return;
    try {
      const raw = message.getBinaryAttachment();
      if (!raw) return;
      const data = parseJsonAttachment(raw);
      this.onCommand(data);
    } catch (error) {
      console.error('❌ Invalid UI command payload:', error);
    }
  }

  publishTopic(topic, payload) {
    if (!this.session || !this.connected) return;
    const msg = solace.SolclientFactory.createMessage();
    msg.setDestination(solace.SolclientFactory.createTopicDestination(topic));
    attachJsonPayload(msg, payload);
    msg.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
    this.session.send(msg);
  }

  publishEvent(profileId, payload) {
    this.publishTopic(events(profileId), wrapUiEnvelope(profileId, payload));
  }

  publishProfilesCatalog(profiles, defaultProfileId) {
    const entries = profiles.map((p) => ({
      ...slimProfile(p),
      queueNames: {
        partitioned: p.queues.partitioned,
        nonExclusive: p.queues.nonExclusive,
        exclusive: p.queues.exclusive,
      },
    }));
    this.publishTopic(
      catalogProfiles(),
      wrapUiEnvelope(null, {
        type: 'demoProfiles',
        profiles: entries,
        defaultProfileId,
      }),
    );
  }

  publishSessionSnapshot(sessionId, profileId, statePayload) {
    this.publishTopic(
      sessionSnapshot(sessionId),
      wrapUiEnvelope(profileId, statePayload, sessionId),
    );
  }

  disconnect() {
    if (this.session) {
      try {
        this.session.disconnect();
      } catch (_) {
        /* ignore */
      }
      this.session = null;
      this.connected = false;
    }
  }
}

module.exports = { CatalogUiSession };
