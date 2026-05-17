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

/** Feature 2 — per-session commands (reserved). */
function sessionCommand(sessionId) {
  return `${UI_ROOT}/session/${sessionId}/command`;
}

/** Feature 1 — shared command topic until session routing ships. */
function commandsControl() {
  return `${UI_ROOT}/commands/control`;
}

function commandsWildcard() {
  return `${UI_ROOT}/commands/>`;
}

module.exports = {
  UI_ROOT,
  catalogProfiles,
  statsPublisher,
  events,
  sessionSnapshot,
  sessionCommand,
  commandsControl,
  commandsWildcard,
};
