/**
 * Wrap dashboard JSON payloads for Solace UI topics.
 */
function wrapUiEnvelope(profileId, payload, sessionId = null) {
  return {
    ...payload,
    profileId,
    sessionId,
    ts: new Date().toISOString(),
  };
}

module.exports = { wrapUiEnvelope };
