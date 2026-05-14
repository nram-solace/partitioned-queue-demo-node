function PublisherStatus({ totalMessages, topicName, isLive }) {
  const formattedCount = (totalMessages || 0).toLocaleString()
  const displayTopic = topicName && topicName.trim() ? topicName : '…'

  return (
    <div
      className={`bg-slate-800 rounded-lg border-2 p-4 ${
        isLive ? 'border-green-800' : 'border-slate-600'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            Topic publisher: {displayTopic}
          </h3>
        </div>
        <div className="text-lg">
          <span>Status: </span>
          {isLive ? (
            <span className="text-green-400">Active</span>
          ) : (
            <span className="text-amber-400">Inactive</span>
          )}
          <span className="ml-3 text-slate-400">|</span>
          <span className="ml-3">{formattedCount} msgs</span>
        </div>
      </div>
    </div>
  )
}

export default PublisherStatus
