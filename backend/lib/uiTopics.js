/**
 * Solace UI control-plane topic helpers (Feature 1: message catalog over topics).
 * Root solace/catalog — separate from profile domain topics under solace/demo/.
 * Keep in sync with frontend/src/uiTopics.js
 */
const UI_ROOT = 'solace/catalog';

function catalogProfiles() {
  return `${UI_ROOT}/profiles`;
}

function statsPublisher(profileId) {
  return `${UI_ROOT}/stats/${profileId}/publisher`;
}

/** Single events topic per profile; JSON `type` discriminates (order, status, …). */
function events(profileId) {
  return `${UI_ROOT}/events/${profileId}`;
}

/** Feature 2 — session-scoped snapshot (reserved). */
function sessionSnapshot(sessionId) {
  return `${UI_ROOT}/session/${sessionId}/snapshot`;
}

function sessionTopics(sessionId) {
  return `${UI_ROOT}/session/${sessionId}/>`;
}

function sessionWildcard() {
  return `${UI_ROOT}/session/>`;
}

module.exports = {
  UI_ROOT,
  catalogProfiles,
  statsPublisher,
  events,
  sessionSnapshot,
  sessionTopics,
  sessionWildcard,
};
