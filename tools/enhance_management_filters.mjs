import { readFileSync, writeFileSync } from "node:fs";

const target = "index.html";
let html = readFileSync(target, "utf8");

if (html.includes('id="analyticsStream"') && html.includes("function analyticsItemsForDate(date)")) {
  console.log(JSON.stringify({ output: target, unchanged: true }, null, 2));
  process.exit(0);
}

function replaceRequired(search, replacement, label) {
  if (!search.test(html)) throw new Error(`Could not find ${label}.`);
  html = html.replace(search, replacement);
}

replaceRequired(
  /    \.analytics-controls \{ display: grid; grid-template-columns: [^}]+\}/,
  "    .analytics-controls { display: grid; grid-template-columns: minmax(220px, 1.2fr) repeat(4, minmax(140px, .7fr)) auto; gap: 8px; margin-bottom: 12px; }",
  "analytics controls CSS",
);

replaceRequired(
  /            <input id="analyticsSearch"[^\n]+\n            <select id="analyticsStatus"/,
  `            <input id="analyticsSearch" type="search" placeholder="Search SKU, commodity or programme" aria-label="Search management analytics">
            <select id="analyticsStream" aria-label="Filter by commodity stream"><option value="all">All streams</option><option value="EMMS">EM / medicines</option><option value="LAB">Laboratory</option></select>
            <select id="analyticsProgramme" aria-label="Filter by programme"><option value="all">All programmes</option></select>
            <select id="analyticsDate" aria-label="Select analytics report date"></select>
            <select id="analyticsStatus"`,
  "analytics controls markup",
);

replaceRequired(
  /analyticsSearch: "", analyticsStatus: "all" \};/,
  'analyticsSearch: "", analyticsStatus: "all", analyticsStream: "all", analyticsProgramme: "all", analyticsDate: "2026-07-15" };',
  "analytics state",
);

