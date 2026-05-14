import { motion, AnimatePresence } from 'framer-motion'

function hashHue(str) {
  let h = 0
  const s = String(str ?? '')
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0
  }
  return Math.abs(h) % 360
}

function partitionKeyColors(key) {
  const hue = hashHue(key)
  return {
    text: `hsl(${hue} 70% 72%)`,
    border: `hsl(${hue} 45% 42%)`,
    bg: `hsl(${hue} 28% 14%)`,
    glow: `hsla(${hue} 55% 50% / 0.35)`,
  }
}

function formatOrderField(order, spec) {
  const raw = order?.[spec.field]
  if (raw === undefined || raw === null) return '—'

  switch (spec.format) {
    case 'currency': {
      const cur = spec.currency || 'USD'
      try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(Number(raw))
      } catch {
        return String(raw)
      }
    }
    case 'number':
      return typeof raw === 'number' ? raw.toLocaleString() : String(raw)
    case 'badge':
      return String(raw)
    default:
      return String(raw)
  }
}

function BadgeRow({ value }) {
  const v = String(value)
  const up = v === 'BUY'
  const down = v === 'SELL'
  const accent = up ? 'text-green-400' : down ? 'text-red-400' : 'text-slate-200'
  const arrow = up ? '↑' : down ? '↓' : ''

  return (
    <div className="flex items-center justify-between mb-2 gap-2">
      <span className={`text-lg font-semibold px-2 py-0.5 rounded border border-slate-600 bg-slate-800/80 ${accent}`}>
        {v}
      </span>
      {arrow ? <span className={`text-sm ${accent}`}>{arrow}</span> : null}
    </div>
  )
}

function ConsumerTile({ consumer, queueType, consumerNumber, onDisconnect, onReconnect, profile }) {
  const isActive = consumer.status === 'active'
  const isStandby = consumer.status === 'standby'
  const latestOrder = consumer.lastOrders && consumer.lastOrders[0]
  const profileLoading = !profile
  const displayFields = profile?.ui?.displayFields
  const partitionField = profile?.messaging?.partitionKeyField
  const colorKey =
    latestOrder && partitionField != null ? latestOrder[partitionField] : consumer.assignedPartitionKey
  const colors = partitionKeyColors(colorKey || 'default')

  const primarySpec = displayFields?.find((f) => f.prominent) || displayFields?.[0]
  const currencySpec = displayFields?.find((d) => d.format === 'currency')
  const showRecent =
    !profileLoading &&
    consumer.lastOrders &&
    consumer.lastOrders.length > 1 &&
    isActive &&
    primarySpec

  const getStatusIcon = () => {
    if (consumer.status === 'offline') return '⚫'
    if (consumer.status === 'down') return '🔴'
    if (isStandby) return '⚪'
    if (isActive) return '🟢'
    if (consumer.status === 'connected') return '🔵'
    if (consumer.status === 'error') return '🔴'
    return '🟡'
  }

  const getStatusText = () => {
    if (consumer.status === 'offline') return 'OFFLINE'
    if (consumer.status === 'down') return 'Down'
    if (isStandby) return 'Standby'
    if (isActive) return 'Active'
    if (consumer.status === 'connected') return 'Connected'
    if (consumer.status === 'error') return 'Error'
    return 'Connecting'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: isStandby ? 0.4 : 1,
        y: 0,
        boxShadow: isActive && latestOrder && colorKey
          ? `0 0 20px ${colors.glow}`
          : '0 0 0px transparent'
      }}
      transition={{ duration: 0.3 }}
      className={`
        relative bg-slate-900 rounded-lg border-2 p-4
        ${isActive ? 'border-green-500/50' : 'border-slate-700'}
        ${isStandby ? 'opacity-50' : ''}
      `}
    >
      <div className="mb-3 pb-3 border-b border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold">Consumer {consumerNumber}</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span>{getStatusIcon()}</span>
              <span className="text-xs">{getStatusText()}</span>
            </div>
            {consumer.status === 'down' ? (
              <button
                onClick={() => onReconnect(consumer.id)}
                className="text-slate-500 hover:text-green-400 transition-colors"
                title="Reconnect consumer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            ) : consumer.status !== 'offline' ? (
              <button
                onClick={() => onDisconnect(consumer.id)}
                className="text-slate-500 hover:text-red-400 transition-colors"
                title="Disconnect consumer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">{consumer.queueName}</p>
          {queueType === 'partitioned' && consumer.assignedPartitionKey && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded border"
              style={{
                color: partitionKeyColors(consumer.assignedPartitionKey).text,
                borderColor: partitionKeyColors(consumer.assignedPartitionKey).border,
                backgroundColor: partitionKeyColors(consumer.assignedPartitionKey).bg,
              }}
            >
              {consumer.assignedPartitionKey}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-[180px] mb-3">
        {profileLoading ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            Loading profile…
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {latestOrder && isActive ? (
              <motion.div
                key={latestOrder.orderId || latestOrder.cartRef || JSON.stringify(latestOrder)}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="rounded-lg p-3 border-l-4"
                style={{
                  borderLeftColor: colors.border,
                  backgroundColor: colors.bg,
                }}
              >
                {displayFields?.filter((f) => f.prominent).map((spec) => (
                  <div key={spec.field} className="mb-2">
                    {spec.format === 'badge' ? (
                      <BadgeRow value={latestOrder[spec.field]} />
                    ) : (
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-2xl font-bold" style={{ color: colors.text }}>
                          {formatOrderField(latestOrder, spec)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                <div className="space-y-1 text-xs mt-2">
                  {displayFields
                    ?.filter((f) => !f.prominent)
                    .map((spec) => (
                      <div key={spec.field} className="flex justify-between gap-2">
                        <span className="text-slate-400 shrink-0">{spec.label}:</span>
                        <span className="font-semibold text-right">
                          {spec.format === 'badge' ? (
                            <span className="rounded px-1.5 py-0.5 bg-slate-800 border border-slate-600">
                              {formatOrderField(latestOrder, spec)}
                            </span>
                          ) : (
                            formatOrderField(latestOrder, spec)
                          )}
                        </span>
                      </div>
                    ))}
                </div>

                {latestOrder.timestamp && (
                  <div className="text-slate-500 text-[10px] mt-2">
                    {new Date(latestOrder.timestamp).toLocaleTimeString()}.
                    {new Date(latestOrder.timestamp).getMilliseconds().toString().padStart(3, '0')}
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                {isStandby ? 'Waiting…' : 'No messages yet'}
              </div>
            )}
          </AnimatePresence>
        )}

        {showRecent && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <p className="text-xs text-slate-500 mb-2">Recent:</p>
            <div className="space-y-1">
              {consumer.lastOrders.slice(1, 4).map((order, idx) => (
                <div
                  key={`${String(order[primarySpec.field])}-${idx}`}
                  className="text-xs flex justify-between text-slate-400 gap-2"
                >
                  <span style={{ color: partitionKeyColors(order[primarySpec.field]).text }}>
                    {formatOrderField(order, primarySpec)}
                  </span>
                  <span>{currencySpec ? formatOrderField(order, currencySpec) : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-slate-700 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">📊 Processed:</span>
          <span className="font-semibold">{consumer.messagesProcessed.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">⚡ Rate:</span>
          <span className="font-semibold">{consumer.rate || 0} msg/s</span>
        </div>
      </div>
    </motion.div>
  )
}

export default ConsumerTile
