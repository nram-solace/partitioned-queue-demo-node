import { useState, useEffect } from 'react'
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts'
import {
  CHART_ACCURACY_GAP_WINDOW,
  CHART_ACCURACY_SHARED_MAX_GAP_PERCENT,
  closenessPctFromMeanGap,
  MIN_SAMPLES_FOR_CLOSENESS_METRIC,
} from '../config'
import { formatPredictionValue } from '../utils/formatPredictionValue'

/** Mean |Δ|% from rolling samples recorded on each prediction message (App.jsx). */
function channelStatsFromGapSamples(gapSamples, windowSize, minSamples, scaleMaxGapPercent) {
  const slice = (gapSamples || []).slice(-windowSize)
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
  const closenessLabel =
    insufficientSamples
      ? '—'
      : closenessPct == null || !Number.isFinite(closenessPct)
        ? '—'
        : `${closenessPct.toFixed(0)}%`

  const barTitle = insufficientSamples
    ? `${label}: ${sampleCount}/${minSamples} prediction samples — bar appears once enough ${label} updates have been recorded.`
    : meanGapPct != null && Number.isFinite(meanGapPct)
      ? `Mean |Δ| over recent ${label} predictions: ${meanGapPct.toFixed(2)}% of observed value. Closeness ${Math.round(barW)}% (100 ≈ avg gap ~0; 0% when mean gap ≥ ${cap}%). Last ${sampleCount} sample(s), max ${CHART_ACCURACY_GAP_WINDOW}.`
      : `No ${label} prediction samples recorded yet.`

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
          aria-valuenow={Math.round(barW)}
          aria-valuetext={`${label} closeness ${Math.round(barW)} percent, mean chart gap ${meanGapPct != null && Number.isFinite(meanGapPct) ? `${meanGapPct.toFixed(2)} percent` : 'unknown'}`}
          aria-label={`${label} closeness ${Math.round(barW)} percent, mean chart gap ${meanGapPct != null && Number.isFinite(meanGapPct) ? `${meanGapPct.toFixed(2)} percent` : 'unknown'}`}
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
  accuracyGapSamplesBySeries,
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

  const accuracyCap =
    typeof uiPrediction?.accuracyMaxGapPercent === 'number' &&
    Number.isFinite(uiPrediction.accuracyMaxGapPercent) &&
    uiPrediction.accuracyMaxGapPercent > 0
      ? uiPrediction.accuracyMaxGapPercent
      : CHART_ACCURACY_SHARED_MAX_GAP_PERCENT

  const gapSamples = accuracyGapSamplesBySeries?.[seriesKey] || {}
  const pqBar = channelStatsFromGapSamples(
    gapSamples.pq,
    CHART_ACCURACY_GAP_WINDOW,
    MIN_SAMPLES_FOR_CLOSENESS_METRIC,
    accuracyCap,
  )
  const nqBar = channelStatsFromGapSamples(
    gapSamples.nq,
    CHART_ACCURACY_GAP_WINDOW,
    MIN_SAMPLES_FOR_CLOSENESS_METRIC,
    accuracyCap,
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
          <span className="text-slate-400">{seriesLabel.toLowerCase()}</span>
          <span className="text-slate-500"> — publisher actual vs PQ / NQ estimates</span>
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
          scaleMaxGapPercent={accuracyCap}
        />
        <PredictionChannelRow
          label="NQ"
          signedDelta={nqDelta}
          closenessPct={nqBar.closenessPct}
          meanGapPct={nqBar.meanGapPct}
          barColorClass="bg-orange-500"
          sampleCount={nqBar.sampleCount}
          scaleMaxGapPercent={accuracyCap}
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
  accuracyGapSamplesBySeries = {},
}) {
  const seriesLabel = uiPrediction?.seriesLabel || 'partition key'
  const valueLabel = uiPrediction?.valueLabel || 'value'
  const helpAccuracyCap =
    typeof uiPrediction?.accuracyMaxGapPercent === 'number' &&
    Number.isFinite(uiPrediction.accuracyMaxGapPercent) &&
    uiPrediction.accuracyMaxGapPercent > 0
      ? uiPrediction.accuracyMaxGapPercent
      : CHART_ACCURACY_SHARED_MAX_GAP_PERCENT
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
              <strong>{CHART_ACCURACY_GAP_WINDOW}</strong> prediction events per channel (each compared to the observed value in that tick; chart lines still use the latest estimate on every publisher snapshot).{' '}
              <strong>Total published message count does not enter this average</strong> — anything older than that
              trailing slice is ignored, so the bar reflects recent chart behavior, not “since connect” or thousands of
              orders. The headline <strong>Δ</strong> is only the latest tick, while <strong>μ</strong> and the bar are the
              mean gap over that short window, so they can disagree with what the eye sees on the far right of the line.
              Closeness % stays <strong>—</strong> until at least <strong>{MIN_SAMPLES_FOR_CLOSENESS_METRIC}</strong>{' '}
              overlapping points so a tiny slice of the tape does not dominate. Map 0–100 so{' '}
              <strong>100 ≈ average gap ~0</strong>.               <strong>PQ and NQ share one mean-gap cap</strong> (
              <strong>{helpAccuracyCap}%</strong>) so higher % means lower average error on that
              channel — comparable across rows. At or above the cap, closeness shows <strong>0%</strong> (empty bar).
              Hover the bar or μ≈ for the numeric mean.
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
            accuracyGapSamplesBySeries={accuracyGapSamplesBySeries}
            uiPrediction={uiPrediction}
          />
        ))}
      </div>
    </div>
  )
}
