function PublisherStatus({ totalMessages, topicName }) {
  const formattedCount = (totalMessages || 0).toLocaleString()

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            Topic Publisher: {topicName || 'stocks/orders/>'}
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
