/**
 * Browser → consumer control plane (separate from solace/catalog/ UI data).
 * Keep in sync with frontend/src/commandTopics.js
 */
const COMMAND_ROOT = 'solace/command';

function commandSession(sessionId) {
  return `${COMMAND_ROOT}/session/${sessionId}`;
}

function commandWildcard() {
  return `${COMMAND_ROOT}/>`;
}

module.exports = {
  COMMAND_ROOT,
  commandSession,
  commandWildcard,
};
