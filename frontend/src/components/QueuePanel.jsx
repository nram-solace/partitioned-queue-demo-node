import ConsumerTile from './ConsumerTile'

function QueuePanel({ title, description, consumers, queueType, partitionState, queueState, onDisconnect, onReconnect, queueName, messageCount, profile }) {
  // Calculate consumer counts
  const connectedConsumers = consumers.filter(c =>
    c.status === 'connected' || c.status === 'active' || c.status === 'standby'
  ).length
  const totalConsumers = consumers.length

  // Format display text
  const getLeftText = () => {
    const partitionStateMap = {
      'balanced': { text: 'BALANCED', color: 'text-green-400' },
      'rebalancing': { text: 'REBALANCING', color: 'text-yellow-400' },
      'unknown': { text: 'UNKNOWN', color: 'text-gray-400' }
    }

    if (queueType === 'partitioned') {
      const pState = partitionStateMap[partitionState] || partitionStateMap.unknown
      return (
        <>
          <span>Partitioned Queue: {queueName} </span>
          <span className={pState.color}>[{pState.text}]</span>
        </>
      )
    } else if (queueType === 'non-exclusive') {
      return <span>Non-Exclusive Queue: {queueName}</span>
    } else if (queueType === 'exclusive') {
      return <span>Exclusive Queue: {queueName}</span>
    }
  }

  const getRightText = () => {
    const healthStateMap = {
      'healthy': { text: 'HEALTHY', color: 'text-green-400' },
      'degraded': { text: 'DEGRADED', color: 'text-yellow-400' },
      'down': { text: 'DOWN', color: 'text-red-500' },
      'unknown': { text: 'UNKNOWN', color: 'text-gray-400' }
    }

    const hState = healthStateMap[queueState] || healthStateMap.unknown

    // Format message count with commas
    const formattedCount = (messageCount || 0).toLocaleString()

    return (
      <>
        <span>Status: </span>
        <span className={hState.color}>{hState.text}</span>
        <span className="ml-3 text-slate-400">|</span>
        <span className="ml-3">{connectedConsumers} / {totalConsumers} Up</span>
        <span className="ml-3 text-slate-400">|</span>
        <span className="ml-3">{formattedCount} msgs</span>
      </>
    )
  }

  // Different background colors for each queue type
  const getBgColors = () => {
    if (queueType === 'partitioned') {
      return { outer: 'bg-slate-800', inner: 'bg-slate-750', border: 'border-blue-800' }
    } else if (queueType === 'non-exclusive') {
      return { outer: 'bg-slate-800', inner: 'bg-slate-750', border: 'border-purple-800' }
    } else {
      return { outer: 'bg-slate-800', inner: 'bg-slate-750', border: 'border-orange-900' }
    }
  }

  const colors = getBgColors()

  return (
    <div className={`${colors.outer} rounded-lg border-2 ${colors.border} overflow-hidden`}>
      <div className={`${colors.inner} px-6 py-4 border-b border-slate-700`}>
        <h2 className="text-lg font-semibold flex items-center justify-between">
          <span>{getLeftText()}</span>
          <span>{getRightText()}</span>
        </h2>
      </div>

      <div className="grid grid-cols-5 gap-4 p-6">
        {consumers.map((consumer, index) => (
          <ConsumerTile
            key={consumer.id}
            consumer={consumer}
            queueType={queueType}
            consumerNumber={index + 1}
            onDisconnect={onDisconnect}
            onReconnect={onReconnect}
            profile={profile}
          />
        ))}
      </div>
    </div>
  )
}

export default QueuePanel
