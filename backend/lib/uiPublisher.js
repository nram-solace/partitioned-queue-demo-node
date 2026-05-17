const solace = require('solclientjs');
const { wrapUiEnvelope } = require('./uiEnvelope');
const { catalogProfiles, events, commandsWildcard } = require('./uiTopics');
const { slimProfile, attachJsonPayload, parseJsonAttachment } = require('./catalogPayload');

function createSessionProps(suffix) {
  return {
    url: process.env.SOLACE_HOST || 'ws://localhost:8008',
    vpnName: process.env.SOLACE_VPN || 'default',
    userName: process.env.SOLACE_USERNAME || 'default',
    password: process.env.SOLACE_PASSWORD || 'default',
    clientName: `catalog-ui-${suffix}-${Date.now()}`,
  };
}

/**
 * Solace session for dashboard catalog/events publish and command subscribe.
 */
class CatalogUiSession {
  constructor(profileId) {
    this.profileId = profileId;
    this.session = null;
    this.connected = false;
    this.onCommand = null;
  }

  connect({ onCommand } = {}) {
    this.onCommand = onCommand;
    return new Promise((resolve, reject) => {
      this.session = solace.SolclientFactory.createSession(createSessionProps(this.profileId));

      this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
        this.connected = true;
        this.session.subscribe(
          solace.SolclientFactory.createTopicDestination(commandsWildcard()),
          true,
          'ui-commands',
          10000,
        );
        console.log(`📡 UI command subscription: ${commandsWildcard()}`);
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
    if (!this.onCommand) {
      return;
    }
    try {
      const raw = message.getBinaryAttachment();
      if (!raw) {
        return;
      }
      const data = parseJsonAttachment(raw);
      this.onCommand(data);
    } catch (error) {
      console.error('❌ Invalid UI command payload:', error);
    }
  }

  publishTopic(topic, payload) {
    if (!this.session || !this.connected) {
      return;
    }
    const msg = solace.SolclientFactory.createMessage();
    msg.setDestination(solace.SolclientFactory.createTopicDestination(topic));
    attachJsonPayload(msg, payload);
    msg.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
    this.session.send(msg);
  }

  publishEvent(payload) {
    this.publishTopic(events(this.profileId), wrapUiEnvelope(this.profileId, payload));
  }

  publishCatalog(profile, queueNames) {
    this.publishTopic(
      catalogProfiles(),
      wrapUiEnvelope(this.profileId, {
        type: 'demoProfile',
        profile: slimProfile(profile),
        queueNames,
      }),
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