const functions = `    const analyticsDateCache = new Map();
    function analyticsNumber(value, digits = 0) {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Not available";
      return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
    }
    function analyticsDate(value) {
      if (!value) return "Not forecast";
      return new Date(value + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    }
    function analyticsPercent(value) {
      return value === null || value === undefined || !Number.isFinite(Number(value)) ? "Not available" : (Number(value) * 100).toFixed(1) + "%";
    }
    function analyticsStreamFor(item) {
      return item.code.startsWith("LAB") ? "LAB" : "EMMS";
    }
    function analyticsStatusFor(mos) {
      if (!Number.isFinite(mos)) return "data_gap";
      if (mos < 2) return "understocked";
      if (mos <= 4) return "adequate";
      if (mos > 12) return "excess";
      return "overstocked";
    }
    function analyticsAddDays(date, days) {
      const value = new Date(date + "T00:00:00Z");
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    }
    function analyticsAverage(values) {
      const clean = values.filter(Number.isFinite);
      return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
    }
    function analyticsStdDev(values) {
      const clean = values.filter(Number.isFinite);
      if (clean.length < 2) return 0;
      const mean = analyticsAverage(clean);
      return Math.sqrt(clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (clean.length - 1));
    }
    function analyticsTrend(values) {
      const clean = values.filter(Number.isFinite);
      return clean.length > 1 && clean[0] !== 0 ? (clean.at(-1) - clean[0]) / Math.abs(clean[0]) : null;
    }
    function analyticsItemsForDate(date) {
      if (analyticsDateCache.has(date)) return analyticsDateCache.get(date);
      const dates = reportDates.map(report => report.key).filter(reportDate => reportDate <= date);
      const items = stockData.flatMap(source => {
        const current = source.reports[date];
        if (!current?.present) return [];
        const history = dates.map(reportDate => ({ date: reportDate, ...source.reports[reportDate] })).filter(point => point.present);
        const demand = history.map(point => point.ami).filter(value => Number.isFinite(value) && value >= 0);
        let forecast = demand[0] ?? null;
        const errors = [];
        demand.slice(1).forEach(actual => {
          errors.push(actual - forecast);
          forecast = 0.35 * actual + 0.65 * forecast;
        });
        const monthlyDemand = Number.isFinite(forecast) ? forecast : Number.isFinite(current.ami) ? current.ami : null;
        const residual = analyticsStdDev(errors);
        const lower = Number.isFinite(monthlyDemand) ? Math.max(0, monthlyDemand - 1.96 * residual) : null;
        const upper = Number.isFinite(monthlyDemand) ? monthlyDemand + 1.96 * residual : null;
        const stockOnHand = Number.isFinite(current.soh) ? current.soh : null;
        const calculatedMos = stockOnHand !== null && monthlyDemand > 0 ? stockOnHand / monthlyDemand : null;
        const mos = Number.isFinite(current.mos) ? current.mos : calculatedMos;
        const status = analyticsStatusFor(mos);
        const dailyDemand = Number.isFinite(monthlyDemand) ? monthlyDemand / 30.4375 : null;
        const daysOfSupply = stockOnHand !== null && dailyDemand > 0 ? stockOnHand / dailyDemand : null;
        const demandDeviation = analyticsStdDev(demand);
        const safetyStock = Number.isFinite(monthlyDemand) ? 1.645 * demandDeviation * Math.sqrt(60 / 30.4375) : null;
        const reorderPoint = Number.isFinite(monthlyDemand) ? monthlyDemand * (60 / 30.4375) + (safetyStock || 0) : null;
        const recommendedOrderQuantity = Number.isFinite(monthlyDemand) && stockOnHand !== null ? Math.max(0, monthlyDemand * (4 + 30 / 30.4375) - stockOnHand) : null;
        const stockValues = history.map(point => point.soh).filter(Number.isFinite);
        const averageStock = analyticsAverage(stockValues);
        const turnoverRate = Number.isFinite(monthlyDemand) && averageStock > 0 ? monthlyDemand * 12 / averageStock : null;
        const stockoutFrequency = history.length ? history.filter(point => (Number.isFinite(point.soh) && point.soh <= 0) || (Number.isFinite(point.mos) && point.mos <= 0)).length / history.length : null;
        const wapeDenominator = demand.slice(1).reduce((sum, value) => sum + Math.abs(value), 0);
        const wape = errors.length && wapeDenominator ? errors.reduce((sum, value) => sum + Math.abs(value), 0) / wapeDenominator : null;
        const dataQualityFlags = [];
        if (stockOnHand === null) dataQualityFlags.push("missing_stock_on_hand");
        if (!demand.length) dataQualityFlags.push("missing_demand_signal");
        if (!Number.isFinite(current.mos) && Number.isFinite(calculatedMos)) dataQualityFlags.push("estimated_mos");
        const action = status === "understocked" ? "Expedite replenishment and verify pipeline or redistribution options."
          : status === "excess" ? "Stop or defer replenishment; review expiry exposure and redistribution."
            : status === "overstocked" ? "Review incoming orders and redistribute before stock becomes excess."
              : status === "data_gap" ? "Resolve AMI/MOS data gaps before a procurement decision."
                : "Maintain routine monitoring within the 2–4 MOS policy band.";
        let priorityScore = status === "understocked" ? 100 : status === "excess" ? 55 : status === "overstocked" ? 35 : 0;
        const expectedStockoutDate = Number.isFinite(daysOfSupply) ? analyticsAddDays(date, Math.max(0, Math.floor(daysOfSupply))) : null;
        if (expectedStockoutDate) {
          const days = Math.ceil((new Date(expectedStockoutDate + "T00:00:00Z") - new Date(date + "T00:00:00Z")) / 86400000);
          priorityScore += days <= 30 ? 80 : days <= 60 ? 50 : days <= 90 ? 25 : 0;
        }
        return [{
          sku: source.code, description: source.name, programme: source.programme, classification: source.classification,
          stream: analyticsStreamFor(source), location: "Central", asOfDate: date, stockOnHand, ami: current.ami,
          mos, status, daysOfSupply, forecastMonthlyDemand: monthlyDemand,
          usageRates: { daily: dailyDemand, weekly: Number.isFinite(dailyDemand) ? dailyDemand * 7 : null, monthly: monthlyDemand },
          forecastRange: Number.isFinite(monthlyDemand) ? { lower, upper } : null, expectedStockoutDate,
          safetyStock, reorderPoint, recommendedOrderQuantity, turnoverRate, stockoutFrequency,
          historicalTrend: { stockOnHandChange: analyticsTrend(stockValues), demandChange: analyticsTrend(demand), seasonality: { status: demand.length >= 24 ? "not_detected" : "insufficient_history" } },
          forecastAccuracy: { wape }, observations: history.length, dataQualityFlags, action, priorityScore,
        }];
      }).sort((a, b) => b.priorityScore - a.priorityScore || (a.mos ?? 99999) - (b.mos ?? 99999) || a.sku.localeCompare(b.sku));
      analyticsDateCache.set(date, items);
      return items;
    }
    function analyticsScopeItems(date = state.analyticsDate) {
      return analyticsItemsForDate(date).filter(item =>
        (state.analyticsStream === "all" || item.stream === state.analyticsStream) &&
        (state.analyticsProgramme === "all" || item.programme === state.analyticsProgramme));
    }
    function filteredAnalyticsItems() {
      const query = state.analyticsSearch.trim().toLowerCase();
      return analyticsScopeItems().filter(item => {
        const statusMatches = state.analyticsStatus === "all" || item.status === state.analyticsStatus;
        const queryMatches = !query || (item.sku + " " + item.description + " " + item.programme + " " + item.classification).toLowerCase().includes(query);
        return statusMatches && queryMatches;
      });
    }
    function analyticsSummary(items, date) {
      const summary = { understocked: 0, adequate: 0, overstocked: 0, excess: 0, data_gap: 0, stockouts90Days: 0, forecastableItems: 0, reorderUnits: 0 };
      const cutoff = analyticsAddDays(date, 90);
      items.forEach(item => {
        summary[item.status] += 1;
        if (Number.isFinite(item.forecastMonthlyDemand)) summary.forecastableItems += 1;
        if (item.expectedStockoutDate && item.expectedStockoutDate <= cutoff) summary.stockouts90Days += 1;
        summary.reorderUnits += item.recommendedOrderQuantity || 0;
      });
      return summary;
    }
    function setupAnalyticsControls() {
      const dateSelect = document.getElementById("analyticsDate");
      dateSelect.innerHTML = reportDates.slice().reverse().map(report => '<option value="' + report.key + '">As of ' + escapeHtml(report.label) + '</option>').join("");
      dateSelect.value = state.analyticsDate;
      const available = analyticsItemsForDate(state.analyticsDate).filter(item => state.analyticsStream === "all" || item.stream === state.analyticsStream);
      const programmes = [...new Set(available.map(item => item.programme))].sort();
      if (state.analyticsProgramme !== "all" && !programmes.includes(state.analyticsProgramme)) state.analyticsProgramme = "all";
      const programmeSelect = document.getElementById("analyticsProgramme");
      programmeSelect.innerHTML = '<option value="all">All programmes</option>' + programmes.map(programme => '<option value="' + escapeHtml(programme) + '">' + escapeHtml(programme) + '</option>').join("");
      programmeSelect.value = state.analyticsProgramme;
      document.getElementById("analyticsStream").value = state.analyticsStream;
    }
    function renderManagementAnalytics() {
      setupAnalyticsControls();
      const policy = analyticsReport.policy;
      const scopedItems = analyticsScopeItems();
      const summary = analyticsSummary(scopedItems, state.analyticsDate);
      const streamLabel = state.analyticsStream === "LAB" ? "Laboratory" : state.analyticsStream === "EMMS" ? "EM / medicines" : "all commodity streams";
      const scopeLabel = state.analyticsProgramme === "all" ? streamLabel : state.analyticsProgramme + " · " + streamLabel;
      document.getElementById("analyticsPolicy").innerHTML = "<b>Approved Central policy:</b> Understocked &lt; " + policy.understockMos + " MOS · Adequate " + policy.understockMos + "–" + policy.adequateMaxMos + " MOS · Overstocked &gt; " + policy.adequateMaxMos + " MOS · Excess &gt; " + policy.excessMos + " MOS. Analysis as of " + analyticsDate(state.analyticsDate) + ".";
      const cards = [["Understocked", summary.understocked, "Below 2 MOS"], ["Adequate", summary.adequate, "2–4 MOS"], ["Overstocked", summary.overstocked, "Above 4 MOS"], ["Excess", summary.excess, "Above 12 MOS"], ["Forecast stockouts", summary.stockouts90Days, summary.forecastableItems + " commodities forecastable"]];
      document.getElementById("analyticsKpis").innerHTML = cards.map(card => '<article class="analytics-kpi"><span>' + card[0] + '</span><strong>' + analyticsNumber(card[1]) + '</strong><small>' + card[2] + '</small></article>').join("");
      const dateIndex = reportDates.findIndex(report => report.key === state.analyticsDate);
      const previous = dateIndex > 0 ? reportDates[dateIndex - 1] : null;
      let comparison = "This is the earliest Central snapshot available.";
      if (previous) {
        const previousSummary = analyticsSummary(analyticsScopeItems(previous.key), previous.key);
        const underChange = summary.understocked - previousSummary.understocked;
        const excessChange = summary.excess - previousSummary.excess;
        const movement = (value) => value === 0 ? "unchanged" : value > 0 ? "increased by " + value : "decreased by " + Math.abs(value);
        comparison = "Compared with " + analyticsDate(previous.key) + ", understocked commodities " + movement(underChange) + " and excess commodities " + movement(excessChange) + ".";
      }
      document.getElementById("analyticsNarrative").innerHTML = "<b>Analyst view as of " + analyticsDate(state.analyticsDate) + "</b><br>For " + escapeHtml(scopeLabel) + ", " + scopedItems.length + " commodities were reported: " + summary.understocked + " understocked, " + summary.adequate + " adequate, " + summary.overstocked + " overstocked, " + summary.excess + " excess and " + summary.data_gap + " with data gaps. " + summary.stockouts90Days + " were projected to stock out within 90 days. " + comparison + " Quantified replenishment: " + analyticsNumber(summary.reorderUnits) + " units before pipeline and pack-size adjustments.";
      document.getElementById("analyticsMethod").innerHTML = "<b>Historical analytics</b><br>The selected date uses only Central snapshots available on or before that date. Simple exponential smoothing uses the historical AMI series and returns a 95% planning range. Programme and stream filters recalculate the narrative, KPIs and export.";
      const rows = filteredAnalyticsItems();
      document.getElementById("analyticsResultCount").textContent = rows.length + " commodities · as of " + analyticsDate(state.analyticsDate);
      document.getElementById("analyticsTableBody").innerHTML = rows.map(item => {
        const range = item.forecastRange ? analyticsNumber(item.forecastRange.lower) + "–" + analyticsNumber(item.forecastRange.upper) : "Not available";
        const quality = item.dataQualityFlags.length ? " · " + item.dataQualityFlags.join(", ").replaceAll("_", " ") : "";
        return '<tr><td class="product-cell"><strong>' + escapeHtml(item.sku + " — " + item.description) + '</strong><small>' + escapeHtml(item.programme) + ' · ' + escapeHtml(item.stream) + ' · ' + item.observations + ' observations' + escapeHtml(quality) + '</small></td>' +
          '<td><span class="analytics-status ' + item.status + '">' + escapeHtml(item.status.replace("_", " ")) + '</span></td><td>' + analyticsNumber(item.stockOnHand) + '</td>' +
          '<td><b>' + analyticsNumber(item.mos, 1) + ' MOS</b><br><small>' + analyticsNumber(item.daysOfSupply) + ' days</small></td><td><b>' + analyticsNumber(item.forecastMonthlyDemand) + '</b><br><small>95% range ' + range + '</small></td>' +
          '<td>' + analyticsDate(item.expectedStockoutDate) + '</td><td>' + analyticsNumber(item.reorderPoint) + '<br><small>Safety stock ' + analyticsNumber(item.safetyStock) + '</small></td><td><b>' + analyticsNumber(item.recommendedOrderQuantity) + '</b></td>' +
          '<td><b>SOH ' + analyticsPercent(item.historicalTrend.stockOnHandChange) + '</b><br><small>Stockouts ' + analyticsPercent(item.stockoutFrequency) + ' · Turnover ' + analyticsNumber(item.turnoverRate, 1) + ' · WAPE ' + analyticsPercent(item.forecastAccuracy.wape) + '</small></td><td>' + escapeHtml(item.action) + '</td></tr>';
      }).join("");
    }
    function exportManagementAnalytics() {
      const headers = ["As of date", "Stream", "SKU", "Commodity", "Programme", "Classification", "Location", "Status", "SOH", "MOS", "Days of supply", "Forecast monthly demand", "Forecast lower", "Forecast upper", "Expected stockout date", "Safety stock", "Reorder point", "Recommended order quantity", "Turnover rate", "Stockout frequency", "SOH change", "Forecast WAPE", "Action"];
      const lines = [headers, ...filteredAnalyticsItems().map(item => [state.analyticsDate, item.stream, item.sku, item.description, item.programme, item.classification, item.location, item.status, item.stockOnHand, item.mos, item.daysOfSupply, item.forecastMonthlyDemand, item.forecastRange?.lower, item.forecastRange?.upper, item.expectedStockoutDate, item.safetyStock, item.reorderPoint, item.recommendedOrderQuantity, item.turnoverRate, item.stockoutFrequency, item.historicalTrend.stockOnHandChange, item.forecastAccuracy.wape, item.action])].map(row => row.map(csvValue => '"' + String(csvValue ?? "").replaceAll('"', '""') + '"').join(","));
      const url = URL.createObjectURL(new Blob([lines.join("\\n")], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "zammsa-central-management-analytics-" + state.analyticsDate + ".csv";
      link.click();
      URL.revokeObjectURL(url);
    }
`;

