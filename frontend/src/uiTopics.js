/**
 * Solace UI control-plane topic helpers — mirror backend/lib/uiTopics.js.
 * Root solace/catalog — separate from profile domain topics under solace/demo/.
 */
export const UI_ROOT = 'solace/catalog'

export function catalogProfiles() {
  return `${UI_ROOT}/profiles`
}

export function statsPublisher(profileId) {
  return `${UI_ROOT}/stats/${profileId}/publisher`
}

export function events(profileId) {
  return `${UI_ROOT}/events/${profileId}`
}

export function sessionSnapshot(sessionId) {
  return `${UI_ROOT}/session/${sessionId}/snapshot`
}

export function sessionCommand(sessionId) {
  return `${UI_ROOT}/session/${sessionId}/command`
}

export function commandsControl() {
  return `${UI_ROOT}/commands/control`
}

export function commandsWildcard() {
  return `${UI_ROOT}/commands/>`
}
