/** Shared dashboard message handlers (Solace catalog topics + legacy WS). */

export function deriveQueueNamesFromConsumers(consumers) {
  if (!consumers?.length) return null
  const p = consumers.find((c) => c.queueType === 'partitioned')
  const n = consumers.find((c) => c.queueType === 'non-exclusive')
  const e = consumers.find((c) => c.queueType === 'exclusive')
  if (!p || !n || !e) return null
  return {
    partitioned: p.queueName,
    nonExclusive: n.queueName,
    exclusive: e.queueName,
  }
}

/**
 * @param {object} data - parsed JSON message
 * @param {object} handlers
 */
export function handleDashboardMessage(data, handlers) {
  const {
    onDemoProfile,
    onOrder,
    onPrediction,
    onStatus,
    onState,
    onPublisherStats,
    onPartitionState,
    onQueueState,
    canonicalNqConsumer,
  } = handlers

  if (data.type === 'demoProfile') {
    onDemoProfile?.(data)
    return
  }
  if (data.type === 'order') {
    onOrder?.(data)
    return
  }
  if (data.type === 'prediction') {
    if (data.queueType === 'non-exclusive' && data.consumerNumber !== canonicalNqConsumer) {
      return
    }
    onPrediction?.(data)
    return
  }
  if (data.type === 'status') {
    onStatus?.(data)
    return
  }
  if (data.type === 'state') {
    onState?.(data)
    return
  }
  if (data.type === 'publisherStats') {
    onPublisherStats?.(data)
    return
  }
  if (data.type === 'partitionState') {
    onPartitionState?.(data.state)
    return
  }
  if (data.type === 'queueState') {
    onQueueState?.(data)
  }
}
