export const QUEUE_NAMES = {
  PARTITIONED: 'Orders_PQ',
  NON_EXCLUSIVE: 'Orders_NQ',
  EXCLUSIVE: 'Orders_EQ'
}

export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8081'
