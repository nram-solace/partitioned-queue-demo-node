const STORAGE_KEY = 'solace-demo-dashboard-session-id'

export function getOrCreateSessionId() {
  if (typeof sessionStorage === 'undefined') {
    return crypto.randomUUID()
  }
  let id = sessionStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(STORAGE_KEY, id)
  }
  return id
}
