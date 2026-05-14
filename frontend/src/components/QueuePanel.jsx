import ConsumerTile from './ConsumerTile'

const partitionStateMap = {
  balanced: { text: 'BALANCED', color: 'text-green-400' },
  rebalancing: { text: 'REBALANCING', color: 'text-yellow-400' },
  unknown: { text: 'UNKNOWN', color: 'text-gray-400' },
}

const healthStateMap = {
  healthy: { text: 'HEALTHY', color: 'text-green-400' },
  degraded: { text: 'DEGRADED', color: 'text-yellow-400' },
  down: { text: 'DOWN', color: 'text-red-500' },
  unknown: { text: 'UNKNOWN', color: 'text-gray-400' },
}

function QueuePanel({
  consumers,
  queueType,
  partitionState,
  queueState,
  onDisconnect,
  onReconnect,
  queueName,
  profile,
}) {
  const connectedConsumers = consumers.filter(
    (c) => c.status === 'connected' || c.status === 'active' || c.status === 'standby',
  ).length
  const totalConsumers = consumers.length

  const leftLabel =
    queueType === 'partitioned'
      ? 'Partitioned queue'
      : queueType === 'non-exclusive'
        ? 'Non-exclusive queue'
        : 'Exclusive queue'

  const displayQueueName = queueName && String(queueName).trim() ? queueName : '…'

  const centerContent =
    queueType === 'partitioned' ? (
      <>
        <span className="text-slate-400 font-medium">Queue :</span>{' '}
        <span className="font-mono text-slate-100">{displayQueueName}</span>{' '}
        <span className={(partitionStateMap[partitionState] || partitionStateMap.unknown).color}>
          [{(partitionStateMap[partitionState] || partitionStateMap.unknown).text}]
        </span>
      </>
    ) : (
      <>
        <span className="text-slate-400 font-medium">Queue :</span>{' '}
        <span className="font-mono text-slate-100">{displayQueueName}</span>
      </>
    )

  const hState = healthStateMap[queueState] || healthStateMap.unknown

  const getBgColors = () => {
    if (queueType === 'partitioned') {
      return { outer: 'bg-slate-800', inner: 'bg-slate-750', border: 'border-blue-800' }
    }
    if (queueType === 'non-exclusive') {
      return { outer: 'bg-slate-800', inner: 'bg-slate-750', border: 'border-purple-800' }
    }
    return { outer: 'bg-slate-800', inner: 'bg-slate-750', border: 'border-orange-900' }
  }

  const colors = getBgColors()

  return (
    <div className={`${colors.outer} rounded-lg border-2 ${colors.border} overflow-hidden`}>
      <div className={`${colors.inner} px-6 py-4 border-b border-slate-700`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-lg font-semibold text-white">
          <div className="min-w-0 shrink">
            <span>{leftLabel} Consumer</span>
          </div>
          <div className="min-w-0 flex-1 text-center text-base sm:text-lg">{centerContent}</div>
          <div className="shrink-0 text-right whitespace-nowrap">
            <span className="text-slate-400 font-medium">Status:</span>{' '}
            <span className={hState.color}>{hState.text}</span>
            <span className="mx-2 text-slate-500" aria-hidden>
              ·
            </span>
            <span>
              {connectedConsumers} / {totalConsumers} Up
            </span>
          </div>
        </div>
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
