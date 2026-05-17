const {
  listDemoProfiles,
  resolveProfilesDir,
  defaultProfileId,
} = require('./demoProfile');
const { ProfileConsumerManager } = require('./profileConsumerManager');
const { CatalogUiSession } = require('./uiPublisher');
const { SessionRouter } = require('./sessionRouter');

class DashboardBridge {
  constructor() {
    this.profiles = [];
    /** @type {Map<string, ProfileConsumerManager>} */
    this.managers = new Map();
    this.router = null;
    this.uiSession = new CatalogUiSession();
  }

  getManager(profileId) {
    return this.managers.get(profileId);
  }

  publishSnapshotForSession(sessionId) {
    if (!sessionId) return;
    const profileId = this.router.getProfileId(sessionId);
    const manager = this.managers.get(profileId);
    if (!manager) return;
    manager.refreshOperationalState();
    this.uiSession.publishSessionSnapshot(sessionId, profileId, manager.buildStatePayload());
  }

  publishProfilesCatalog() {
    this.uiSession.publishProfilesCatalog(this.profiles, defaultProfileId(this.profiles));
    console.log('📋 Published UI profile catalog to solace/catalog/profiles');
  }

  handleCommand(data) {
    const sessionId = data.sessionId;
    if (!sessionId) {
      console.warn('⚠️  Command missing sessionId:', data.type);
      return;
    }

    if (data.type === 'selectProfile') {
      if (!data.profileId) return;
      try {
        this.router.selectProfile(sessionId, data.profileId);
        console.log(`📌 Session ${sessionId} → profile ${data.profileId}`);
        this.publishSnapshotForSession(sessionId);
      } catch (e) {
        console.warn(`⚠️  selectProfile failed: ${e.message}`);
      }
      return;
    }

    if (data.type === 'requestSnapshot') {
      this.publishProfilesCatalog();
      this.publishSnapshotForSession(sessionId);
      return;
    }

    const profileId = data.profileId || this.router.getProfileId(sessionId);
    const manager = this.managers.get(profileId);
    if (!manager) return;

    if (data.type === 'disconnect') {
      manager.handleDisconnectRequest(data.consumerId);
    } else if (data.type === 'reconnect') {
      void manager.handleReconnectRequest(data.consumerId);
    }
  }

  async start() {
    this.profiles = listDemoProfiles(resolveProfilesDir());
    this.router = new SessionRouter(this.profiles);

    for (const profile of this.profiles) {
      const manager = new ProfileConsumerManager(profile, (msg) => {
        this.uiSession.publishEvent(profile.id, msg);
      });
      this.managers.set(profile.id, manager);
    }

    await this.uiSession.connect({
      onCommand: (data) => this.handleCommand(data),
    });

    this.publishProfilesCatalog();

    for (const profile of this.profiles) {
      console.log(`🚀 Starting consumers for profile: ${profile.id}`);
      await this.managers.get(profile.id).startConsumers();
    }

    console.log(
      `✅ Dashboard bridge ready — ${this.profiles.length} profile(s): ${this.profiles.map((p) => p.id).join(', ')}`,
    );
  }

  stop() {
    for (const manager of this.managers.values()) {
      manager.stop();
    }
    this.uiSession.disconnect();
  }
}

module.exports = { DashboardBridge };
