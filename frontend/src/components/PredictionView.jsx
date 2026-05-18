import { useState, useEffect } from 'react'
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts'
import {
  CHART_ACCURACY_GAP_WINDOW,
  CHART_ACCURACY_SHARED_MAX_GAP_PERCENT,
  closenessPctFromMeanGap,
  MIN_SAMPLES_FOR_CLOSENESS_METRIC,
} from '../config'
import { formatPredictionValue } from '../utils/formatPredictionValue'

/**
 * Mean |pred − actual| / actual over recent chart points (same rows the lines use), so the bar tracks the graph.
 */
function chartChannelGapStats(history, channel, windowSize, minSamples, scaleMaxGapPercent) {
  const gaps = []
  for (const p of history) {
    const actual = p.actual
    const pred = p[channel]
    if (actual == null || !Number.isFinite(actual) || actual <= 0) continue
    if (pred == null || !Number.isFinite(pred)) continue
    gaps.push(Math.abs((pred - actual) / actual) * 100)
  }
  const slice = gaps.slice(-windowSize)
  const n = slice.length
  if (n < minSamples) {
    return {
      closenessPct: null,
      meanGapPct: null,
      sampleCount: n,
    }
  }
  const mean = slice.reduce((a, b) => a + b, 0) / n
  return {
    closenessPct: closenessPctFromMeanGap(mean, scaleMaxGapPercent),
    meanGapPct: mean,
    sampleCount: n,
  }
}

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
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  )
}

