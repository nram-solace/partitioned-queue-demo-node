function PublisherStatus({ totalMessages, topicName }) {
  const formattedCount = (totalMessages || 0).toLocaleString()
  const displayTopic = topicName && topicName.trim() ? topicName : '…'

  return (
    <div className="bg-slate-800 rounded-lg border-2 border-green-800 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            Topic publisher: {displayTopic}
          </h3>
        </div>
        <div className="text-lg">
          <span>Status: </span>
          <span className="text-green-400">Active</span>
          <span className="ml-3 text-slate-400">|</span>
          <span className="ml-3">{formattedCount} msgs</span>
        </div>
      </div>
    </div>
  )
}

export default PublisherStatus
