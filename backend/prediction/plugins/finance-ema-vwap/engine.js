class EmaVwapEngine {
  constructor(queueType) {
    this.queueType = queueType;
    const isPq = queueType === 'partitioned';
    this.isPq = isPq;
    this.alpha = isPq ? 0.48 : 0.15;
    this.maxWindow = 100;
    this.ema = null;
    this.window = [];
    this.samplesUsed = 0;
  }

  update(value, weight) {
    this.samplesUsed++;
    this.ema = this.ema === null ? value : this.alpha * value + (1 - this.alpha) * this.ema;
    this.window.push({ value, weight });
    if (this.window.length > this.maxWindow) {
      this.window.shift();
    }
    const totalWeight = this.window.reduce((s, t) => s + t.weight, 0);
    const vwap =
      totalWeight === 0
        ? value
        : this.window.reduce((s, t) => s + t.value * t.weight, 0) / totalWeight;
    const blended = this.isPq
      ? 0.42 * this.ema + 0.33 * vwap + 0.25 * value
      : 0.6 * this.ema + 0.4 * vwap;
    return {
      predicted: parseFloat(blended.toFixed(2)),
      samplesUsed: this.samplesUsed,
    };
  }
}

module.exports = { EmaVwapEngine };
