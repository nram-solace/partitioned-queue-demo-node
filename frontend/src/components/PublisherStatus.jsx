function PublisherStatus() {
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-1">📤 Publisher Status</h3>
          <p className="text-sm text-slate-400">
            Publishing to: <code className="text-blue-400">stocks/orders/*</code>
          </p>
        </div>
      </div>
    </div>
  )
}

export default PublisherStatus
