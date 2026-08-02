import { readFileSync, writeFileSync } from "node:fs";

let html = readFileSync("index.html", "utf8");

const oldConcerns = `        <section class="view" id="concerns" hidden>
          <div class="page-head"><div><p class="eyebrow">Management Concerns</p><h2>Action-oriented review register</h2><p>Use the Stock Navigator to verify individual items behind each concern before assigning programme actions.</p></div></div>
          <div class="overview-grid"><section class="panel"><div class="concern-list">
            <div class="concern"><b>Persistent stockouts and sub-two-month lines</b><span>Prioritise procurement, emergency redistribution and supplier follow-up for repeated low-MOS commodities.</span></div>
            <div class="concern"><b>Programme risk concentration</b><span>Review Anti-TB, Anti-Malarials, Reproductive Health, Anaesthetics, IV Fluids, Laboratory Services and Renal lines by programme office.</span></div>
            <div class="concern amber"><b>Extreme movement and forecast volatility</b><span>Validate sharp increases or decreases against receipts, issues, pipeline stock and reporting corrections.</span></div>
            <div class="concern gray"><b>Data quality</b><span>Assign ownership for missing AMI and TBD MOS completion in the next reporting cycle.</span></div>
          </div></section><section class="panel"><h3>Recommended meeting sequence</h3><p>1. Confirm stockout records and active pipeline.<br>2. Review critical lines below two MOS.<br>3. Validate major SOH movements since March.<br>4. Resolve AMI and TBD reporting gaps.<br>5. Record owner and due date for each action.</p><button class="reset" type="button" data-open-navigator>Open Stock Navigator</button></section></div>
        </section>`;

const newConcerns = `        <section class="view" id="concerns" hidden>
          <div class="page-head"><div><p class="eyebrow">Predictive Analysis</p><h2>Central stock forecasts and replenishment intelligence</h2><p>Review current stock, historical consumption signals, forecast stockout dates and quantified replenishment recommendations.</p></div></div>
          <div class="analytics-policy" id="analyticsPolicy"></div>
          <div class="analytics-kpis" id="analyticsKpis"></div>
          <div class="analytics-summary"><div class="analytics-note" id="analyticsNarrative"></div><div class="analytics-note warning" id="analyticsMethod"></div></div>
          <div class="analytics-controls">
            <input id="analyticsSearch" type="search" placeholder="Search SKU, commodity or programme" aria-label="Search predictive analysis">
            <select id="analyticsStatus" aria-label="Filter predictive analysis by stock status"><option value="all">All stock statuses</option><option value="understocked">Understocked</option><option value="adequate">Adequate</option><option value="overstocked">Overstocked</option><option value="excess">Excess</option><option value="data_gap">Data gap</option></select>
            <button class="reset" id="analyticsExport" type="button">Export analytical CSV</button>
          </div>
          <div class="table-shell"><div class="table-scroll"><table class="analytics-table"><thead><tr><th>Priority commodity</th><th>Status</th><th>Current SOH</th><th>MOS / DOS</th><th>Forecast monthly demand</th><th>Expected stockout</th><th>Reorder point</th><th>Recommended order</th><th>Historical signal</th><th>Management action</th></tr></thead><tbody id="analyticsTableBody"></tbody></table></div><div class="pagination"><span id="analyticsResultCount"></span><span>Central warehouse · forecast ranked by management priority</span></div></div>
        </section>`;

if (html.includes(oldConcerns)) html = html.replace(oldConcerns, newConcerns);
else if (!html.includes('id="analyticsKpis"')) {
  const concernsPattern = /        <section class="view" id="concerns" hidden>.*?        <\/section>\r?\n      <\/main>/s;
  if (!concernsPattern.test(html)) throw new Error("Could not replace Management Concerns markup.");
  html = html.replace(concernsPattern, `${newConcerns}\n      </main>`);
}

if (!html.includes("const analyticsReport =")) {
  html = html.replace("    const state =", "    const analyticsReport = null;\n    const state =");
}
if (!/<\/div>\r?\n        <\/section>\r?\n\r?\n        <section class="view" id="concerns" hidden>/.test(html)) {
  html = html.replace(
    /<\/div>\r?\n\r?\n        <section class="view" id="concerns" hidden>/,
    '</div>\n        </section>\n\n        <section class="view" id="concerns" hidden>',
  );
}
html = html.replace(
  /const state = \{([^\n]+)trendDate: "[^"]+" \};/,
  (match) => match.replace(" };", ', analyticsSearch: "", analyticsStatus: "all" };'),
);

