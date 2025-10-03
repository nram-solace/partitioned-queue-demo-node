import { motion, AnimatePresence } from 'framer-motion'

const symbolColors = {
  'AAPL': 'text-blue-400 border-blue-500',
  'GOOGL': 'text-red-400 border-red-500',
  'MSFT': 'text-green-400 border-green-500',
  'AMZN': 'text-orange-400 border-orange-500',
  'TSLA': 'text-purple-400 border-purple-500',
}

const symbolBgColors = {
  'AAPL': 'bg-blue-500/10',
  'GOOGL': 'bg-red-500/10',
  'MSFT': 'bg-green-500/10',
  'AMZN': 'bg-orange-500/10',
  'TSLA': 'bg-purple-500/10',
}

function ConsumerTile({ consumer, queueType, consumerNumber, onDisconnect, onReconnect }) {
  const isActive = consumer.status === 'active'
  const isStandby = consumer.status === 'standby'
  const latestOrder = consumer.lastOrders && consumer.lastOrders[0]

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
        boxShadow: isActive && latestOrder
          ? `0 0 20px ${getGlowColor(latestOrder.symbol)}`
          : '0 0 0px transparent'
      }}
      transition={{ duration: 0.3 }}
      className={`
        relative bg-slate-900 rounded-lg border-2 p-4
        ${isActive ? 'border-green-500/50' : 'border-slate-700'}
        ${isStandby ? 'opacity-50' : ''}
      `}
    >
      {/* Header */}
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
          {queueType === 'partitioned' && consumer.assignedSymbol && (
            <span className={`
              text-xs font-bold px-2 py-0.5 rounded border
              ${symbolColors[consumer.assignedSymbol] || 'text-slate-400 border-slate-500'}
              ${symbolBgColors[consumer.assignedSymbol] || 'bg-slate-800'}
            `}>
              {consumer.assignedSymbol}
            </span>
          )}
        </div>
      </div>

      {/* Latest Order */}
      <div className="min-h-[180px] mb-3">
        <AnimatePresence mode="popLayout">
          {latestOrder && isActive ? (
            <motion.div
              key={latestOrder.orderId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`
                ${symbolBgColors[latestOrder.symbol] || 'bg-slate-800'}
                rounded-lg p-3 border-l-4
                ${symbolColors[latestOrder.symbol]?.split(' ')[1] || 'border-slate-500'}
              `}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-2xl font-bold ${symbolColors[latestOrder.symbol]?.split(' ')[0] || 'text-slate-400'}`}>
                  {latestOrder.symbol}
                </span>
                <span className={`text-sm ${latestOrder.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                  {latestOrder.side === 'BUY' ? '↑' : '↓'}
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Price:</span>
                  <span className="font-semibold">${latestOrder.price}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Qty:</span>
                  <span className="font-semibold">{latestOrder.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Type:</span>
                  <span className="font-semibold">{latestOrder.orderType}</span>
                </div>
                <div className="text-slate-500 text-[10px] mt-2">
                  {new Date(latestOrder.timestamp).toLocaleTimeString()}.
                  {new Date(latestOrder.timestamp).getMilliseconds().toString().padStart(3, '0')}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-600 text-sm">
              {isStandby ? 'Waiting...' : 'No messages yet'}
            </div>
          )}
        </AnimatePresence>

        {/* Previous Orders */}
        {consumer.lastOrders && consumer.lastOrders.length > 1 && isActive && (
          <div className="mt-3 pt-3 border-t border-slate-700">
            <p className="text-xs text-slate-500 mb-2">Recent:</p>
            <div className="space-y-1">
              {consumer.lastOrders.slice(1, 4).map((order, idx) => (
                <div key={`${order.orderId}-${idx}`} className="text-xs flex justify-between text-slate-400">
                  <span className={symbolColors[order.symbol]?.split(' ')[0] || 'text-slate-400'}>
                    {order.symbol}
                  </span>
                  <span>${order.price}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
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

function getGlowColor(symbol) {
  const colors = {
    'AAPL': 'rgba(33, 150, 243, 0.3)',
    'GOOGL': 'rgba(244, 67, 54, 0.3)',
    'MSFT': 'rgba(76, 175, 80, 0.3)',
    'AMZN': 'rgba(255, 152, 0, 0.3)',
    'TSLA': 'rgba(156, 39, 176, 0.3)',
  }
  return colors[symbol] || 'rgba(100, 116, 139, 0.3)'
}

export default ConsumerTile
