/**
 * Profile subset for solace/catalog messages (avoids large messageFields on the wire).
 */
function slimProfile(profile) {
  return {
    id: profile.id,
    branding: profile.branding,
    messaging: profile.messaging,
    features: profile.features,
    labels: profile.labels,
    ui: profile.ui,
  };
}

function attachJsonPayload(message, payload) {
  const text = JSON.stringify(payload);
  message.setBinaryAttachment(Buffer.from(text, 'utf8'));
}

function parseJsonAttachment(raw) {
  if (raw == null) {
    return null;
  }
  if (Buffer.isBuffer(raw)) {
    return JSON.parse(raw.toString('utf8'));
  }
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }
  if (raw instanceof Uint8Array) {
    return JSON.parse(Buffer.from(raw).toString('utf8'));
  }
  return JSON.parse(Buffer.from(raw).toString('utf8'));
}

module.exports = { slimProfile, attachJsonPayload, parseJsonAttachment };