if (!html.includes("function renderManagementAnalytics()")) {
  const functions = `    function analyticsNumber(value, digits = 0) {
      if (value === null || value === undefined) return "Not available";
      return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
    }
    function analyticsDate(value) {
      if (!value) return "Not forecast";
      return new Date(value + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    }
    function analyticsPercent(value) {
      return value === null || value === undefined ? "Not available" : (Number(value) * 100).toFixed(1) + "%";
    }
    function filteredAnalyticsItems() {
      const query = state.analyticsSearch.trim().toLowerCase();
      return analyticsReport.items.filter(item => {
        const statusMatches = state.analyticsStatus === "all" || item.status === state.analyticsStatus;
        const queryMatches = !query || (item.sku + " " + item.description + " " + item.programme).toLowerCase().includes(query);
        return statusMatches && queryMatches;
      });
    }
    function renderManagementAnalytics() {
      if (!analyticsReport) return;
      const policy = analyticsReport.policy;
      const summary = analyticsReport.summary;
      document.getElementById("analyticsPolicy").innerHTML = "<b>Approved Central policy:</b> Understocked &lt; " + policy.understockMos + " MOS · Adequate " + policy.understockMos + "–" + policy.adequateMaxMos + " MOS · Overstocked &gt; " + policy.adequateMaxMos + " MOS · Excess &gt; " + policy.excessMos + " MOS. Analysis as at " + analyticsDate(analyticsReport.asOfDate) + ".";
      const cards = [
        ["Understocked", summary.understocked, "Below 2 MOS"],
        ["Adequate", summary.adequate, "2–4 MOS"],
        ["Overstocked", summary.overstocked, "Above 4 MOS"],
        ["Excess", summary.excess, "Above 12 MOS"],
        ["Forecast stockouts", summary.stockouts90Days, summary.forecastableItems + " commodities forecastable"],
      ];
      document.getElementById("analyticsKpis").innerHTML = cards.map(card => '<article class="analytics-kpi"><span>' + card[0] + '</span><strong>' + analyticsNumber(card[1]) + '</strong><small>' + card[2] + '</small></article>').join("");
      document.getElementById("analyticsNarrative").innerHTML = "<b>Analyst summary</b><br>" + escapeHtml(analyticsReport.humanSummary) + " The quantified replenishment requirement is " + analyticsNumber(summary.reorderUnits) + " units before pack-size, pipeline and order-constraint adjustments.";
      document.getElementById("analyticsMethod").innerHTML = "<b>Forecast method</b><br>Simple exponential smoothing with confidence ranges. AMI is currently the Central demand proxy. Add transaction-level issues, lead times, pipeline receipts and the price list to improve forecast accuracy and financial quantification.";
      const rows = filteredAnalyticsItems();
      document.getElementById("analyticsResultCount").textContent = rows.length + " commodities";
      document.getElementById("analyticsTableBody").innerHTML = rows.map(item => {
        const range = item.forecastRange ? analyticsNumber(item.forecastRange.lower) + "–" + analyticsNumber(item.forecastRange.upper) : "Not available";
        const quality = item.dataQualityFlags.length ? " · " + item.dataQualityFlags.join(", ").replaceAll("_", " ") : "";
        return '<tr><td class="product-cell"><strong>' + escapeHtml(item.sku + " — " + item.description) + '</strong><small>' + escapeHtml(item.programme) + ' · ' + item.observations + ' observations' + escapeHtml(quality) + '</small></td>' +
          '<td><span class="analytics-status ' + item.status + '">' + escapeHtml(item.status.replace("_", " ")) + '</span></td>' +
          '<td>' + analyticsNumber(item.stockOnHand) + '</td>' +
          '<td><b>' + analyticsNumber(item.mos, 1) + ' MOS</b><br><small>' + analyticsNumber(item.daysOfSupply) + ' days</small></td>' +
          '<td><b>' + analyticsNumber(item.forecastMonthlyDemand) + '</b><br><small>95% range ' + range + '</small></td>' +
          '<td>' + analyticsDate(item.expectedStockoutDate) + '</td>' +
          '<td>' + analyticsNumber(item.reorderPoint) + '<br><small>Safety stock ' + analyticsNumber(item.safetyStock) + '</small></td>' +
          '<td><b>' + analyticsNumber(item.recommendedOrderQuantity) + '</b></td>' +
          '<td><b>SOH ' + analyticsPercent(item.historicalTrend.stockOnHandChange) + '</b><br><small>Stockouts ' + analyticsPercent(item.stockoutFrequency) + ' · Turnover ' + analyticsNumber(item.turnoverRate, 1) + ' · WAPE ' + analyticsPercent(item.forecastAccuracy.wape) + '</small></td>' +
          '<td>' + escapeHtml(item.action) + '</td></tr>';
      }).join("");
    }
    function exportManagementAnalytics() {
      const headers = ["SKU", "Commodity", "Programme", "Location", "Status", "SOH", "MOS", "Days of supply", "Daily usage", "Weekly usage", "Forecast monthly demand", "Forecast lower", "Forecast upper", "Expected stockout date", "Stock age days", "Stagnant", "Safety stock", "Reorder point", "Recommended order quantity", "Turnover rate", "Stockout frequency", "SOH change", "Demand change", "Seasonality status", "Forecast WAPE", "Action"];
      const lines = [headers, ...filteredAnalyticsItems().map(item => [item.sku, item.description, item.programme, item.location, item.status, item.stockOnHand, item.mos, item.daysOfSupply, item.usageRates.daily, item.usageRates.weekly, item.forecastMonthlyDemand, item.forecastRange?.lower, item.forecastRange?.upper, item.expectedStockoutDate, item.stockAgeDays, item.stagnant, item.safetyStock, item.reorderPoint, item.recommendedOrderQuantity, item.turnoverRate, item.stockoutFrequency, item.historicalTrend.stockOnHandChange, item.historicalTrend.demandChange, item.historicalTrend.seasonality.status, item.forecastAccuracy.wape, item.action])]
        .map(row => row.map(csvValue => '"' + String(csvValue ?? "").replaceAll('"', '""') + '"').join(","));
      const url = URL.createObjectURL(new Blob([lines.join("\\n")], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "zammsa-central-management-analytics-" + analyticsReport.asOfDate + ".csv";
      link.click();
      URL.revokeObjectURL(url);
    }
`;
  html = html.replace("    function render() { renderTable(); }", functions + "    function render() { renderTable(); }");
}