replaceRequired(
  /    function analyticsNumber\(value, digits = 0\) \{.*?    function render\(\) \{ renderTable\(\); \}/s,
  functions + "    function render() { renderTable(); }",
  "management analytics functions",
);

replaceRequired(
  /    document\.getElementById\("analyticsSearch"\)\.addEventListener.*?    document\.getElementById\("analyticsExport"\)\.addEventListener\("click", exportManagementAnalytics\);/s,
  `    document.getElementById("analyticsSearch").addEventListener("input", event => { state.analyticsSearch = event.target.value; renderManagementAnalytics(); });
    document.getElementById("analyticsStream").addEventListener("change", event => { state.analyticsStream = event.target.value; state.analyticsProgramme = "all"; renderManagementAnalytics(); });
    document.getElementById("analyticsProgramme").addEventListener("change", event => { state.analyticsProgramme = event.target.value; renderManagementAnalytics(); });
    document.getElementById("analyticsDate").addEventListener("change", event => { state.analyticsDate = event.target.value; state.analyticsProgramme = "all"; renderManagementAnalytics(); });
    document.getElementById("analyticsStatus").addEventListener("change", event => { state.analyticsStatus = event.target.value; renderManagementAnalytics(); });
    document.getElementById("analyticsExport").addEventListener("click", exportManagementAnalytics);`,
  "analytics event listeners",
);

writeFileSync(target, html, "utf8");
console.log(JSON.stringify({ output: target, streams: ["EMMS", "LAB"], programmes: true, historicalDates: true }, null, 2));
