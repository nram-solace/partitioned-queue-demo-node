/**
 * Format a numeric prediction/actual for display using profile.ui.prediction.
 * @param {number | null | undefined} value
 * @param {{ valueFormat?: string, currency?: string } | undefined} uiPrediction
 */
export function formatPredictionValue(value, uiPrediction) {
  if (value == null || !Number.isFinite(value)) return '—'
  const fmt = uiPrediction?.valueFormat || 'number'
  if (fmt === 'currency') {
    const currency = uiPrediction?.currency || 'USD'
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
    } catch {
      return `$${value.toFixed(2)}`
    }
  }
  if (fmt === 'decimal') {
    return value.toFixed(2)
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