html = html.replace(
  '        if (id === "stockTrend") renderStockTrend();',
  '        if (id === "stockTrend") renderStockTrend();\n        if (id === "concerns") renderManagementAnalytics();',
);
html = html.replace(/(?:        if \(id === "concerns"\) renderManagementAnalytics\(\);\r?\n)+/g, '        if (id === "concerns") renderManagementAnalytics();\n');
if (!html.includes("window.scrollTo(0, 0);")) {
  html = html.replace(
    /        document\.getElementById\("sidebar"\)\.classList\.remove\("open"\);\r?\n        if \(id === "availabilityChanges"\)/,
    '        document.getElementById("sidebar").classList.remove("open");\n        window.scrollTo(0, 0);\n        if (id === "availabilityChanges")',
  );
}

if (!html.includes('document.getElementById("analyticsSearch").addEventListener')) {
  html = html.replace(
    '    document.getElementById("trendDate").addEventListener("change", event => { state.trendDate = event.target.value; state.trendProduct = ""; renderStockTrend(); });',
    '    document.getElementById("trendDate").addEventListener("change", event => { state.trendDate = event.target.value; state.trendProduct = ""; renderStockTrend(); });\n    document.getElementById("analyticsSearch").addEventListener("input", event => { state.analyticsSearch = event.target.value; renderManagementAnalytics(); });\n    document.getElementById("analyticsStatus").addEventListener("change", event => { state.analyticsStatus = event.target.value; renderManagementAnalytics(); });\n    document.getElementById("analyticsExport").addEventListener("click", exportManagementAnalytics);',
  );
}

html = html.replace("    renderStockTrend();\n    render();", "    renderStockTrend();\n    renderManagementAnalytics();\n    render();");

