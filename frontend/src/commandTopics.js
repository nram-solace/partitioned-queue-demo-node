/**
 * Browser → consumer control plane — mirror backend/lib/commandTopics.js
 */
export const COMMAND_ROOT = 'solace/command'

export function commandSession(sessionId) {
  return `${COMMAND_ROOT}/session/${sessionId}`
}

export function commandWildcard() {
  return `${COMMAND_ROOT}/>`
}
