import ConsumerTile from './ConsumerTile'

function QueuePanel({ title, description, consumers, queueType, partitionState, queueState, onDisconnect, onReconnect }) {
  // Format state for display
  const getStateDisplay = () => {
    let currentState = null

    if (queueType === 'partitioned') {
      currentState = partitionState
      const stateMap = {
        'balanced': { text: 'BALANCED', color: 'text-green-400' },
        'rebalancing': { text: 'REBALANCING', color: 'text-yellow-400' },
        'unknown': { text: 'UNKNOWN', color: 'text-gray-400' }
      }
      const state = stateMap[currentState] || stateMap.unknown
      return (
        <span className={`ml-2 ${state.color} font-semibold`}>
          [{state.text}]
        </span>
      )
    } else if (queueType === 'non-exclusive' || queueType === 'exclusive') {
      currentState = queueState
      const stateMap = {
        'operational': { text: 'OPERATIONAL', color: 'text-green-400' },
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
        <h2 className="text-xl font-bold mb-1">
          {title}
          {getStateDisplay()}
        </h2>
        <p className="text-sm text-slate-400">{description}</p>
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