if (!html.includes(".analytics-summary { grid-template-columns: 1fr; }")) {
  html = html.replace(
    "      .stock-trend-controls, .stock-trend-summary, .stock-trend-grid, .stock-trend-lower { grid-template-columns: 1fr; }",
    "      .stock-trend-controls, .stock-trend-summary, .stock-trend-grid, .stock-trend-lower { grid-template-columns: 1fr; }\n      .analytics-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n      .analytics-summary { grid-template-columns: 1fr; }",
  );
  html = html.replace(
    "      .stock-consumption-chart, .expiry-risk-trend { grid-template-columns: 1fr; }",
    "      .stock-consumption-chart, .expiry-risk-trend { grid-template-columns: 1fr; }\n      .analytics-kpis, .analytics-controls { grid-template-columns: 1fr; }\n      .analytics-kpi { border-right: 0; border-bottom: 1px solid var(--border); }",
  );
}
if (!html.includes(".analytics-table { min-width: 1380px; }")) {
  html = html.replace(
    "    .analytics-table td { vertical-align: top; }",
    "    .analytics-table { min-width: 1380px; }\n    .analytics-table th { white-space: nowrap; }\n    .analytics-table td { vertical-align: top; }",
  );
}
html = html.replace(
  "<th>Recommended order</th><th>Management action</th>",
  "<th>Recommended order</th><th>Historical signal</th><th>Management action</th>",
);
if (!html.includes("function analyticsPercent(value)")) {
  html = html.replace(
    "    function filteredAnalyticsItems() {",
    "    function analyticsPercent(value) {\n      return value === null || value === undefined ? \"Not available\" : (Number(value) * 100).toFixed(1) + \"%\";\n    }\n    function filteredAnalyticsItems() {",
  );
}
html = html.replace(
  '["Forecast stockouts", summary.stockouts90Days, "Within 90 days"]',
  '["Forecast stockouts", summary.stockouts90Days, summary.forecastableItems + " commodities forecastable"]',
);
if (!html.includes("item.historicalTrend.stockOnHandChange")) {
  html = html.replace(
    /          '<td><b>' \+ analyticsNumber\(item\.recommendedOrderQuantity\) \+ '<\/b><\/td>' \+\r?\n          '<td>' \+ escapeHtml\(item\.action\)/,
    "          '<td><b>' + analyticsNumber(item.recommendedOrderQuantity) + '</b></td>' +\n          '<td><b>SOH ' + analyticsPercent(item.historicalTrend.stockOnHandChange) + '</b><br><small>Stockouts ' + analyticsPercent(item.stockoutFrequency) + ' · Turnover ' + analyticsNumber(item.turnoverRate, 1) + ' · WAPE ' + analyticsPercent(item.forecastAccuracy.wape) + '</small></td>' +\n          '<td>' + escapeHtml(item.action)",
  );
}
html = html.replace(
  '      const headers = ["SKU", "Commodity", "Programme", "Location", "Status", "SOH", "MOS", "Days of supply", "Forecast monthly demand", "Forecast lower", "Forecast upper", "Expected stockout date", "Safety stock", "Reorder point", "Recommended order quantity", "Turnover rate", "Forecast WAPE", "Action"];',
  '      const headers = ["SKU", "Commodity", "Programme", "Location", "Status", "SOH", "MOS", "Days of supply", "Daily usage", "Weekly usage", "Forecast monthly demand", "Forecast lower", "Forecast upper", "Expected stockout date", "Stock age days", "Stagnant", "Safety stock", "Reorder point", "Recommended order quantity", "Turnover rate", "Stockout frequency", "SOH change", "Demand change", "Seasonality status", "Forecast WAPE", "Action"];',
);
html = html.replace(
  '      const lines = [headers, ...filteredAnalyticsItems().map(item => [item.sku, item.description, item.programme, item.location, item.status, item.stockOnHand, item.mos, item.daysOfSupply, item.forecastMonthlyDemand, item.forecastRange?.lower, item.forecastRange?.upper, item.expectedStockoutDate, item.safetyStock, item.reorderPoint, item.recommendedOrderQuantity, item.turnoverRate, item.forecastAccuracy.wape, item.action])]',
  '      const lines = [headers, ...filteredAnalyticsItems().map(item => [item.sku, item.description, item.programme, item.location, item.status, item.stockOnHand, item.mos, item.daysOfSupply, item.usageRates.daily, item.usageRates.weekly, item.forecastMonthlyDemand, item.forecastRange?.lower, item.forecastRange?.upper, item.expectedStockoutDate, item.stockAgeDays, item.stagnant, item.safetyStock, item.reorderPoint, item.recommendedOrderQuantity, item.turnoverRate, item.stockoutFrequency, item.historicalTrend.stockOnHandChange, item.historicalTrend.demandChange, item.historicalTrend.seasonality.status, item.forecastAccuracy.wape, item.action])]',
);

html = html
  .replace('<button data-target="concerns"><span class="nav-icon">05</span> Management Concerns</button>', '<button data-target="concerns"><span class="nav-icon">05</span> Predictive Analysis</button>')
  .replace('<p class="eyebrow">Management Analytics</p><h2>Central stock intelligence, forecast and quantification</h2>', '<p class="eyebrow">Predictive Analysis</p><h2>Central stock forecasts and replenishment intelligence</h2>')
  .replace('aria-label="Search management analytics"', 'aria-label="Search predictive analysis"')
  .replace('aria-label="Filter management analytics by stock status"', 'aria-label="Filter predictive analysis by stock status"')
  .replace('concerns: "Management Concerns"', 'concerns: "Predictive Analysis"');

writeFileSync("index.html", html, "utf8");
console.log(JSON.stringify({ output: "index.html", managementAnalytics: true }, null, 2));
