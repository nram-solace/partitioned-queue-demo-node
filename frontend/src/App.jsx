import { useState, useEffect, useRef } from 'react'
import QueuePanel from './components/QueuePanel'
import Header from './components/Header'
import PublisherStatus from './components/PublisherStatus'
import PredictionView from './components/PredictionView'
import { closenessPctFromMeanGap, WS_URL } from './config'

const CANONICAL_NQ_CONSUMER = parseInt(import.meta.env.VITE_NQ_PREDICTION_CONSUMER || '1', 10)
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
  const [messageCounts, setMessageCounts] = useState({
    partitioned: 0,
    'non-exclusive': 0,
    exclusive: 0,
  })
  const [publisherStats, setPublisherStats] = useState({
    publishedCount: 0,
    rate: 0,
    topicName: '',
  })

  const [activeView, setActiveView] = useState('cards')
  const [latestActual, setLatestActual] = useState({})
  const [latestPredictions, setLatestPredictions] = useState({})
  const [priceHistory, setPriceHistory] = useState({})
  const predictionsRef = useRef({})
  const lastRollingPublisherCountRef = useRef(-1)
  /** Mirrors latest publisher `actualPrices` for pairing with prediction WS messages. */
  const latestActualRef = useRef({})
  /**
   * Per symbol, per channel: cumulative sum of |Δ|% and sample count since connect.
   * One sample per **prediction** message (paired with last published actual) — not per publisher tick, so a
   * stale NQ value is not penalized thousands of times while the tape moves.
   */
  const predictionGapCumulativeRef = useRef({})
  const [symbolCumulativeTrackStats, setSymbolCumulativeTrackStats] = useState({})

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

  useEffect(() => {
    let ws = null
    let reconnectTimeout = null

    const applyPublisherStatsPayload = (data) => {
      setPublisherStats({
        publishedCount: data.publishedCount,
        rate: data.rate,
        topicName: data.topicName || '',
        ...(data.actualPrices && typeof data.actualPrices === 'object'
          ? { actualPrices: data.actualPrices }
          : {}),
      })
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

    const recomputeSymbolCumulativeTrackStats = () => {
      const cum = predictionGapCumulativeRef.current
      const nextCumulative = {}
      for (const sym of Object.keys(cum)) {
        const { pq, nq } = cum[sym]
        const pqMean = pq.n > 0 ? pq.sum / pq.n : null
        const nqMean = nq.n > 0 ? nq.sum / nq.n : null
        nextCumulative[sym] = {
          pqClosenessPct: closenessPctFromMeanGap(pqMean),
          nqClosenessPct: closenessPctFromMeanGap(nqMean),
          pqMeanGapPct: pqMean,
          nqMeanGapPct: nqMean,
        }
      }
      setSymbolCumulativeTrackStats(nextCumulative)
    }

    const recordPredictionGapSample = (symbol, field, predictedPrice) => {
      const actual = latestActualRef.current[symbol]
      if (!(actual > 0) || predictedPrice == null || !Number.isFinite(predictedPrice)) return
      const g = Math.abs((predictedPrice - actual) / actual) * 100
      const cum = predictionGapCumulativeRef.current
      if (!cum[symbol]) {
        cum[symbol] = { pq: { sum: 0, n: 0 }, nq: { sum: 0, n: 0 } }
      }
      const slot = field === 'pq' ? 'pq' : 'nq'
      cum[symbol][slot].sum += g
      cum[symbol][slot].n += 1
      recomputeSymbolCumulativeTrackStats()
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
          if (data.messageCount) {
            setMessageCounts((prev) => ({
              ...prev,
              [data.queueType]: data.messageCount,
            }))
          }
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
          recordPredictionGapSample(data.symbol, field, data.predictedPrice)
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
          if (data.messageCounts) {
            setMessageCounts(data.messageCounts)
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
        predictionGapCumulativeRef.current = {}
        latestActualRef.current = {}
        lastRollingPublisherCountRef.current = -1
        setLatestActual({})
        setLatestPredictions({})
        setPriceHistory({})
        setSymbolCumulativeTrackStats({})
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
        totalMessages={publisherStats.publishedCount}
      />

      {activeView === 'cards' ? (
        <div className="container mx-auto px-4 py-6 space-y-6">
          <PublisherStatus
            totalMessages={publisherStats.publishedCount}
            topicName={publisherStats.topicName || topicFallback}
          />

          <QueuePanel
            queueName={qPart}
            consumers={consumers.partitioned}
            queueType="partitioned"
            partitionState={partitionState}
            queueState={partitionedState}
            messageCount={messageCounts.partitioned}
            onDisconnect={handleDisconnect}
            onReconnect={handleReconnect}
            profile={profile}
          />

          <QueuePanel
            queueName={qNonEx}
            consumers={consumers.nonExclusive}
            queueType="non-exclusive"
            queueState={nonExclusiveState}
            messageCount={messageCounts['non-exclusive']}
            onDisconnect={handleDisconnect}
            onReconnect={handleReconnect}
            profile={profile}
          />

          <QueuePanel
            queueName={qEx}
            consumers={consumers.exclusive}
            queueType="exclusive"
            queueState={exclusiveState}
            messageCount={messageCounts.exclusive}
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
          symbolCumulativeTrackStats={symbolCumulativeTrackStats}
        />
      )}
    </div>
  )
}

export default App
