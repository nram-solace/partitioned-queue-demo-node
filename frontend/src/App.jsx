import { useState, useEffect, useRef, useCallback } from 'react'
import QueuePanel from './components/QueuePanel'
import Header from './components/Header'
import PublisherStatus from './components/PublisherStatus'
import PredictionView from './components/PredictionView'
import { NQ_PREDICTION_CONSUMER } from './config'
import { useSolaceDashboard } from './hooks/useSolaceDashboard'
import { deriveQueueNamesFromConsumers, handleDashboardMessage } from './dashboardMessages'

const CANONICAL_NQ_CONSUMER = NQ_PREDICTION_CONSUMER
const HISTORY_LIMIT = 100

function computeSessionPublishedCountBySymbol(publishedCountBySymbol, baseline) {
  if (!publishedCountBySymbol || typeof publishedCountBySymbol !== 'object') {
    return {}
  }
  if (!baseline) {
    return {}
  }
  const out = {}
  const keys = new Set([...Object.keys(publishedCountBySymbol), ...Object.keys(baseline)])
  for (const sym of keys) {
    const delta = (publishedCountBySymbol[sym] || 0) - (baseline[sym] || 0)
    if (delta > 0) {
      out[sym] = delta
    }
  }
  return out
}

function publisherCountsRegressed(publishedCountBySymbol, baseline) {
  if (!baseline || !publishedCountBySymbol) {
    return false
  }
  return Object.keys(baseline).some(
    (sym) => (publishedCountBySymbol[sym] || 0) < (baseline[sym] || 0),
  )
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
  const [sessionPublishedCountBySymbol, setSessionPublishedCountBySymbol] = useState({})
  const [sessionPublishedCount, setSessionPublishedCount] = useState(0)

  const [activeView, setActiveView] = useState('cards')
  const [latestActual, setLatestActual] = useState({})
  const [latestPredictions, setLatestPredictions] = useState({})
  const [priceHistory, setPriceHistory] = useState({})
  const predictionsRef = useRef({})
  const lastRollingPublisherCountRef = useRef(-1)
  const publishedTotalBaselineRef = useRef(null)
  const publishedCountBaselineRef = useRef(null)
  const latestActualRef = useRef({})
  const lastPublisherStatsAtRef = useRef(0)
  const [publisherStatsLive, setPublisherStatsLive] = useState(false)

  const applyPublisherStatsPayload = useCallback((data) => {
    lastPublisherStatsAtRef.current = Date.now()

    const publisherRestarted =
      typeof data.publishedCount === 'number' &&
      lastRollingPublisherCountRef.current >= 0 &&
      data.publishedCount < lastRollingPublisherCountRef.current

    if (typeof data.publishedCount === 'number') {
      if (publisherRestarted || publishedTotalBaselineRef.current === null) {
        publishedTotalBaselineRef.current = data.publishedCount
        setSessionPublishedCount(0)
      } else {
        setSessionPublishedCount(
          Math.max(0, data.publishedCount - publishedTotalBaselineRef.current),
        )
      }
    }

    if (data.publishedCountBySymbol && typeof data.publishedCountBySymbol === 'object') {
      const global = data.publishedCountBySymbol
      if (publisherRestarted || publisherCountsRegressed(global, publishedCountBaselineRef.current)) {
        publishedCountBaselineRef.current = { ...global }
        setSessionPublishedCountBySymbol({})
      } else if (publishedCountBaselineRef.current === null) {
        publishedCountBaselineRef.current = { ...global }
        setSessionPublishedCountBySymbol({})
      } else {
        setSessionPublishedCountBySymbol(
          computeSessionPublishedCountBySymbol(global, publishedCountBaselineRef.current),
        )
      }
    }

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
  }, [])

  const updateConsumer = useCallback((data) => {
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
  }, [])

  const updateConsumerStatus = useCallback((data) => {
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
  }, [])

  const updateConsumersFromState = useCallback((stateConsumers) => {
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
  }, [])

  const resetSessionBaselines = useCallback(() => {
    publishedTotalBaselineRef.current = null
    publishedCountBaselineRef.current = null
    setSessionPublishedCount(0)
    setSessionPublishedCountBySymbol({})
  }, [])

  const resetPredictionState = useCallback(() => {
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
  }, [])

  const onDashboardMessage = useCallback(
    (data) => {
      handleDashboardMessage(data, {
        canonicalNqConsumer: CANONICAL_NQ_CONSUMER,
        onDemoProfile: (msg) => {
          setProfile(msg.profile)
          if (msg.queueNames) setQueueNames(msg.queueNames)
        },
        onOrder: updateConsumer,
        onPrediction: (msg) => {
          const field = msg.queueType === 'partitioned' ? 'pq' : 'nq'
          if (!predictionsRef.current[msg.symbol]) predictionsRef.current[msg.symbol] = {}
          predictionsRef.current[msg.symbol][field] = msg.predictedPrice
          setLatestPredictions((prev) => ({
            ...prev,
            [msg.symbol]: { ...prev[msg.symbol], [field]: msg.predictedPrice },
          }))
        },
        onStatus: updateConsumerStatus,
        onState: (msg) => {
          if (msg.profile) setProfile(msg.profile)
          if (msg.queueNames) {
            setQueueNames(msg.queueNames)
          } else {
            const derived = deriveQueueNamesFromConsumers(msg.consumers)
            if (derived) setQueueNames(derived)
          }
          updateConsumersFromState(msg.consumers)
          if (msg.partitionState) setPartitionState(msg.partitionState)
          if (msg.partitionedState) setPartitionedState(msg.partitionedState)
          if (msg.nonExclusiveState) setNonExclusiveState(msg.nonExclusiveState)
          if (msg.exclusiveState) setExclusiveState(msg.exclusiveState)
          if (msg.publisherStats) applyPublisherStatsPayload(msg.publisherStats)
        },
        onPublisherStats: applyPublisherStatsPayload,
        onPartitionState: setPartitionState,
        onQueueState: (msg) => {
          if (msg.queueType === 'partitioned') {
            setPartitionedState(msg.state)
          } else if (msg.queueType === 'non-exclusive') {
            setNonExclusiveState(msg.state)
          } else if (msg.queueType === 'exclusive') {
            setExclusiveState(msg.state)
          }
        },
      })
    },
    [
      applyPublisherStatsPayload,
      updateConsumer,
      updateConsumerStatus,
      updateConsumersFromState,
    ],
  )

  const { connected, connectionHint, publishCommand } = useSolaceDashboard({
    onMessage: onDashboardMessage,
    onConnect: resetSessionBaselines,
    onDisconnect: () => {
      setProfile(null)
      setQueueNames(null)
      resetPredictionState()
      resetSessionBaselines()
    },
  })

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
    if (!connected) {
      setPublisherStatsLive(false)
      return
    }
    const staleMs = 4500
    const id = setInterval(() => {
      const last = lastPublisherStatsAtRef.current
      setPublisherStatsLive(last > 0 && Date.now() - last < staleMs)
    }, 400)
    return () => clearInterval(id)
  }, [connected])

  const handleDisconnect = (consumerId) => {
    publishCommand({ type: 'disconnect', consumerId })
  }

  const handleReconnect = (consumerId) => {
    publishCommand({ type: 'reconnect', consumerId })
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
        connected={connected}
        connectionLabel={connected ? `Solace (${connectionHint})` : 'Solace'}
        profile={profile}
        activeView={activeView}
        onViewChange={setActiveView}
        showPrediction={showPricePrediction}
      />

      {activeView === 'cards' ? (
        <div className="container mx-auto px-4 py-6 space-y-6">
          <PublisherStatus
            totalMessages={sessionPublishedCount}
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
          publishedCountBySymbol={sessionPublishedCountBySymbol}
        />
      )}
    </div>
  )
}

export default App