function PredictionChannelRow({
  label,
  signedDelta,
  closenessPct,
  meanGapPct,
  barColorClass,
  sampleCount = 0,
  minSamples = MIN_SAMPLES_FOR_CLOSENESS_METRIC,
  scaleMaxGapPercent = CHART_ACCURACY_SHARED_MAX_GAP_PERCENT,
}) {
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

  const insufficientSamples = sampleCount < minSamples

  const barW =
    !insufficientSamples && closenessPct != null && Number.isFinite(closenessPct)
      ? Math.min(100, Math.max(0, closenessPct))
      : 0

  const cap = scaleMaxGapPercent
  /** NA only when mean gap is at/above this row’s scale max (then closeness is 0 and bar is empty). */
  const atClosenessScaleFloor =
    !insufficientSamples &&
    meanGapPct != null &&
    Number.isFinite(meanGapPct) &&
    meanGapPct >= cap - 1e-9

  const closenessLabel =
    insufficientSamples
      ? '—'
      : closenessPct == null || !Number.isFinite(closenessPct)
        ? '—'
        : atClosenessScaleFloor
          ? 'NA'
          : `${closenessPct.toFixed(0)}%`

  const barTitle = insufficientSamples
    ? `${label}: ${sampleCount}/${minSamples} chart points with both actual and ${label} — bar appears once the visible window has enough overlapping samples.`
    : meanGapPct != null && Number.isFinite(meanGapPct)
      ? atClosenessScaleFloor
        ? `Mean |Δ| on the chart (recent window): ${meanGapPct.toFixed(2)}% of price (≥ ${cap}% scale max). NA means the bar is off-scale, not “zero match.” Last ${sampleCount} chart sample(s), max ${CHART_ACCURACY_GAP_WINDOW}; total messages do not affect this.`
        : `Mean |Δ| on the chart (recent window): ${meanGapPct.toFixed(2)}% of price. Closeness ${Math.round(barW)}% — 100 ≈ avg gap ~0; at or above ${cap}% mean gap we show NA instead of 0%. Based on last ${sampleCount} chart sample(s), max ${CHART_ACCURACY_GAP_WINDOW}; total published messages do not affect this.`
      : 'No overlapping actual + prediction samples in the chart window yet.'

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
        aria-label="Mean chart |Δ| (μ), mapped to closeness (≈)"
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
              ? `${label} closeness not on 0 to 100 scale, mean chart gap ${meanGapPct != null && Number.isFinite(meanGapPct) ? `${meanGapPct.toFixed(2)} percent` : 'unknown'}`
              : `${label} closeness ${Math.round(barW)} percent, mean chart gap ${meanGapPct != null && Number.isFinite(meanGapPct) ? `${meanGapPct.toFixed(2)} percent` : 'unknown'}`
          }
          aria-label={
            atClosenessScaleFloor
              ? `${label} closeness not on scale, mean chart gap ${meanGapPct != null && Number.isFinite(meanGapPct) ? `${meanGapPct.toFixed(2)} percent` : 'unknown'}`
              : `${label} closeness ${Math.round(barW)} percent, mean chart gap ${meanGapPct != null && Number.isFinite(meanGapPct) ? `${meanGapPct.toFixed(2)} percent` : 'unknown'}`
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

function PredictionCard({
  seriesKey,
  seriesHistory,
  latestActuals,
  latestPredictions,
  publishedCountBySeries,
  uiPrediction,
}) {
  const history = seriesHistory[seriesKey] || []
  const actual = latestActuals[seriesKey]
  const pqPred = latestPredictions[seriesKey]?.pq
  const nqPred = latestPredictions[seriesKey]?.nq
  const publishedEvents = publishedCountBySeries?.[seriesKey]
  const seriesLabel = uiPrediction?.seriesLabel || 'Series'
  const valueLabel = uiPrediction?.valueLabel || 'Value'

  const pqDelta = actual && pqPred != null ? ((pqPred - actual) / actual) * 100 : null
  const nqDelta = actual && nqPred != null ? ((nqPred - actual) / actual) * 100 : null

  const pqBar = chartChannelGapStats(
    history,
    'pq',
    CHART_ACCURACY_GAP_WINDOW,
    MIN_SAMPLES_FOR_CLOSENESS_METRIC,
    CHART_ACCURACY_SHARED_MAX_GAP_PERCENT,
  )
  const nqBar = chartChannelGapStats(
    history,
    'nq',
    CHART_ACCURACY_GAP_WINDOW,
    MIN_SAMPLES_FOR_CLOSENESS_METRIC,
    CHART_ACCURACY_SHARED_MAX_GAP_PERCENT,
  )

  const eventsLabel =
    typeof publishedEvents === 'number'
      ? ` (${publishedEvents.toLocaleString()} ${publishedEvents === 1 ? 'event' : 'events'})`
      : ''

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div
        className="mb-3 space-y-1.5"
        title={`${seriesKey}${eventsLabel} — ${valueLabel}: ${formatPredictionValue(actual, uiPrediction)}`}
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
            <span className="text-xl font-bold text-white">{seriesKey}</span>
            {eventsLabel ? (
              <span className="text-slate-400 font-semibold font-sans text-base">{eventsLabel}</span>
            ) : null}
          </div>
          <span className="text-base text-slate-400 font-sans shrink-0 text-right">
            <span className="text-slate-500">{valueLabel}:</span>{' '}
            <span className="font-mono font-semibold text-slate-100 text-lg tabular-nums">
              {formatPredictionValue(actual, uiPrediction)}
            </span>
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-snug">
          Predicting{' '}
          <span className="text-slate-400">{valueLabel.toLowerCase()}</span> per{' '}
          {seriesLabel.toLowerCase()} (publisher actual vs PQ / NQ estimates)
        </p>
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
                formatter={(v, name) => [formatPredictionValue(v != null ? Number(v) : null, uiPrediction), name]}
                labelFormatter={() => ''}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="#94a3b8"
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
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="nq"
                name="NQ (consumer 1)"
                stroke="#fb923c"
                strokeWidth={2}
                strokeDasharray="4 3"
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
          closenessPct={pqBar.closenessPct}
          meanGapPct={pqBar.meanGapPct}
          barColorClass="bg-indigo-500"
          sampleCount={pqBar.sampleCount}
          scaleMaxGapPercent={CHART_ACCURACY_SHARED_MAX_GAP_PERCENT}
        />
        <PredictionChannelRow
          label="NQ"
          signedDelta={nqDelta}
          closenessPct={nqBar.closenessPct}
          meanGapPct={nqBar.meanGapPct}
          barColorClass="bg-orange-500"
          sampleCount={nqBar.sampleCount}
          scaleMaxGapPercent={CHART_ACCURACY_SHARED_MAX_GAP_PERCENT}
        />
      </div>
    </div>
  )
}

