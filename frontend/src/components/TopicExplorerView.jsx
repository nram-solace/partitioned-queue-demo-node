import { useCallback, useEffect, useRef, useState } from 'react'
import { presetMatches, presetTopics, topicBelongsToProfile } from '../topicFilters'

const FEED_LIMIT = 20

function displayFieldValue(message, field) {
  const value = message?.[field]
  return value == null || value === '' ? '—' : String(value)
}

function PresetCard({ preset, active, onToggle, topics, count, feed }) {
  return (
    <div
      className={`rounded-lg border-2 overflow-hidden bg-slate-800 transition-colors ${
        active ? 'border-teal-600' : 'border-slate-700'
      }`}
    >
      <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-white font-semibold">{preset.label}</div>
          <div className="mt-1 space-y-0.5">
            {topics.map((t) => (
              <div key={t} className="font-mono text-xs text-slate-400 truncate" title={t}>
                {t}
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`shrink-0 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            active
              ? 'bg-teal-600 text-white hover:bg-teal-500'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          {active ? 'Subscribed' : 'Subscribe'}
        </button>
      </div>

      <div className="px-5 py-3 bg-slate-750">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-slate-400">Messages received</span>
          <span className="font-mono text-teal-400">{count}</span>
        </div>
        {feed.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">
            {active ? 'Waiting for a matching event…' : 'Subscribe to see live events'}
          </div>
        ) : (
          <ul className="space-y-1 max-h-56 overflow-y-auto">
            {feed.map((entry) => (
              <li
                key={entry.key}
                className="font-mono text-xs text-slate-300 flex flex-wrap gap-x-3 border-b border-slate-800 pb-1"
              >
                <span className="text-slate-500">{entry.time}</span>
                <span>{displayFieldValue(entry.message, 'wellId')}</span>
                <span className="text-amber-400">{displayFieldValue(entry.message, 'status')}</span>
                <span>{displayFieldValue(entry.message, 'region')}</span>
                <span>{displayFieldValue(entry.message, 'state')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TopicExplorerView({ profile, connected, subscribeTopic, unsubscribeTopic, addRawMessageListener }) {
  const presets = profile?.ui?.topicExplorer?.presets || []
  const [activeIds, setActiveIds] = useState(() => new Set())
  const [counts, setCounts] = useState({})
  const [feeds, setFeeds] = useState({})
  const activeIdsRef = useRef(activeIds)
  activeIdsRef.current = activeIds

  const presetsRef = useRef(presets)
  presetsRef.current = presets

  const profileRef = useRef(profile)
  profileRef.current = profile

  const handleRawMessage = useCallback((topic, data) => {
    const activeNow = activeIdsRef.current
    if (activeNow.size === 0) return
    if (!topicBelongsToProfile(profileRef.current, topic)) return
    const matchedIds = []
    presetsRef.current.forEach((preset) => {
      if (activeNow.has(preset.id) && presetMatches(data, preset)) {
        matchedIds.push(preset.id)
      }
    })
    if (matchedIds.length === 0) return

    const entry = { key: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString(), message: data }
    setCounts((prev) => {
      const next = { ...prev }
      matchedIds.forEach((id) => {
        next[id] = (next[id] || 0) + 1
      })
      return next
    })
    setFeeds((prev) => {
      const next = { ...prev }
      matchedIds.forEach((id) => {
        next[id] = [entry, ...(prev[id] || [])].slice(0, FEED_LIMIT)
      })
      return next
    })
  }, [])

  useEffect(() => {
    if (!addRawMessageListener) return undefined
    return addRawMessageListener(handleRawMessage)
  }, [addRawMessageListener, handleRawMessage])

  const subscribeAll = useCallback(
    (ids) => {
      ids.forEach((id) => {
        const preset = presetsRef.current.find((p) => p.id === id)
        if (!preset || !profile) return
        presetTopics(profile, preset).forEach((t) => subscribeTopic?.(t))
      })
    },
    [profile, subscribeTopic],
  )

  useEffect(() => {
    if (connected && activeIdsRef.current.size > 0) {
      subscribeAll(activeIdsRef.current)
    }
  }, [connected, subscribeAll])

  useEffect(() => {
    return () => {
      activeIdsRef.current.forEach((id) => {
        const preset = presetsRef.current.find((p) => p.id === id)
        if (!preset || !profile) return
        presetTopics(profile, preset).forEach((t) => unsubscribeTopic?.(t))
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (preset) => {
    setActiveIds((prev) => {
      const next = new Set(prev)
      if (next.has(preset.id)) {
        next.delete(preset.id)
        presetTopics(profile, preset).forEach((t) => unsubscribeTopic?.(t))
      } else {
        next.add(preset.id)
        presetTopics(profile, preset).forEach((t) => subscribeTopic?.(t))
      }
      return next
    })
    setCounts((prev) => ({ ...prev, [preset.id]: 0 }))
    setFeeds((prev) => ({ ...prev, [preset.id]: [] }))
  }

  if (presets.length === 0) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="rounded-lg border-2 border-slate-700 bg-slate-800 p-10 text-center text-slate-400">
          Topic Subscribers isn&apos;t configured for{' '}
          {profile?.branding?.appTitle?.trim() || 'this demo'} yet.
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <p className="text-slate-400 text-sm">
        Each card below is an independent direct-topic subscription.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            active={activeIds.has(preset.id)}
            onToggle={() => toggle(preset)}
            topics={presetTopics(profile, preset)}
            count={counts[preset.id] || 0}
            feed={feeds[preset.id] || []}
          />
        ))}
      </div>
    </div>
  )
}

export default TopicExplorerView
