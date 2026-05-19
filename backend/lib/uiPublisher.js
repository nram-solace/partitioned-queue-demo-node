const solace = require('solclientjs');
const { getSolaceSessionProps, formatSolaceConnectTarget } = require('./solaceEnv');
const { wrapUiEnvelope } = require('./uiEnvelope');
const { catalogProfiles, events, sessionSnapshot } = require('./uiTopics');
const { commandWildcard } = require('./commandTopics');
const { slimProfile, attachJsonPayload, parseJsonAttachment } = require('./catalogPayload');

const DEFAULT_SEND_BUFFER_MAX_SIZE = 4 * 1024 * 1024; // 4 MiB (API default is 64 KiB)
const DEFAULT_CATALOG_EVENT_MIN_INTERVAL_MS = 50; // per profile, prediction only
const DROP_LOG_INTERVAL_MS = 10_000;

function parsePositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function createSessionProps(suffix) {
  const base = getSolaceSessionProps({
    clientName: `catalog-ui-${suffix}-${Date.now()}`,
  });
  return {
    ...base,
    sendBufferMaxSize: parsePositiveInt(
      process.env.CATALOG_SEND_BUFFER_MAX_SIZE,
      DEFAULT_SEND_BUFFER_MAX_SIZE,
    ),
  };
}

function isInsufficientSpace(error) {
  if (!error) return false;
  if (error.subcode === 22) return true;
  const reason = String(error.reason || error.message || '');
  return /NO_SPACE|INSUFFICIENT_SPACE/i.test(reason);
}

/** High-frequency catalog events (many queue consumers → one session). */
function isThrottledCatalogEvent(payload) {
  const t = payload && payload.type;
  // Order events must not be throttled: PQ consumers emit prediction then order
  // synchronously, and a shared per-profile throttle would drop every order update.
  return t === 'prediction';
}

/**
 * Solace session for dashboard catalog/events publish and solace/command subscribe.
 */
class CatalogUiSession {
  constructor() {
    this.session = null;
    this.connected = false;
    this.onCommand = null;
    this._lastHighFreqPublishAt = new Map();
    this._lastDropLogAt = 0;
    this._droppedSinceLog = 0;
    this.eventMinIntervalMs = parsePositiveInt(
      process.env.CATALOG_EVENT_MIN_INTERVAL_MS,
      DEFAULT_CATALOG_EVENT_MIN_INTERVAL_MS,
    );
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
        reject(
          new Error(
            `${sessionEvent.infoStr || 'Connection failed'} (${formatSolaceConnectTarget()})`,
          ),
        );
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

  _shouldThrottle(profileId, payload) {
    if (!isThrottledCatalogEvent(payload)) return false;
    const now = Date.now();
    const last = this._lastHighFreqPublishAt.get(profileId) || 0;
    if (now - last < this.eventMinIntervalMs) return true;
    this._lastHighFreqPublishAt.set(profileId, now);
    return false;
  }

  _logDroppedSend() {
    this._droppedSinceLog += 1;
    const now = Date.now();
    if (now - this._lastDropLogAt < DROP_LOG_INTERVAL_MS) return;
    console.warn(
      `⚠️  Catalog UI publish dropped ${this._droppedSinceLog} event(s) (transport full — raise CATALOG_SEND_BUFFER_MAX_SIZE or CATALOG_EVENT_MIN_INTERVAL_MS)`,
    );
    this._droppedSinceLog = 0;
    this._lastDropLogAt = now;
  }

  publishTopic(topic, payload) {
    if (!this.session || !this.connected) return;
    const msg = solace.SolclientFactory.createMessage();
    msg.setDestination(solace.SolclientFactory.createTopicDestination(topic));
    attachJsonPayload(msg, payload);
    msg.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
    try {
      this.session.send(msg);
    } catch (error) {
      if (isInsufficientSpace(error)) {
        this._logDroppedSend();
        return;
      }
      throw error;
    }
  }

  publishEvent(profileId, payload) {
    if (this._shouldThrottle(profileId, payload)) return;
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

module.exports = { CatalogUiSession, isInsufficientSpace, isThrottledCatalogEvent };
