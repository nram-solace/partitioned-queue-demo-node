import { useState, useEffect } from 'react'
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts'

function LegendItem({ color, label, dashed = false }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="24" height="4" aria-hidden>
        <line
          x1="0"
          y1="2"
          x2="24"
          y2="2"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? '5 3' : undefined}
        />
      </svg>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  )
}

function DeltaBadge({ label, delta }) {
  const abs = delta === null ? null : Math.abs(delta)
  const colorClass =
    abs === null ? 'text-slate-500' : abs < 0.5 ? 'text-emerald-400' : abs < 1.5 ? 'text-yellow-400' : 'text-red-400'
  const bgClass =
    abs === null ? 'bg-slate-700/50' : abs < 0.5 ? 'bg-emerald-900/30' : abs < 1.5 ? 'bg-yellow-900/30' : 'bg-red-900/30'

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg ${bgClass}`}>
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className={`text-sm font-mono font-semibold ${colorClass}`}>
        {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`}
      </span>
    </div>
  )
}

function PredictionCard({ symbol, priceHistory, latestActual, latestPredictions }) {
  const history = priceHistory[symbol] || []
  const actual = latestActual[symbol]
  const pqPred = latestPredictions[symbol]?.pq
  const nqPred = latestPredictions[symbol]?.nq

  const pqDelta = actual && pqPred != null ? ((pqPred - actual) / actual) * 100 : null
  const nqDelta = actual && nqPred != null ? ((nqPred - actual) / actual) * 100 : null

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xl font-bold text-white">{symbol}</span>
        <span className="text-2xl font-mono font-semibold text-slate-100">
          {actual != null ? `$${actual.toFixed(2)}` : '—'}
        </span>
      </div>

      <div className="h-48 mb-3">
        {history.length < 3 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">Waiting for data…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(v, name) => [`$${v != null ? Number(v).toFixed(2) : '—'}`, name]}
                labelFormatter={() => ''}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="#e2e8f0"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="pq"
                name="PQ Prediction"
                stroke="#818cf8"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="nq"
                name="NQ (consumer 1)"
                stroke="#fb923c"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex gap-2">
        <DeltaBadge label="PQ" delta={pqDelta} />
        <DeltaBadge label="NQ" delta={nqDelta} />
      </div>
    </div>
  )
}

export default function PredictionView({
  symbols,
  canonicalNqConsumer,
  priceHistory,
  latestActual,
  latestPredictions,
}) {
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    if (!helpOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setHelpOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [helpOpen])

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-haspopup="dialog"
          className="self-start px-3 py-1.5 rounded-md text-sm font-medium border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:border-slate-500 transition-colors"
        >
          Help
        </button>
        <div className="flex flex-wrap items-center gap-5 bg-slate-800 rounded-lg px-5 py-2.5 border border-slate-700 shrink-0">
          <LegendItem color="#e2e8f0" label="Actual" />
          <LegendItem color="#818cf8" label="PQ Prediction" />
          <LegendItem color="#fb923c" label={`NQ (consumer ${canonicalNqConsumer})`} dashed />
        </div>
      </div>

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
          onClick={() => setHelpOpen(false)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-lg rounded-xl border border-slate-600 bg-slate-800 shadow-2xl p-6 pt-5 pr-14"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="prediction-help-title"
          >
            <h2 id="prediction-help-title" className="text-lg font-semibold text-white mb-3 pr-2">
              Help
            </h2>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors text-xl leading-none font-light"
              aria-label="Dismiss help"
            >
              ×
            </button>
            <p className="text-slate-400 text-sm leading-relaxed">
              PQ: one consumer per partition sees 100% of trades for its symbol in order — the model uses a{' '}
              <strong>faster EMA</strong>, a <strong>short VWAP window</strong>, and a <strong>last-print</strong> blend so
              it tracks the tape. NQ: competing consumers share work — the dashed line is{' '}
              <strong>consumer {canonicalNqConsumer}</strong> only, with a smoother estimator trained on roughly 1/N of
              each symbol&apos;s trades (not an average of all NQ instances).
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {symbols.map((symbol) => (
          <PredictionCard
            key={symbol}
            symbol={symbol}
            priceHistory={priceHistory}
            latestActual={latestActual}
            latestPredictions={latestPredictions}
          />
        ))}
      </div>
    </div>
  )
}
