import { useState, useEffect, useRef } from 'react'
import QueuePanel from './components/QueuePanel'
import Header from './components/Header'
import PublisherStatus from './components/PublisherStatus'
import PredictionView from './components/PredictionView'
import { WS_URL, NQ_PREDICTION_CONSUMER } from './config'

const CANONICAL_NQ_CONSUMER = NQ_PREDICTION_CONSUMER
const HISTORY_LIMIT = 100

function deriveQueueNamesFromConsumers(consumers) {
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

function App() {
  const [profile, setProfile] = useState(null)
  const [queueNames, setQueueNames] = useState(null)

  const [consumers, setConsumers] = useState({
    partitioned: Array(5)
      .fill(null)
      .map((_, i) => ({
        id: i + 1,
        queueName: '',
        queueType: 'partitioned',
        consumerNumber: i + 1,
        status: 'offline',
        messagesProcessed: 0,
        rate: 0,
        lastOrders: [],
        assignedPartitionKey: null,
      })),
    nonExclusive: Array(5)
      .fill(null)
      .map((_, i) => ({
        id: i + 6,
        queueName: '',
        queueType: 'non-exclusive',
        consumerNumber: i + 1,
        status: 'offline',
        messagesProcessed: 0,
        rate: 0,
        lastOrders: [],
      })),
    exclusive: Array(5)
      .fill(null)
      .map((_, i) => ({
        id: i + 11,
        queueName: '',
        queueType: 'exclusive',
        consumerNumber: i + 1,
        status: 'offline',
        messagesProcessed: 0,
        rate: 0,
        lastOrders: [],
      })),
  })

  const [wsConnected, setWsConnected] = useState(false)
  const [partitionState, setPartitionState] = useState('unknown')
  const [partitionedState, setPartitionedState] = useState('unknown')
  const [nonExclusiveState, setNonExclusiveState] = useState('unknown')
  const [exclusiveState, setExclusiveState] = useState('unknown')
  const [publisherStats, setPublisherStats] = useState({
    publishedCount: 0,
    rate: 0,
    topicName: '',
    publishedCountBySymbol: {},
  })

  const [activeView, setActiveView] = useState('cards')
  const [latestActual, setLatestActual] = useState({})
  const [latestPredictions, setLatestPredictions] = useState({})
  const [priceHistory, setPriceHistory] = useState({})
  const predictionsRef = useRef({})
  const lastRollingPublisherCountRef = useRef(-1)
  /** Mirrors latest publisher `actualPrices` for pairing with prediction WS messages. */
  const latestActualRef = useRef({})
  /** Last time consumer forwarded a `publisherStats` payload (publisher sends ~1 Hz when running). */
  const lastPublisherStatsAtRef = useRef(0)
  const [publisherStatsLive, setPublisherStatsLive] = useState(false)

  useEffect(() => {
    if (!profile) return
    const t = profile.branding?.documentTitle || profile.branding?.appTitle
    if (t) {
      document.title = t
    }
    if (!profile.features?.pricePrediction) {
      setActiveView('cards')
    }
  }, [profile])

  /** Publisher is considered live if stats arrive regularly while the dashboard WS is up. */
  useEffect(() => {
    if (!wsConnected) {
      setPublisherStatsLive(false)
      return
    }
    const staleMs = 4500
    const id = setInterval(() => {
      const last = lastPublisherStatsAtRef.current
      setPublisherStatsLive(last > 0 && Date.now() - last < staleMs)
    }, 400)
    return () => clearInterval(id)
  }, [wsConnected])

  useEffect(() => {
    let ws = null
    let reconnectTimeout = null

    const applyPublisherStatsPayload = (data) => {
      lastPublisherStatsAtRef.current = Date.now()
      setPublisherStats((prev) => ({
        publishedCount: data.publishedCount,
        rate: data.rate,
        topicName: data.topicName || '',
        ...(data.actualPrices && typeof data.actualPrices === 'object'
          ? { actualPrices: data.actualPrices }
          : {}),
        ...(data.publishedCountBySymbol && typeof data.publishedCountBySymbol === 'object'
          ? { publishedCountBySymbol: data.publishedCountBySymbol }
          : prev.publishedCountBySymbol && Object.keys(prev.publishedCountBySymbol).length > 0
            ? { publishedCountBySymbol: prev.publishedCountBySymbol }
            : {}),
      }))
      if (data.actualPrices && typeof data.actualPrices === 'object') {
        const pc = data.publishedCount
        if (typeof pc === 'number' && pc === lastRollingPublisherCountRef.current) {
          return
        }
        if (typeof pc === 'number') {
          lastRollingPublisherCountRef.current = pc
        }

        setLatestActual(data.actualPrices)
        latestActualRef.current = { ...data.actualPrices }
        const timestamp = Date.now()
        setPriceHistory((prev) => {
          const next = { ...prev }
          Object.entries(data.actualPrices).forEach(([symbol, actual]) => {
            const preds = predictionsRef.current[symbol] || {}
            const point = {
              time: timestamp,
              actual,
              pq: preds.pq ?? null,
              nq: preds.nq ?? null,
            }
            const history = [...(next[symbol] || []), point]
            if (history.length > HISTORY_LIMIT) history.shift()
            next[symbol] = history
          })
          return next
        })
      }
    }

    const connect = () => {
      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        console.log('Connected to consumer backend')
        setWsConnected(true)
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)

        if (data.type === 'demoProfile') {
          setProfile(data.profile)
          if (data.queueNames) {
            setQueueNames(data.queueNames)
          }
          return
        }

        if (data.type === 'order') {
          updateConsumer(data)
        } else if (data.type === 'prediction') {
          if (data.queueType === 'non-exclusive' && data.consumerNumber !== CANONICAL_NQ_CONSUMER) {
            return
          }
          const field = data.queueType === 'partitioned' ? 'pq' : 'nq'
          if (!predictionsRef.current[data.symbol]) predictionsRef.current[data.symbol] = {}
          predictionsRef.current[data.symbol][field] = data.predictedPrice
          setLatestPredictions((prev) => ({
            ...prev,
            [data.symbol]: { ...prev[data.symbol], [field]: data.predictedPrice },
          }))
        } else if (data.type === 'status') {
          updateConsumerStatus(data)
        } else if (data.type === 'state') {
          if (data.queueNames) {
            setQueueNames(data.queueNames)
          } else {
            const derived = deriveQueueNamesFromConsumers(data.consumers)
            if (derived) setQueueNames(derived)
          }
          updateConsumersFromState(data.consumers)
          if (data.partitionState) {
            setPartitionState(data.partitionState)
          }
          if (data.partitionedState) {
            setPartitionedState(data.partitionedState)
          }
          if (data.nonExclusiveState) {
            setNonExclusiveState(data.nonExclusiveState)
          }
          if (data.exclusiveState) {
            setExclusiveState(data.exclusiveState)
          }
          if (data.publisherStats) {
            applyPublisherStatsPayload(data.publisherStats)
          }
        } else if (data.type === 'publisherStats') {
          applyPublisherStatsPayload(data)
        } else if (data.type === 'partitionState') {
          setPartitionState(data.state)
        } else if (data.type === 'queueState') {
          if (data.queueType === 'partitioned') {
            setPartitionedState(data.state)
          } else if (data.queueType === 'non-exclusive') {
            setNonExclusiveState(data.state)
          } else if (data.queueType === 'exclusive') {
            setExclusiveState(data.state)
          }
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setWsConnected(false)
      }

      ws.onclose = () => {
        console.log('Disconnected from consumer backend')
        setWsConnected(false)
        setProfile(null)
        setQueueNames(null)
        predictionsRef.current = {}
        latestActualRef.current = {}
        lastPublisherStatsAtRef.current = 0
        lastRollingPublisherCountRef.current = -1
        setLatestActual({})
        setLatestPredictions({})
        setPriceHistory({})
        setPublisherStats({
          publishedCount: 0,
          rate: 0,
          topicName: '',
          publishedCountBySymbol: {},
        })
        setActiveView('cards')
        reconnectTimeout = setTimeout(() => {
          console.log('Attempting to reconnect...')
          connect()
        }, 3000)
      }

      window.wsConnection = ws
    }

    connect()

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (ws) {
        ws.close()
      }
      window.wsConnection = null
    }
  }, [])

  const updateConsumer = (data) => {
    setConsumers((prev) => {
      const newConsumers = { ...prev }
      const queueKey =
        data.queueType === 'partitioned'
          ? 'partitioned'
          : data.queueType === 'non-exclusive'
            ? 'nonExclusive'
            : 'exclusive'

      const index = data.consumerNumber - 1
      if (newConsumers[queueKey][index]) {
        newConsumers[queueKey][index] = {
          ...newConsumers[queueKey][index],
          status: data.stats.status,
          messagesProcessed: data.stats.messagesProcessed,
          rate: data.stats.rate,
          lastOrders: data.lastOrders || [],
          ...(data.queueName != null && data.queueName !== '' ? { queueName: data.queueName } : {}),
          assignedPartitionKey:
            data.assignedPartitionKey ?? newConsumers[queueKey][index].assignedPartitionKey,
        }
      }

      return newConsumers
    })
  }

  const updateConsumerStatus = (data) => {
    setConsumers((prev) => {
      const newConsumers = { ...prev }
      const queueKey =
        data.queueType === 'partitioned'
          ? 'partitioned'
          : data.queueType === 'non-exclusive'
            ? 'nonExclusive'
            : 'exclusive'

      const index = data.consumerNumber - 1
      if (newConsumers[queueKey][index]) {
        newConsumers[queueKey][index] = {
          ...newConsumers[queueKey][index],
          status: data.status,
          ...(data.queueName != null && data.queueName !== '' ? { queueName: data.queueName } : {}),
        }
      }

      return newConsumers
    })
  }

  const updateConsumersFromState = (stateConsumers) => {
    setConsumers((prev) => {
      const newConsumers = { ...prev }
      stateConsumers.forEach((consumer) => {
        const queueKey =
          consumer.queueType === 'partitioned'
            ? 'partitioned'
            : consumer.queueType === 'non-exclusive'
              ? 'nonExclusive'
              : 'exclusive'
        const index = consumer.consumerNumber - 1
        if (newConsumers[queueKey][index]) {
          const { assignedSymbol, ...rest } = consumer
          newConsumers[queueKey][index] = {
            ...newConsumers[queueKey][index],
            ...rest,
            assignedPartitionKey:
              rest.assignedPartitionKey ??
              assignedSymbol ??
              newConsumers[queueKey][index].assignedPartitionKey,
          }
        }
      })
      return newConsumers
    })
  }

  const handleDisconnect = (consumerId) => {
    if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
      window.wsConnection.send(
        JSON.stringify({
          type: 'disconnect',
          consumerId,
        }),
      )
    }
  }

  const handleReconnect = (consumerId) => {
    if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
      window.wsConnection.send(
        JSON.stringify({
          type: 'reconnect',
          consumerId,
        }),
      )
    }
  }

  const topicFallback =
    profile?.messaging?.topicPrefix != null ? `${profile.messaging.topicPrefix}/>` : ''

  const qPart = queueNames?.partitioned ?? '…'
  const qNonEx = queueNames?.nonExclusive ?? '…'
  const qEx = queueNames?.exclusive ?? '…'

  const showPricePrediction = !!profile?.features?.pricePrediction
  const chartSymbols = (
    Object.keys(latestActual).length > 0
      ? Object.keys(latestActual)
      : profile?.messaging?.partitionKeys ?? []
  ).sort()

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <Header
        connected={wsConnected}
        profile={profile}
        activeView={activeView}
        onViewChange={setActiveView}
        showPrediction={showPricePrediction}
      />

      {activeView === 'cards' ? (
        <div className="container mx-auto px-4 py-6 space-y-6">
          <PublisherStatus
            totalMessages={publisherStats.publishedCount}
            topicPrefix={profile?.messaging?.topicPrefix}
            topicName={publisherStats.topicName || topicFallback}
            isLive={publisherStatsLive}
          />

          <QueuePanel
            queueName={qPart}
            consumers={consumers.partitioned}
            queueType="partitioned"
            partitionState={partitionState}
            queueState={partitionedState}
            onDisconnect={handleDisconnect}
            onReconnect={handleReconnect}
            profile={profile}
          />

          <QueuePanel
            queueName={qNonEx}
            consumers={consumers.nonExclusive}
            queueType="non-exclusive"
            queueState={nonExclusiveState}
            onDisconnect={handleDisconnect}
            onReconnect={handleReconnect}
            profile={profile}
          />

          <QueuePanel
            queueName={qEx}
            consumers={consumers.exclusive}
            queueType="exclusive"
            queueState={exclusiveState}
            onDisconnect={handleDisconnect}
            onReconnect={handleReconnect}
            profile={profile}
          />
        </div>
      ) : (
        <PredictionView
          symbols={chartSymbols}
          canonicalNqConsumer={CANONICAL_NQ_CONSUMER}
          priceHistory={priceHistory}
          latestActual={latestActual}
          latestPredictions={latestPredictions}
          publishedCountBySymbol={publisherStats.publishedCountBySymbol || {}}
        />
      )}
    </div>
  )
}

export default App
