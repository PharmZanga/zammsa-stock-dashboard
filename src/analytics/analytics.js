import { mergeAnalyticsConfig } from "./config.js";
import { backtestForecast, holtWintersForecaster, projectInventoryBalance, reorderRecommendation } from "./forecasting.js";

const round = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(value)
  ? null
  : Number(value.toFixed(digits));

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function trendPercent(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2 || clean[0] === 0) return null;
  return (clean.at(-1) - clean[0]) / Math.abs(clean[0]);
}

function correlation(left, right) {
  if (left.length !== right.length || left.length < 3) return null;
  const leftMean = average(left);
  const rightMean = average(right);
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const denominator = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) * right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0));
  return denominator ? numerator / denominator : 0;
}

function detectSeasonality(series, lag = 12) {
  const values = series.map((point) => Number(point.value)).filter(Number.isFinite);
  if (values.length < lag * 2) return { status: "insufficient_history", lag, score: null };
  const score = correlation(values.slice(lag), values.slice(0, -lag));
  return { status: Math.abs(score) >= 0.6 ? "detected" : "not_detected", lag, score: round(score, 3) };
}

export function classifyMos(mos, policy) {
  if (!Number.isFinite(mos)) return "data_gap";
  if (mos < policy.understockMos) return "understocked";
  if (mos <= policy.adequateMaxMos) return "adequate";
  if (mos > policy.excessMos) return "excess";
  return "overstocked";
}

function addMonths(dateString, months) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(earlier, later) {
  return Math.max(0, Math.floor((new Date(`${later}T00:00:00Z`) - new Date(`${earlier}T00:00:00Z`)) / 86400000));
}

