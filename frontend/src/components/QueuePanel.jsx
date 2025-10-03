import ConsumerTile from './ConsumerTile'

function QueuePanel({ title, description, consumers, queueType, partitionState, queueState, onDisconnect, onReconnect }) {
  // Calculate consumer counts
  const connectedConsumers = consumers.filter(c =>
    c.status === 'connected' || c.status === 'active' || c.status === 'standby'
  ).length
  const totalConsumers = consumers.length

  // Format state for display
  const getStateDisplay = () => {
    let currentState = null

    if (queueType === 'partitioned') {
      // Show both partition state (balanced/rebalancing) and health state (healthy/degraded/down)
      const partitionStateMap = {
        'balanced': { text: 'BALANCED', color: 'text-green-400' },
        'rebalancing': { text: 'REBALANCING', color: 'text-yellow-400' },
        'unknown': { text: 'UNKNOWN', color: 'text-gray-400' }
      }
      const healthStateMap = {
        'healthy': { text: 'HEALTHY', color: 'text-green-400' },
        'degraded': { text: 'DEGRADED', color: 'text-yellow-400' },
        'down': { text: 'DOWN', color: 'text-red-500' },
        'unknown': { text: 'UNKNOWN', color: 'text-gray-400' }
      }

      const pState = partitionStateMap[partitionState] || partitionStateMap.unknown
      const hState = healthStateMap[queueState] || healthStateMap.unknown

      return (
        <span className="ml-2 font-semibold">
          <span className={hState.color}>[{hState.text}]</span>
          <span className="mx-1">·</span>
          <span className={pState.color}>[{pState.text}]</span>
        </span>
      )
    } else if (queueType === 'non-exclusive' || queueType === 'exclusive') {
      currentState = queueState
      const stateMap = {
        'healthy': { text: 'HEALTHY', color: 'text-green-400' },
        'degraded': { text: 'DEGRADED', color: 'text-yellow-400' },
        'down': { text: 'DOWN', color: 'text-red-500' },
        'unknown': { text: 'UNKNOWN', color: 'text-gray-400' }
      }
      const state = stateMap[currentState] || stateMap.unknown
      return (
        <span className={`ml-2 ${state.color} font-semibold`}>
          [{state.text}]
        </span>
      )
    }

    return ''
  }

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="bg-slate-750 px-6 py-4 border-b border-slate-700">
        <h2 className="text-xl font-bold flex items-center justify-between">
          <span>
            {title}
            {getStateDisplay()}
          </span>
          <span className="text-sm font-normal text-slate-300">
            {connectedConsumers} / {totalConsumers} consumers up.
          </span>
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
          />
        ))}
      </div>
    </div>
  )
}

export default QueuePanel
