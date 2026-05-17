const { defaultProfileId } = require('./demoProfile');

class SessionRouter {
  /**
   * @param {object[]} profiles validated profile objects
   */
  constructor(profiles) {
    this.profileIds = new Set(profiles.map((p) => p.id));
    this.defaultId = defaultProfileId(profiles);
    /** @type {Map<string, { profileId: string }>} */
    this.sessions = new Map();
  }

  selectProfile(sessionId, profileId) {
    if (!sessionId) {
      throw new Error('sessionId is required');
    }
    if (!this.profileIds.has(profileId)) {
      throw new Error(`Unknown profileId: ${profileId}`);
    }
    this.sessions.set(sessionId, { profileId });
    return profileId;
  }

  getProfileId(sessionId) {
    if (!sessionId) {
      return this.defaultId;
    }
    return this.sessions.get(sessionId)?.profileId ?? this.defaultId;
  }
}

module.exports = { SessionRouter };
