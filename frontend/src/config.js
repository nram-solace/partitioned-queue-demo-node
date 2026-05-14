/** WebSocket URL for the consumer + dashboard server (must match `WS_PORT` in solace.env). */
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8081'
