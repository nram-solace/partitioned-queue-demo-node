/**
 * Turns a profile's ui.topicExplorer preset filters into concrete Solace wildcard
 * topic strings, and matches already-received messages back against those filters.
 * Driven entirely by profile.messaging.topicPrefix/topicLevels.
 */

function filtersOf(preset) {
  if (preset?.anyOf?.length) return preset.anyOf
  return [preset?.filter || {}]
}

/**
 * @param {object} profile - validated demo profile
 * @param {object} filter - { [fieldName]: value } subset of messaging.topicLevels
 * @returns {string} e.g. "qdemo/ops/drilling/well/*\/TX/DRILLED/>"
 */
export function buildTopicFilterString(profile, filter = {}) {
  const { topicPrefix, topicLevels = [] } = profile.messaging
  const specifiedKeys = Object.keys(filter).filter((k) => filter[k] != null)
  if (specifiedKeys.length === 0) {
    return `${topicPrefix}/>`
  }
  let lastIndex = -1
  topicLevels.forEach((field, i) => {
    if (filter[field] != null) lastIndex = i
  })
  const parts = [topicPrefix]
  for (let i = 0; i <= lastIndex; i++) {
    const field = topicLevels[i]
    parts.push(filter[field] != null ? String(filter[field]) : '*')
  }
  parts.push('>')
  return parts.join('/')
}

/** @returns {string[]} one topic string per anyOf entry, or one for a single filter */
export function presetTopics(profile, preset) {
  return filtersOf(preset).map((f) => buildTopicFilterString(profile, f))
}

/**
 * Whether a topic string is one of this profile's own business-event topics (as
 * opposed to the dashboard's unrelated solace/catalog/* control-plane traffic that
 * also arrives on the same shared session).
 */
export function topicBelongsToProfile(profile, topic) {
  const prefix = profile?.messaging?.topicPrefix
  if (!prefix || !topic) return false
  return topic === prefix || topic.startsWith(`${prefix}/`)
}

function messageMatchesFilter(message, filter) {
  return Object.entries(filter).every(([field, value]) => message?.[field] === value)
}

/** @returns {boolean} whether a parsed message satisfies a preset's filter/anyOf */
export function presetMatches(message, preset) {
  return filtersOf(preset).some((f) => messageMatchesFilter(message, f))
}