function median(values) {
  const clean = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function monthKey(date) {
  return date.slice(0, 7);
}

function movementDemandSeries(movements) {
  const monthly = new Map();
  movements.filter((row) => /out|issue|ship|dispens|consum/.test(row.transactionType)).forEach((row) => {
    monthly.set(monthKey(row.date), (monthly.get(monthKey(row.date)) || 0) + row.quantity);
  });
  return [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

function amiDemandSeries(snapshots) {
  return snapshots.filter((row) => Number.isFinite(row.ami) && row.ami >= 0).map((row) => ({ date: row.date, value: row.ami }));
}

function portfolioSummary(items, asOfDate) {
  const counts = { reported_stockout: 0, understocked: 0, adequate: 0, overstocked: 0, excess: 0, data_gap: 0 };
  items.forEach((item) => { counts[item.status] += 1; });
  const stockouts90Days = items.filter((item) => item.expectedStockoutDate && item.expectedStockoutDate <= addDays(asOfDate, 90)).length;
  const forecastableItems = items.filter((item) => Number.isFinite(item.forecastMonthlyDemand)).length;
  const reorderUnits = items.reduce((sum, item) => sum + (item.recommendedOrderQuantity || 0), 0);
  const costedItems = items.filter((item) => item.inventoryValue !== null);
  const inventoryValue = costedItems.reduce((sum, item) => sum + item.inventoryValue, 0);
  const carryingCost = costedItems.reduce((sum, item) => sum + (item.annualCarryingCost || 0), 0);
  return {
    ...counts,
    activeCommodities: items.length,
    validForecasts: items.filter((item) => item.forecastStatus === "valid").length,
    insufficientHistory: items.filter((item) => item.forecastStatus === "insufficient_data").length,
    staleData: items.filter((item) => item.dataQualityFlags.includes("stale_data")).length,
    missingReports: items.filter((item) => !item.selectedReportPresent).length,
    stockouts90Days,
    forecastableItems,
    demandUnavailable: items.length - forecastableItems,
    reorderUnits: round(reorderUnits, 0),
    costedItems: costedItems.length,
    inventoryValue: costedItems.length ? round(inventoryValue, 2) : null,
    annualCarryingCost: costedItems.length ? round(carryingCost, 2) : null,
  };
}

function priorityScore(item, asOfDate) {
  let score = item.status === "reported_stockout" ? 180 : item.status === "understocked" ? 100 : item.status === "excess" ? 55 : item.status === "overstocked" ? 35 : item.status === "data_gap" ? 30 : 0;
  if (item.expectedStockoutDate) {
    const days = Math.ceil((new Date(`${item.expectedStockoutDate}T00:00:00Z`) - new Date(`${asOfDate}T00:00:00Z`)) / 86400000);
    if (days <= 30) score += 80;
    else if (days <= 60) score += 50;
    else if (days <= 90) score += 25;
  }
  if (item.dataQualityFlags.length) score += 10;
  if (item.dataQualityFlags.includes("stale_data")) score += 30;
  return score;
}

export function buildAnalyticsReport({ snapshots, movements = [], config: overrides = {}, forecaster = holtWintersForecaster, asOfDate: requestedAsOfDate = null }) {
  const config = mergeAnalyticsConfig(overrides);
  const availableDates = snapshots.filter((row) => row.location === config.location).map((row) => row.date).sort();
  const asOfDate = requestedAsOfDate || availableDates.at(-1);
  const centralSnapshots = snapshots.filter((row) => row.location === config.location && row.date <= asOfDate).sort((a, b) => a.date.localeCompare(b.date));
  if (!centralSnapshots.length) throw new Error(`No snapshots found for ${config.location}.`);
  const grouped = new Map();
  centralSnapshots.forEach((row) => {
    if (!grouped.has(row.sku)) grouped.set(row.sku, []);
    grouped.get(row.sku).push(row);
  });

  const items = [...grouped.entries()].map(([sku, history]) => {
    const latest = history.at(-1);
    const selectedReportPresent = latest.date === asOfDate;
    const recordAgeDays = daysBetween(latest.date, asOfDate);
    const skuMovements = movements.filter((row) => row.sku === sku && row.location === config.location);
    const movementSeries = movementDemandSeries(skuMovements);
    const demandSeries = movementSeries.length ? movementSeries : amiDemandSeries(history);
    const demandSource = movementSeries.length ? "outbound_movements" : demandSeries.length ? "ami_proxy" : "unavailable";
    const stockHistory = history.filter((row) => Number.isFinite(row.stockOnHand));
    const forecastEligible = demandSeries.length >= 3 && stockHistory.length >= 2 && Number.isFinite(latest.stockOnHand) && latest.stockOnHand >= 0;
    const forecast = forecaster.forecast(forecastEligible ? demandSeries : [], {
      horizon: config.forecastHorizonMonths,
      seasonalPeriod: config.forecastSeasonalPeriod,
      confidenceZ: config.confidenceZ,
    });
    const accuracy = forecastEligible ? backtestForecast(demandSeries, forecaster, { seasonalPeriod: config.forecastSeasonalPeriod, confidenceZ: config.confidenceZ }) : { status: "insufficient_history", mae: null, wape: null, observations: 0 };
    const monthlyDemand = forecastEligible ? (forecast.points[0]?.value ?? latest.ami ?? null) : null;
    const dailyDemand = Number.isFinite(monthlyDemand) ? monthlyDemand / config.daysPerMonth : null;
    const calculatedMos = Number.isFinite(latest.stockOnHand) && Number.isFinite(monthlyDemand) && monthlyDemand > 0 ? latest.stockOnHand / monthlyDemand : null;
    const mos = Number.isFinite(latest.mos) ? latest.mos : calculatedMos;
    const daysOfSupply = Number.isFinite(latest.stockOnHand) && dailyDemand > 0 ? latest.stockOnHand / dailyDemand : null;
    const leadTimeMonths = config.leadTimeDays / config.daysPerMonth;
    const reorder = Number.isFinite(monthlyDemand) && Number.isFinite(latest.stockOnHand)
      ? reorderRecommendation(forecast, latest.stockOnHand, leadTimeMonths, config.reorderSafetyFactor)
      : null;
    const safetyStock = reorder ? Math.max(0, reorder.reorderPoint - reorder.demandDuringLeadTime) : null;
    const reorderPoint = reorder?.reorderPoint ?? null;
    const recommendedOrderQuantity = reorder?.recommendedOrderQty ?? null;
    const expectedStockoutDate = Number.isFinite(daysOfSupply) ? addDays(latest.date, Math.max(0, Math.floor(daysOfSupply))) : null;
    const balanceProjection = projectInventoryBalance(history, forecast.forecast, { daysPerMonth: config.daysPerMonth, horizon: config.forecastHorizonMonths });
    const stockoutObservations = history.filter((row) => Number.isFinite(row.stockOnHand) && row.stockOnHand <= 0).length;
    const averageStock = average(history.map((row) => row.stockOnHand));
    const annualDemand = Number.isFinite(monthlyDemand) ? monthlyDemand * 12 : null;
    const turnover = annualDemand !== null && averageStock > 0 ? annualDemand / averageStock : null;
    const unitCost = Number.isFinite(latest.unitCost) ? latest.unitCost : null;
    const inventoryValue = unitCost !== null && Number.isFinite(latest.stockOnHand) ? unitCost * latest.stockOnHand : null;
    const lastOutboundDate = skuMovements.filter((row) => /out|issue|ship|dispens|consum/.test(row.transactionType)).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date || null;
    const lastInboundDate = skuMovements.filter((row) => /^(?:inbound|receipt|received|purchase_receipt)$/.test(row.transactionType)).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date || null;
    const stockAgeDays = lastInboundDate ? Math.max(0, Math.floor((new Date(`${asOfDate}T00:00:00Z`) - new Date(`${lastInboundDate}T00:00:00Z`)) / 86400000)) : null;
    const stagnant = lastOutboundDate
      ? (new Date(`${asOfDate}T00:00:00Z`) - new Date(`${lastOutboundDate}T00:00:00Z`)) / 86400000 > config.stagnantDays
      : demandSeries.length >= 3 && demandSeries.slice(-3).every((point) => point.value === 0) && latest.stockOnHand > 0;
    const dataQualityFlags = [];
    if (!Number.isFinite(latest.stockOnHand)) dataQualityFlags.push("missing_stock_on_hand");
    if (!selectedReportPresent) dataQualityFlags.push("missing_report");
    if (recordAgeDays > 31) dataQualityFlags.push("stale_data");
    if (Number.isFinite(latest.stockOnHand) && latest.stockOnHand < 0) dataQualityFlags.push("negative_balance");
    if (!demandSeries.length) dataQualityFlags.push("missing_demand_signal");
    if (!forecastEligible) dataQualityFlags.push("insufficient_historical_observations");
    if (!Number.isFinite(latest.mos) && Number.isFinite(calculatedMos)) dataQualityFlags.push("estimated_mos");
    if (Number.isFinite(latest.mos) && Number.isFinite(calculatedMos) && Math.abs(latest.mos - calculatedMos) > 0.15) dataQualityFlags.push("mos_reconciliation");
    if (forecast.status !== "ok") dataQualityFlags.push(forecast.status);
    const historicalDemandMedian = median(demandSeries.slice(0, -1).map((point) => Number(point.value)));
    const latestDemand = demandSeries.at(-1)?.value;
    if (Number.isFinite(historicalDemandMedian) && historicalDemandMedian > 0 && Number.isFinite(latestDemand) && (latestDemand > historicalDemandMedian * 3 || latestDemand < historicalDemandMedian / 3)) dataQualityFlags.push("unusual_consumption");
    const repeatedTail = history.slice(-3);
    if (repeatedTail.length === 3 && repeatedTail.every((row) => row.stockOnHand === repeatedTail[0].stockOnHand && row.ami === repeatedTail[0].ami)) dataQualityFlags.push("repeated_report_values");
    const latestStockStatus = Number.isFinite(latest.stockOnHand) && latest.stockOnHand === 0 && Number.isFinite(mos) && mos === 0 ? "reported_stockout" : classifyMos(mos, config.policy);
    const status = selectedReportPresent ? latestStockStatus : "data_gap";
    const action = status === "reported_stockout"
      ? "Confirm the reported stock-out, expedite supply and review redistribution immediately."
      : status === "understocked"
      ? "Expedite replenishment and verify pipeline or redistribution options."
      : status === "excess"
        ? "Stop or defer replenishment; review expiry exposure and redistribution."
        : status === "overstocked"
          ? "Review incoming orders and redistribute before stock becomes excess."
          : status === "data_gap"
            ? `Obtain the missing ${asOfDate} report; latest valid record is ${latest.date} and must not be treated as current stock.`
            : "Maintain routine monitoring within the 2–4 MOS policy band.";

    return {
      sku,
      description: latest.description,
      programme: latest.programme,
      location: latest.location,
      asOfDate,
      selectedReportPresent,
      latestRecordDate: latest.date,
      recordAgeDays,
      dataFreshness: recordAgeDays > 31 ? "stale" : selectedReportPresent ? "current" : "latest_prior_record",
      catalogueStatus: "active",
      stockOnHand: round(latest.stockOnHand, 2),
      ami: round(latest.ami, 2),
      mos: round(mos, 2),
      status,
      latestStockStatus,
      reportedStockout: latestStockStatus === "reported_stockout",
      forecastStatus: forecastEligible ? "valid" : "insufficient_data",
      forecastConfidence: !forecastEligible ? "insufficient" : recordAgeDays > 31 || accuracy.status !== "ok" ? "low" : (accuracy.wape ?? 1) <= 0.2 ? "high" : (accuracy.wape ?? 1) <= 0.5 ? "medium" : "low",
      daysOfSupply: round(daysOfSupply, 0),
      demandSource,
      forecastMonthlyDemand: round(monthlyDemand, 2),
      usageRates: {
        daily: round(dailyDemand, 2),
        weekly: round(Number.isFinite(dailyDemand) ? dailyDemand * 7 : null, 2),
        monthly: round(monthlyDemand, 2),
      },
      forecastRange: forecast.points[0] ? { lower: round(forecast.points[0].lower, 2), upper: round(forecast.points[0].upper, 2) } : null,
      forecast,
      balanceProjection,
      expectedStockoutDate,
      expectedStockoutBasis: "no_receipts",
      safetyStock: round(safetyStock, 0),
      reorderPoint: round(reorderPoint, 0),
      recommendedOrderQuantity: round(recommendedOrderQuantity, 0),
      turnoverRate: round(turnover, 2),
      stockoutFrequency: round(history.length ? stockoutObservations / history.length : null, 3),
      stockAgeDays,
      stagnant,
      unitCost,
      inventoryValue: round(inventoryValue, 2),
      annualCarryingCost: round(inventoryValue === null ? null : inventoryValue * config.annualCarryingCostRate, 2),
      forecastAccuracy: { status: accuracy.status, mae: round(accuracy.mae, 2), wape: round(accuracy.wape, 3), observations: accuracy.observations },
      historicalTrend: {
        stockOnHandChange: round(trendPercent(history.map((row) => row.stockOnHand)), 3),
        demandChange: round(trendPercent(demandSeries.map((point) => Number(point.value))), 3),
        seasonality: detectSeasonality(demandSeries),
      },
      observations: history.length,
      dataQualityFlags,
      action,
      modelBasis: {
        cutOffDate: asOfDate,
        historyStartDate: history[0].date,
        historyEndDate: latest.date,
        stockObservations: stockHistory.length,
        demandObservations: demandSeries.length,
        variables: movementSeries.length ? ["outbound issues", "stock on hand", "MOS"] : ["AMI proxy", "stock on hand", "MOS"],
      },
    };
  });

  items.forEach((item) => { item.priorityScore = priorityScore(item, asOfDate); });
  items.sort((a, b) => b.priorityScore - a.priorityScore || (a.mos ?? 99999) - (b.mos ?? 99999) || a.sku.localeCompare(b.sku));
  const summary = portfolioSummary(items, asOfDate);
  const demandProxyCount = items.filter((item) => item.demandSource === "ami_proxy").length;
  const humanSummary = `${summary.understocked} Central commodities are below 2 MOS, ${summary.overstocked} are above 4 MOS, and ${summary.excess} are above 12 MOS. ${summary.stockouts90Days} commodities would deplete within 90 days only if no stock arrives. Forecasts currently use AMI as a proxy for ${demandProxyCount} commodities; ${summary.demandUnavailable} commodities still lack enough demand data.`;
  return {
    generatedAt: new Date().toISOString(),
    asOfDate,
    location: config.location,
    policy: config.policy,
    methodology: {
      forecast: forecaster.name,
      demandPreference: ["outbound_movements", "ami_proxy"],
      leadTimeDays: config.leadTimeDays,
      reviewPeriodDays: config.reviewPeriodDays,
      serviceLevelZ: config.serviceLevelZ,
      seasonalPeriod: config.forecastSeasonalPeriod,
      reorderSafetyFactor: config.reorderSafetyFactor,
      annualCarryingCostRate: config.annualCarryingCostRate,
      note: "Demand forecasts use issue movements when available and AMI otherwise. Balance projections infer replenishment from observed SOH changes; no-receipts depletion dates are stress scenarios, not unconditional stockout predictions.",
    },
    summary,
    humanSummary,
    items,
  };
}
