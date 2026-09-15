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

function toPlaceholder(field) {
  return field.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * The full published-topic pattern for a profile, e.g.
 * "qdemo/ops/drilling/well/<region>/<state>/<status>/<well-id>" — the fixed
 * topicPrefix followed by each messaging.topicLevels field, then the
 * per-key topicSuffixFromField.
 */
export function buildPublishedTopicPattern(profile) {
  const { topicPrefix, topicLevels = [], topicSuffixFromField } = profile?.messaging || {}
  if (!topicPrefix) return ''
  const fields = [...topicLevels, topicSuffixFromField].filter(Boolean)
  return [topicPrefix, ...fields.map((f) => `<${toPlaceholder(f)}>`)].join('/')
}

function describeField(profile, fieldName, isSuffixField) {
  const displayField = (profile?.ui?.displayFields || []).find((f) => f.field === fieldName)
  const label = displayField?.label || fieldName[0].toUpperCase() + fieldName.slice(1)
  const suffix = isSuffixField ? ' (partition key)' : ''
  return `${toPlaceholder(fieldName)} = ${label}${suffix}`
}

/**
 * One human-readable line per field in the published-topic pattern, in
 * topic order (messaging.topicLevels, then topicSuffixFromField) — for
 * example ["region = Region", "well-id = Well (partition key)"]. Labels come
 * from ui.displayFields where the profile declares one, since messageFields
 * (enum values etc.) is intentionally left off the wire profile.
 */
export function describePublishedTopicFields(profile) {
  const { topicLevels = [], topicSuffixFromField } = profile?.messaging || {}
  const fields = [...topicLevels, topicSuffixFromField].filter(Boolean)
  return fields.map((f) => describeField(profile, f, f === topicSuffixFromField))
}
