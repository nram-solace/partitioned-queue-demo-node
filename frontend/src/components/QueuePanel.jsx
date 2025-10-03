import ConsumerTile from './ConsumerTile'

function QueuePanel({ title, description, consumers, queueType }) {
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="bg-slate-750 px-6 py-4 border-b border-slate-700">
        <h2 className="text-xl font-bold mb-1">{title}</h2>
        <p className="text-sm text-slate-400">{description}</p>
      </div>

      <div className="grid grid-cols-5 gap-4 p-6">
        {consumers.map((consumer, index) => (
          <ConsumerTile
            key={consumer.id}
            consumer={consumer}
            queueType={queueType}
            consumerNumber={index + 1}
          />
        ))}
      </div>
    </div>
  )
}

export default QueuePanel
