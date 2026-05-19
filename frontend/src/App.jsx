import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import QueuePanel from './components/QueuePanel'
import Header from './components/Header'
import PublisherStatus from './components/PublisherStatus'
import PredictionView from './components/PredictionView'
import { NQ_PREDICTION_CONSUMER } from './config'
import { useSolaceDashboard } from './hooks/useSolaceDashboard'
import { createSessionId } from './sessionId'
import { deriveQueueNamesFromConsumers, handleDashboardMessage } from './dashboardMessages'

const CANONICAL_NQ_CONSUMER = NQ_PREDICTION_CONSUMER
const HISTORY_LIMIT = 100

const emptyConsumers = () => ({
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

/** Per-consumer processed count since dashboard session start (baseline on first sighting). */
function sessionConsumerProcessed(consumerId, globalCount, baselines) {
  if (consumerId == null) {
    return typeof globalCount === 'number' ? globalCount : 0
  }
  const global = typeof globalCount === 'number' ? globalCount : 0
  const key = String(consumerId)
  if (baselines[key] === undefined) {
    baselines[key] = global
    return 0
  }
  if (global < baselines[key]) {
    baselines[key] = global
    return 0
  }
  return global - baselines[key]
}

function App() {
  /** New id each full page load so reload does not reuse a prior dashboard session. */
  const sessionId = useMemo(() => createSessionId(), [])
  const [profileCatalog, setProfileCatalog] = useState(null)
  const [selectedProfileId, setSelectedProfileId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [queueNames, setQueueNames] = useState(null)
  const [consumers, setConsumers] = useState(emptyConsumers)

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
  const consumerProcessedBaselineRef = useRef({})
  const latestActualRef = useRef({})
  const lastPublisherStatsAtRef = useRef(0)
  const selectedProfileIdRef = useRef(selectedProfileId)
  const [publisherStatsLive, setPublisherStatsLive] = useState(false)

  selectedProfileIdRef.current = selectedProfileId

  const applyProfileEntry = useCallback((entry) => {
    if (!entry) return
    setProfile(entry)
    if (entry.queueNames) {
      setQueueNames(entry.queueNames)
    } else if (entry.queues) {
      setQueueNames({
        partitioned: entry.queues.partitioned,
        nonExclusive: entry.queues.nonExclusive,
        exclusive: entry.queues.exclusive,
      })
    }
  }, [])

  const applyPublisherStatsPayload = useCallback((data) => {
    // Only live stats from solace/catalog/stats/{profile}/publisher — not snapshot.publisherStats (always zeros).
    if (data?.type !== 'publisherStats') {
      return
    }

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
      ...(data.actuals && typeof data.actuals === 'object' ? { actuals: data.actuals } : {}),
      ...(data.publishedCountBySymbol && typeof data.publishedCountBySymbol === 'object'
        ? { publishedCountBySymbol: data.publishedCountBySymbol }
        : prev.publishedCountBySymbol && Object.keys(prev.publishedCountBySymbol).length > 0
          ? { publishedCountBySymbol: prev.publishedCountBySymbol }
          : {}),
    }))
    if (data.actuals && typeof data.actuals === 'object') {
      const pc = data.publishedCount
      if (typeof pc === 'number' && pc === lastRollingPublisherCountRef.current) {
        return
      }
      if (typeof pc === 'number') {
        lastRollingPublisherCountRef.current = pc
      }

      setLatestActual(data.actuals)
      latestActualRef.current = { ...data.actuals }
      const timestamp = Date.now()
      setPriceHistory((prev) => {
        const next = { ...prev }
        Object.entries(data.actuals).forEach(([seriesKey, actual]) => {
          const preds = predictionsRef.current[seriesKey] || {}
          const point = {
            time: timestamp,
            actual,
            pq: preds.pq ?? null,
            nq: preds.nq ?? null,
          }
          const history = [...(next[seriesKey] || []), point]
          if (history.length > HISTORY_LIMIT) history.shift()
          next[seriesKey] = history
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
        const sessionProcessed = sessionConsumerProcessed(
          data.consumerId,
          data.stats.messagesProcessed,
          consumerProcessedBaselineRef.current,
        )
        newConsumers[queueKey][index] = {
          ...newConsumers[queueKey][index],
          status: data.stats.status,
          messagesProcessed: sessionProcessed,
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
          const sessionProcessed = sessionConsumerProcessed(
            consumer.id,
            consumer.messagesProcessed,
            consumerProcessedBaselineRef.current,
          )
          newConsumers[queueKey][index] = {
            ...newConsumers[queueKey][index],
            ...rest,
            messagesProcessed: sessionProcessed,
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
    consumerProcessedBaselineRef.current = {}
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

  const resetTileState = useCallback(() => {
    setConsumers(emptyConsumers())
    setPartitionState('unknown')
    setPartitionedState('unknown')
    setNonExclusiveState('unknown')
    setExclusiveState('unknown')
  }, [])

  const publishCommandRef = useRef(null)

  const onDashboardMessage = useCallback(
    (data) => {
      const selected = selectedProfileIdRef.current
      if (
        data.type !== 'demoProfiles' &&
        data.profileId != null &&
        selected &&
        data.profileId !== selected
      ) {
        return
      }
      if (data.type === 'state' && data.sessionId && data.sessionId !== sessionId) {
        return
      }

      handleDashboardMessage(data, {
        canonicalNqConsumer: CANONICAL_NQ_CONSUMER,
        onDemoProfiles: (msg) => {
          setProfileCatalog({
            profiles: msg.profiles || [],
            defaultProfileId: msg.defaultProfileId,
          })
          const defaultId =
            msg.defaultProfileId || msg.profiles?.[0]?.id || null
          if (!selectedProfileIdRef.current && defaultId) {
            selectedProfileIdRef.current = defaultId
            setSelectedProfileId(defaultId)
            const entry = msg.profiles?.find((p) => p.id === defaultId)
            applyProfileEntry(entry)
            publishCommandRef.current?.({ type: 'selectProfile', profileId: defaultId })
          }
        },
        onDemoProfile: (msg) => {
          if (msg.profile) applyProfileEntry(msg.profile)
          if (msg.queueNames) setQueueNames(msg.queueNames)
        },
        onOrder: updateConsumer,
        onPrediction: (msg) => {
          const seriesKey = msg.seriesKey
          const predicted = msg.predicted
          if (seriesKey == null || typeof predicted !== 'number') return
          const field = msg.queueType === 'partitioned' ? 'pq' : 'nq'
          const key = String(seriesKey)
          if (!predictionsRef.current[key]) predictionsRef.current[key] = {}
          predictionsRef.current[key][field] = predicted
          setLatestPredictions((prev) => ({
            ...prev,
            [key]: { ...prev[key], [field]: predicted },
          }))
        },
        onStatus: updateConsumerStatus,
        onState: (msg) => {
          if (msg.profile) applyProfileEntry(msg.profile)
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
      sessionId,
      applyProfileEntry,
      applyPublisherStatsPayload,
      updateConsumer,
      updateConsumerStatus,
      updateConsumersFromState,
    ],
  )

  const { connected, connectionHint, publishCommand } = useSolaceDashboard({
    sessionId,
    selectedProfileId,
    onMessage: onDashboardMessage,
    onConnect: resetSessionBaselines,
    onDisconnect: () => {
      setProfile(null)
      setQueueNames(null)
      setProfileCatalog(null)
      setSelectedProfileId(null)
      resetPredictionState()
      resetSessionBaselines()
      resetTileState()
    },
  })

  publishCommandRef.current = publishCommand

  const handleProfileChange = (profileId) => {
    if (!profileId || profileId === selectedProfileId) return
    setSelectedProfileId(profileId)
    const entry = profileCatalog?.profiles?.find((p) => p.id === profileId)
    applyProfileEntry(entry)
    resetTileState()
    resetPredictionState()
    resetSessionBaselines()
    publishCommand({ type: 'selectProfile', profileId })
  }

  useEffect(() => {
    if (!profile) return
    const t = profile.branding?.documentTitle || profile.branding?.appTitle
    if (t) {
      document.title = t
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
    if (!selectedProfileId) return
    publishCommand({ type: 'disconnect', profileId: selectedProfileId, consumerId })
  }

  const handleReconnect = (consumerId) => {
    if (!selectedProfileId) return
    publishCommand({ type: 'reconnect', profileId: selectedProfileId, consumerId })
  }

  const topicFallback =
    profile?.messaging?.topicPrefix != null ? `${profile.messaging.topicPrefix}/>` : ''

  const qPart = queueNames?.partitioned ?? '…'
  const qNonEx = queueNames?.nonExclusive ?? '…'
  const qEx = queueNames?.exclusive ?? '…'

  const chartSeriesKeys = (
    Object.keys(latestActual).length > 0
      ? Object.keys(latestActual)
      : profile?.messaging?.partitionKeys ?? []
  ).sort()

  const catalogProfiles = profileCatalog?.profiles ?? []

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <Header
        connected={connected}
        connectionLabel={connected ? `Solace - ${connectionHint}` : 'Solace'}
        profile={profile}
        catalogProfiles={catalogProfiles}
        selectedProfileId={selectedProfileId}
        onProfileChange={handleProfileChange}
        activeView={activeView}
        onViewChange={setActiveView}
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
          seriesKeys={chartSeriesKeys}
          uiPrediction={profile?.ui?.prediction}
          canonicalNqConsumer={CANONICAL_NQ_CONSUMER}
          seriesHistory={priceHistory}
          latestActuals={latestActual}
          latestPredictions={latestPredictions}
          publishedCountBySeries={sessionPublishedCountBySymbol}
        />
      )}
    </div>
  )
}

export default App
