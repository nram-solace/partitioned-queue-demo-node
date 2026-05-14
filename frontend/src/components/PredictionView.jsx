import { useState, useEffect } from 'react'
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts'
import { CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT } from '../config'

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

function PredictionChannelRow({ label, signedDelta, closenessPct, meanGapPct, barColorClass }) {
  const absDigits =
    signedDelta == null || !Number.isFinite(signedDelta) ? null : Math.abs(signedDelta).toFixed(2)

  const numColorClass =
    signedDelta == null || !Number.isFinite(signedDelta)
      ? 'text-slate-500'
      : signedDelta > 0.0001
        ? 'text-sky-400'
        : signedDelta < -0.0001
          ? 'text-red-400'
          : 'text-slate-400'

  const barW =
    closenessPct != null && Number.isFinite(closenessPct)
      ? Math.min(100, Math.max(0, closenessPct))
      : 0

  const cap = CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT
  const atClosenessScaleFloor =
    closenessPct != null &&
    Number.isFinite(closenessPct) &&
    ((meanGapPct != null && Number.isFinite(meanGapPct) && meanGapPct >= cap - 1e-9) || closenessPct <= 1e-6)

  const closenessLabel =
    closenessPct == null || !Number.isFinite(closenessPct)
      ? '—'
      : atClosenessScaleFloor
        ? 'NA'
        : `${closenessPct.toFixed(0)}%`

  const barTitle =
    meanGapPct != null && Number.isFinite(meanGapPct)
      ? atClosenessScaleFloor
        ? `Mean |Δ| over prediction updates: ${meanGapPct.toFixed(2)}% of price (≥ ${cap}% scale max). Closeness shown as NA — not “zero match”; the bar is empty because this average is past the top of the 0–100 meter.`
        : `Mean |Δ| over prediction updates: ${meanGapPct.toFixed(2)}% of price (since connect). Closeness ${Math.round(barW)}% — 100 = avg gap ~0; at or above ${cap}% mean gap we show NA instead of 0%.`
      : 'No prediction updates yet, or waiting for last published price.'

  return (
    <div className="contents">
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      <span
        className={`text-base font-mono font-semibold tabular-nums inline-flex items-baseline justify-start gap-0.5 ${numColorClass}`}
        title={
          signedDelta == null
            ? ''
            : signedDelta > 0
              ? 'Prediction above last published price (|Δ| as % of last price)'
              : signedDelta < 0
                ? 'Prediction below last published price (|Δ| as % of last price)'
                : ''
        }
        aria-label={
          absDigits == null
            ? undefined
            : `Absolute delta ${absDigits} percent versus last published price`
        }
      >
        <span className="text-[10px] text-slate-500 font-sans font-normal leading-none" aria-hidden>
          Δ
        </span>
        {absDigits == null ? (
          <span className="text-slate-500">—</span>
        ) : (
          <span>{absDigits}</span>
        )}
      </span>
      <span
        className="inline-flex items-baseline justify-center gap-0.5 text-xs text-slate-500 shrink-0 w-8 select-none font-serif"
        title={barTitle}
        aria-label="Mean |Δ| over prediction updates (μ), mapped to closeness (≈)"
      >
        <span aria-hidden>μ</span>
        <span className="text-[10px] text-slate-600 font-sans leading-none" aria-hidden>
          ≈
        </span>
      </span>
      <div className="min-w-0 flex items-center" title={barTitle}>
        <div
          className="w-full h-2.5 rounded-full bg-slate-700/90 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={atClosenessScaleFloor ? 0 : Math.round(barW)}
          aria-valuetext={
            atClosenessScaleFloor
              ? `${label} closeness not on 0 to 100 scale, mean gap ${meanGapPct != null && Number.isFinite(meanGapPct) ? `${meanGapPct.toFixed(2)} percent` : 'unknown'}`
              : `${label} closeness ${Math.round(barW)} percent, mean gap ${meanGapPct != null && Number.isFinite(meanGapPct) ? `${meanGapPct.toFixed(2)} percent` : 'unknown'}`
          }
          aria-label={
            atClosenessScaleFloor
              ? `${label} closeness not on scale, mean gap over prediction updates ${meanGapPct != null && Number.isFinite(meanGapPct) ? `${meanGapPct.toFixed(2)} percent` : 'unknown'}`
              : `${label} closeness ${Math.round(barW)} percent, mean gap over prediction updates ${meanGapPct != null && Number.isFinite(meanGapPct) ? `${meanGapPct.toFixed(2)} percent` : 'unknown'}`
          }
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out ${barColorClass}`}
            style={{ width: `${barW}%` }}
          />
        </div>
      </div>
      <span className="text-[11px] font-mono text-slate-400 text-right tabular-nums min-w-[1.75rem]">
        {closenessLabel}
      </span>
    </div>
  )
}

function PredictionCard({ symbol, priceHistory, latestActual, latestPredictions, cumulativeStats }) {
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

      <div className="mt-4 pt-3 border-t border-slate-700/80 grid grid-cols-[minmax(1.75rem,2.25rem)_minmax(4rem,5rem)_minmax(1.75rem,2rem)_1fr_minmax(2.25rem,2.75rem)] gap-x-2 gap-y-2.5 items-center">
        <PredictionChannelRow
          label="PQ"
          signedDelta={pqDelta}
          closenessPct={cumulativeStats?.pqClosenessPct}
          meanGapPct={cumulativeStats?.pqMeanGapPct}
          barColorClass="bg-indigo-500"
        />
        <PredictionChannelRow
          label="NQ"
          signedDelta={nqDelta}
          closenessPct={cumulativeStats?.nqClosenessPct}
          meanGapPct={cumulativeStats?.nqMeanGapPct}
          barColorClass="bg-orange-500"
        />
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
  symbolCumulativeTrackStats = {},
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
            <p className="text-slate-500 text-xs leading-relaxed mt-4 border-t border-slate-600 pt-3">
              <strong>Tile rows (PQ / NQ):</strong> each row is{' '}
              <strong className="text-slate-400">channel</strong> · <strong className="text-slate-400">Δ value</strong>{' '}
              · <strong className="text-slate-400">μ≈</strong> (mean |Δ| over <strong>prediction updates</strong>, then{' '}
              <strong>mapped</strong> closeness) · <strong className="text-slate-400">bar</strong> ·{' '}
              <strong className="text-slate-400">%</strong>. The <strong>Δ value</strong> is the latest gap as a percent
              of last published price (prediction minus actual), with <span className="text-sky-300">blue</span> when
              above and <span className="text-red-300">red</span> when below. The <strong>μ≈</strong> label and{' '}
              <strong>bar + %</strong> are <strong>session closeness</strong>: each time a PQ or NQ prediction is
              emitted, we compare it to the <strong>last published actual</strong> for that symbol, record |Δ|, and
              keep a <strong>cumulative mean</strong> of those gaps. We do <strong>not</strong> add a sample on every
              publisher tick (that would count the same stale NQ against a moving price thousands of times). Map
              0–100 so <strong>100 ≈ average gap ~0</strong> and when the mean reaches or passes the scale max (
              {CUMULATIVE_CLOSENESS_SCALE_MAX_GAP_PERCENT}%) we show <strong>NA</strong> instead of “0%” so it is not
              read as “zero accuracy.” Hover the bar or μ≈ for the numeric mean.
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
            cumulativeStats={symbolCumulativeTrackStats[symbol]}
          />
        ))}
      </div>
    </div>
  )
}