export default function PredictionView({
  seriesKeys,
  uiPrediction,
  canonicalNqConsumer,
  seriesHistory,
  latestActuals,
  latestPredictions,
  publishedCountBySeries = {},
}) {
  const seriesLabel = uiPrediction?.seriesLabel || 'partition key'
  const valueLabel = uiPrediction?.valueLabel || 'value'
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
          <LegendItem color="#94a3b8" label="Actual" />
          <LegendItem color="#818cf8" label="PQ Prediction" dashed />
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
              PQ: one consumer per partition sees 100% of messages for its {seriesLabel.toLowerCase()} in order — the
              model uses a <strong>faster EMA</strong>, a <strong>short weighted window</strong>, and a{' '}
              <strong>last observation</strong> blend so it tracks publisher actuals. NQ: competing consumers share work
              — the dashed line is <strong>consumer {canonicalNqConsumer}</strong> only, with a smoother estimator on
              roughly 1/N of each {seriesLabel.toLowerCase()}&apos;s stream (not an average of all NQ instances).
            </p>
            <p className="text-slate-500 text-xs leading-relaxed mt-4 border-t border-slate-600 pt-3">
              <strong>Tile rows (PQ / NQ):</strong> each row is{' '}
              <strong className="text-slate-400">channel</strong> · <strong className="text-slate-400">Δ value</strong>{' '}
              · <strong className="text-slate-400">μ≈</strong> (mean |Δ| on the <strong>chart</strong>, then{' '}
              <strong>mapped</strong> closeness) · <strong className="text-slate-400">bar</strong> ·{' '}
              <strong className="text-slate-400">%</strong>. The <strong>Δ value</strong> is the latest gap as a percent
              of last published {valueLabel.toLowerCase()} (prediction minus actual), with{' '}
              <span className="text-sky-300">blue</span> when
              above and <span className="text-red-300">red</span> when below. The <strong>μ≈</strong> label and{' '}
              <strong>bar + %</strong> use the same data as the lines: at each publisher snapshot we take actual and the
              PQ/NQ values shown on the chart, compute |pred − actual| / actual, and average the last up to{' '}
              <strong>{CHART_ACCURACY_GAP_WINDOW}</strong> such points (only rows where that channel has a value).{' '}
              <strong>Total published message count does not enter this average</strong> — anything older than that
              trailing slice is ignored, so the bar reflects recent chart behavior, not “since connect” or thousands of
              orders. The headline <strong>Δ</strong> is only the latest tick, while <strong>μ</strong> and the bar are the
              mean gap over that short window, so they can disagree with what the eye sees on the far right of the line.
              Closeness % stays <strong>—</strong> until at least <strong>{MIN_SAMPLES_FOR_CLOSENESS_METRIC}</strong>{' '}
              overlapping points so a tiny slice of the tape does not dominate. Map 0–100 so{' '}
              <strong>100 ≈ average gap ~0</strong>. <strong>PQ and NQ share one mean-gap cap</strong> (
              <strong>{CHART_ACCURACY_SHARED_MAX_GAP_PERCENT}%</strong>) so higher % means lower average error on that
              channel — comparable across rows. When the mean reaches or passes that cap we show <strong>NA</strong>{' '}
              instead of “0%” so it is not read as “zero accuracy.” Hover the bar or μ≈ for the numeric mean.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {seriesKeys.map((seriesKey) => (
          <PredictionCard
            key={seriesKey}
            seriesKey={seriesKey}
            seriesHistory={seriesHistory}
            latestActuals={latestActuals}
            latestPredictions={latestPredictions}
            publishedCountBySeries={publishedCountBySeries}
            uiPrediction={uiPrediction}
          />
        ))}
      </div>
    </div>
  )
}
