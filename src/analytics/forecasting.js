function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export const exponentialSmoothingForecaster = {
  name: "simple_exponential_smoothing",
  forecast(series, { horizon = 3, alpha = 0.35, confidenceZ = 1.96 } = {}) {
    const values = series.map((point) => Number(point.value)).filter((value) => Number.isFinite(value) && value >= 0);
    if (!values.length) return { method: this.name, status: "insufficient_history", horizon, points: [] };
    let level = values[0];
    const residuals = [];
    for (let index = 1; index < values.length; index += 1) {
      residuals.push(values[index] - level);
      level = alpha * values[index] + (1 - alpha) * level;
    }
    const sigma = standardDeviation(residuals);
    const points = Array.from({ length: horizon }, (_, index) => {
      const spread = confidenceZ * sigma * Math.sqrt(index + 1);
      return {
        period: index + 1,
        value: level,
        lower: Math.max(0, level - spread),
        upper: level + spread,
      };
    });
    return { method: this.name, status: values.length >= 3 ? "ok" : "limited_history", alpha, observations: values.length, residualStdDev: sigma, points };
  },
};

export function backtestForecast(series, forecaster = exponentialSmoothingForecaster, options = {}) {
  const clean = series.filter((point) => Number.isFinite(Number(point.value)) && Number(point.value) >= 0);
  if (clean.length < 3) return { status: "insufficient_history", mae: null, wape: null, observations: 0 };
  const errors = [];
  let actualTotal = 0;
  for (let index = 2; index < clean.length; index += 1) {
    const result = forecaster.forecast(clean.slice(0, index), { ...options, horizon: 1 });
    const predicted = result.points[0]?.value;
    const actual = Number(clean[index].value);
    if (Number.isFinite(predicted)) {
      errors.push(Math.abs(actual - predicted));
      actualTotal += Math.abs(actual);
    }
  }
  return {
    status: errors.length ? "ok" : "insufficient_history",
    mae: errors.length ? mean(errors) : null,
    wape: errors.length && actualTotal > 0 ? errors.reduce((sum, value) => sum + value, 0) / actualTotal : null,
    observations: errors.length,
  };
}
