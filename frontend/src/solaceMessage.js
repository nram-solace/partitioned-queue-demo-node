/**
 * Decode solclientjs binary attachments as UTF-8 JSON (avoids latin1 mis-read of UTF-8 text).
 */
export function binaryAttachmentToString(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') return raw
  if (raw instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(raw)
  if (ArrayBuffer.isView(raw)) {
    return new TextDecoder('utf-8').decode(raw)
  }
  return String(raw)
}

export function parseSolaceJsonMessage(message) {
  const text = binaryAttachmentToString(message.getBinaryAttachment())
  if (!text) return null
  return JSON.parse(text)
}

export function encodeJsonAttachment(payload) {
  return new TextEncoder().encode(JSON.stringify(payload))
}
