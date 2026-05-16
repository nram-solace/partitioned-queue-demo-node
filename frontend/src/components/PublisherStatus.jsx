function PublisherStatus({ totalMessages, topicPrefix, topicName, isLive }) {
  const n = totalMessages || 0
  const eventsPart = `${n.toLocaleString()} ${n === 1 ? 'event' : 'events'}`
  const displayPrefix =
    topicPrefix && String(topicPrefix).trim()
      ? String(topicPrefix).trim()
      : topicName && String(topicName).trim()
        ? String(topicName)
            .trim()
            .replace(/\/>\s*$/, '')
            .replace(/>\s*$/, '')
        : '…'
  const topicTooltip = topicName && String(topicName).trim() ? String(topicName).trim() : undefined

  return (
    <div
      className={`bg-slate-800 rounded-lg border-2 p-4 ${
        isLive ? 'border-green-800' : 'border-slate-600'
      }`}
      role="status"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-lg text-white">
        <div className="min-w-0 shrink">
          <span className="font-semibold text-white">Publisher</span>
          <span
            className="text-slate-300"
            title="Published messages since this dashboard connected"
          >
            {' '}
            ({eventsPart})
          </span>
        </div>
        <div
          className="min-w-0 flex-1 text-center text-base sm:text-lg px-2"
          title={topicTooltip ? `Publisher topic pattern: ${topicTooltip}` : undefined}
        >
          <span className="text-slate-400 font-medium">Topic Prefix:</span>{' '}
          <span className="font-mono text-slate-100 break-all">{displayPrefix}</span>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <span className="text-slate-400 font-medium">Status:</span>{' '}
          {isLive ? (
            <span className="text-green-400 font-semibold">Active</span>
          ) : (
            <span className="text-amber-400 font-semibold">Inactive</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default PublisherStatus
