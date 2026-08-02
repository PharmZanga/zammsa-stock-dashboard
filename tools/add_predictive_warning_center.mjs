import { readFileSync, writeFileSync } from "node:fs";

let html = readFileSync("index.html", "utf8");

if (!html.includes(".warning-card")) {
  html = html.replace(
    "    .analytics-kpi small { color: var(--muted); font-size: 10px; }",
    `    .analytics-kpi small { color: var(--muted); font-size: 10px; }
    .warning-card { appearance: none; border: 0; border-right: 1px solid var(--border); background: #fff; padding: 15px 14px; text-align: left; cursor: pointer; }
    .warning-card:last-child { border-right: 0; }
    .warning-card:hover, .warning-card.active { background: #edf7f1; box-shadow: inset 0 -4px 0 var(--green); }
    .warning-card.critical strong, .warning-card.days30 strong { color: #a1261c; }
    .warning-card.days60 strong { color: #a85f00; }
    .warning-card.days90 strong { color: #805d00; }
    .warning-card.data strong { color: #56645f; }
    .warning-card span, .warning-card small { display: block; color: var(--muted); }
    .warning-card span { font-size: 11px; font-weight: 750; }
    .warning-card strong { display: block; margin: 5px 0 2px; font-size: 24px; }
    .warning-card small { font-size: 10px; }
    .warning-product { border: 0; background: transparent; padding: 0; color: #0d5e40; text-align: left; cursor: pointer; font: inherit; font-weight: 800; }
    .warning-product:hover { text-decoration: underline; }
    .warning-detail { position: fixed; z-index: 80; inset: 0 0 0 auto; width: min(620px, 94vw); overflow-y: auto; background: #f7faf8; border-left: 1px solid #9eb6ad; box-shadow: -18px 0 45px rgba(7, 38, 27, .24); padding: 22px; }
    .warning-detail[hidden] { display: none; }
    .warning-detail-head { display: flex; justify-content: space-between; gap: 16px; align-items: start; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
    .warning-detail-head h3 { margin: 4px 0; font-size: 21px; }
    .warning-detail-close { border: 1px solid #9eb6ad; background: #fff; padding: 8px 12px; cursor: pointer; }
    .warning-detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 14px 0; border: 1px solid var(--border); background: #fff; }
    .warning-detail-grid article { padding: 12px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .warning-detail-grid span, .warning-detail-grid small { display: block; color: var(--muted); font-size: 10px; }
    .warning-detail-grid strong { display: block; margin: 4px 0; font-size: 18px; }
    .warning-chart { display: flex; align-items: end; gap: 8px; min-height: 180px; padding: 16px; border: 1px solid var(--border); background: #fff; }
    .warning-chart-point { flex: 1; min-width: 32px; display: grid; align-items: end; gap: 5px; text-align: center; }
    .warning-chart-bar { min-height: 3px; background: var(--green); }
    .warning-chart-point.forecast .warning-chart-bar { background: #bf7a00; }
    .warning-chart-point b { font-size: 10px; }
    .warning-chart-point small { color: var(--muted); font-size: 9px; }
    .warning-action { margin-top: 14px; padding: 14px; border-left: 4px solid #b22b20; background: #fff; line-height: 1.5; }`,
  );
}

if (!html.includes('id="predictiveWarningDetail"')) {
  html = html.replace(
    "          <div class=\"table-shell\"><div class=\"table-scroll\"><table class=\"analytics-table\">",
    `          <div class="table-shell"><div class="table-scroll"><table class="analytics-table">`,
  );
  html = html.replace(
    "          <div class=\"table-shell\"><div class=\"table-scroll\"><table class=\"analytics-table\"><thead><tr><th>Priority commodity</th><th>Status</th><th>Current SOH</th><th>MOS / DOS</th><th>Forecast monthly demand</th><th>Expected stockout</th><th>Reorder point</th><th>Recommended order</th><th>Historical signal</th><th>Management action</th></tr></thead><tbody id=\"analyticsTableBody\"></tbody></table></div><div class=\"pagination\"><span id=\"analyticsResultCount\"></span><span>Central warehouse · forecast ranked by management priority</span></div></div>\n        </section>",
    `          <div class="table-shell"><div class="table-scroll"><table class="analytics-table"><thead><tr><th>Priority commodity</th><th>Status</th><th>Current SOH</th><th>MOS / DOS</th><th>Forecast monthly demand</th><th>Expected stockout</th><th>Reorder point</th><th>Recommended order</th><th>Historical signal</th><th>Management action</th></tr></thead><tbody id="analyticsTableBody"></tbody></table></div><div class="pagination"><span id="analyticsResultCount"></span><span>Central warehouse · forecast ranked by management priority</span></div></div>
          <aside class="warning-detail" id="predictiveWarningDetail" hidden aria-label="Commodity forecast warning detail"></aside>
        </section>`,
  );
}

html = html.replace(
  'analyticsDate: "2026-07-15" };',
  'analyticsDate: "2026-07-15", analyticsHorizon: "all" };',
);

html = html.replace(
  `        return statusMatches && queryMatches;
      });
    }
    function analyticsSummary(items, date) {`,
  `        const horizonMatches = state.analyticsHorizon === "all" || analyticsHorizonFor(item, state.analyticsDate) === state.analyticsHorizon;
        return statusMatches && queryMatches && horizonMatches;
      });
    }
    function analyticsDaysUntil(date, target) {
      if (!target) return null;
      return Math.floor((new Date(target + "T00:00:00Z") - new Date(date + "T00:00:00Z")) / 86400000);
    }
    function analyticsHorizonFor(item, date) {
      if (item.status === "data_gap" || !Number.isFinite(item.forecastMonthlyDemand)) return "data";
      const days = analyticsDaysUntil(date, item.expectedStockoutDate);
      if (days === null) return "stable";
      if (days <= 0 || Number(item.stockOnHand) <= 0) return "now";
      if (days <= 30) return "days30";
      if (days <= 60) return "days60";
      if (days <= 90) return "days90";
      return "stable";
    }
    function analyticsSummary(items, date) {`,
);

html = html.replace(
  `      const summary = { understocked: 0, adequate: 0, overstocked: 0, excess: 0, data_gap: 0, stockouts90Days: 0, forecastableItems: 0, reorderUnits: 0 };`,
  `      const summary = { understocked: 0, adequate: 0, overstocked: 0, excess: 0, data_gap: 0, stockouts90Days: 0, forecastableItems: 0, reorderUnits: 0, now: 0, days30: 0, days60: 0, days90: 0, data: 0 };`,
);
html = html.replace(
  `        if (item.expectedStockoutDate && item.expectedStockoutDate <= cutoff) summary.stockouts90Days += 1;
        summary.reorderUnits += item.recommendedOrderQuantity || 0;`,
  `        if (item.expectedStockoutDate && item.expectedStockoutDate <= cutoff) summary.stockouts90Days += 1;
        const horizon = analyticsHorizonFor(item, date);
        if (Object.hasOwn(summary, horizon)) summary[horizon] += 1;
        summary.reorderUnits += item.recommendedOrderQuantity || 0;`,
);

html = html.replace(
  `      const cards = [["Understocked", summary.understocked, "Below 2 MOS"], ["Adequate", summary.adequate, "2–4 MOS"], ["Overstocked", summary.overstocked, "Above 4 MOS"], ["Excess", summary.excess, "Above 12 MOS"], ["Forecast stockouts", summary.stockouts90Days, summary.forecastableItems + " commodities forecastable"]];
      document.getElementById("analyticsKpis").innerHTML = cards.map(card => '<article class="analytics-kpi"><span>' + card[0] + '</span><strong>' + analyticsNumber(card[1]) + '</strong><small>' + card[2] + '</small></article>').join("");`,
  `      const cards = [["Critical now", summary.now, "Stocked out or due now", "now", "critical"], ["0–30 days", summary.days30, "Immediate intervention", "days30", "days30"], ["31–60 days", summary.days60, "Confirm pipeline", "days60", "days60"], ["61–90 days", summary.days90, "Plan replenishment", "days90", "days90"], ["Data warnings", summary.data, "Forecast cannot be trusted", "data", "data"]];
      document.getElementById("analyticsKpis").innerHTML = cards.map(card => '<button type="button" class="warning-card ' + card[4] + (state.analyticsHorizon === card[3] ? ' active' : '') + '" data-horizon="' + card[3] + '"><span>' + card[0] + '</span><strong>' + analyticsNumber(card[1]) + '</strong><small>' + card[2] + '</small></button>').join("");`,
);

html = html.replace(
  `return '<tr><td class="product-cell"><strong>' + escapeHtml(item.sku + " — " + item.description) + '</strong><small>'`,
  `return '<tr><td class="product-cell"><button type="button" class="warning-product" data-warning-sku="' + escapeHtml(item.sku) + '">' + escapeHtml(item.sku + " — " + item.description) + '</button><small>'`,
);

if (!html.includes("function openPredictiveWarning")) {
  html = html.replace(
    "    function exportManagementAnalytics() {",
    `    function openPredictiveWarning(sku) {
      const item = analyticsItemsForDate(state.analyticsDate).find(row => row.sku === sku);
      if (!item) return;
      const source = stockData.find(row => row.code === sku);
      const history = reportDates.filter(report => report.key <= state.analyticsDate).map(report => ({ label: report.short, value: source?.reports?.[report.key]?.soh ?? null, forecast: false })).filter(point => Number.isFinite(point.value));
      const forecast = (item.forecast?.points || []).map((point, index) => ({ label: "F" + (index + 1), value: Math.max(0, Number(item.stockOnHand || 0) - Number(point.value || 0) * (index + 1)), forecast: true }));
      const points = [...history, ...forecast];
      const maximum = Math.max(...points.map(point => point.value), 1);
      const horizon = analyticsHorizonFor(item, state.analyticsDate);
      const confidence = item.forecastAccuracy?.status !== "ok" || item.observations < 3 ? "Low" : (item.forecastAccuracy?.wape ?? 1) <= .2 ? "High" : "Medium";
      const panel = document.getElementById("predictiveWarningDetail");
      panel.innerHTML = '<div class="warning-detail-head"><div><span class="analytics-status ' + item.status + '">' + escapeHtml(horizon.replace("days", " days")) + '</span><h3>' + escapeHtml(item.sku + " — " + item.description) + '</h3><small>' + escapeHtml(item.programme + " · " + item.stream) + '</small></div><button class="warning-detail-close" id="predictiveWarningClose" type="button">Close</button></div>' +
        '<div class="warning-detail-grid"><article><span>Current stock</span><strong>' + analyticsNumber(item.stockOnHand) + '</strong><small>Central SOH</small></article><article><span>Days of supply</span><strong>' + analyticsNumber(item.daysOfSupply) + '</strong><small>' + analyticsNumber(item.mos, 1) + ' MOS</small></article><article><span>Forecast stockout</span><strong>' + analyticsDate(item.expectedStockoutDate) + '</strong><small>' + confidence + ' confidence</small></article><article><span>Monthly demand</span><strong>' + analyticsNumber(item.forecastMonthlyDemand) + '</strong><small>AMI forecast</small></article><article><span>Reorder point</span><strong>' + analyticsNumber(item.reorderPoint) + '</strong><small>Safety stock ' + analyticsNumber(item.safetyStock) + '</small></article><article><span>Recommended order</span><strong>' + analyticsNumber(item.recommendedOrderQuantity) + '</strong><small>Before pipeline adjustment</small></article></div>' +
        '<h4>Stock history and three-month projection</h4><div class="warning-chart">' + points.map(point => '<div class="warning-chart-point' + (point.forecast ? ' forecast' : '') + '"><div class="warning-chart-bar" style="height:' + Math.max(3, Math.round(point.value / maximum * 130)) + 'px"></div><b>' + analyticsNumber(point.value) + '</b><small>' + escapeHtml(point.label) + '</small></div>').join("") + '</div>' +
        '<div class="warning-action"><b>Recommended action</b><br>' + escapeHtml(item.action) + '<br><small>Forecast confidence: ' + confidence + ' · ' + item.observations + ' historical observations · 95% monthly demand range ' + analyticsNumber(item.forecastRange?.lower) + '–' + analyticsNumber(item.forecastRange?.upper) + '.</small></div>';
      panel.hidden = false;
      document.getElementById("predictiveWarningClose").focus();
    }
    function closePredictiveWarning() {
      document.getElementById("predictiveWarningDetail").hidden = true;
    }
    function exportManagementAnalytics() {`,
  );
}

if (!html.includes(".scenario-panel")) {
  html = html.replace(
    "    .warning-action { margin-top: 14px; padding: 14px; border-left: 4px solid #b22b20; background: #fff; line-height: 1.5; }",
    `    .warning-action { margin-top: 14px; padding: 14px; border-left: 4px solid #b22b20; background: #fff; line-height: 1.5; }
    .scenario-panel { margin-top: 16px; padding: 16px; border: 1px solid #9eb6ad; background: #fff; }
    .scenario-panel h4 { margin: 0 0 4px; }
    .scenario-panel > p { margin: 0 0 14px; color: var(--muted); font-size: 11px; }
    .scenario-inputs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .scenario-inputs label { display: grid; gap: 5px; color: var(--muted); font-size: 10px; font-weight: 750; }
    .scenario-inputs input, .scenario-inputs select { width: 100%; border: 1px solid #9eb6ad; background: #fff; padding: 9px; color: var(--ink); }
    .scenario-results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; border: 1px solid var(--border); }
    .scenario-results article { padding: 11px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .scenario-results span, .scenario-results small { display: block; color: var(--muted); font-size: 10px; }
    .scenario-results strong { display: block; margin: 3px 0; font-size: 17px; }
    .scenario-verdict { margin-top: 12px; padding: 12px; border-left: 4px solid #bf7a00; background: #f7faf8; line-height: 1.45; }
    .scenario-verdict.critical { border-left-color: #b22b20; background: #fff1ef; }
    .scenario-verdict.safe { border-left-color: var(--green); background: #edf7f1; }
    @media (max-width: 520px) { .scenario-inputs, .scenario-results { grid-template-columns: 1fr; } }`,
  );
}

if (!html.includes('id="predictiveScenario"')) {
  html = html.replace(
    `'<div class="warning-action"><b>Recommended action</b><br>' + escapeHtml(item.action) + '<br><small>Forecast confidence: ' + confidence + ' · ' + item.observations + ' historical observations · 95% monthly demand range ' + analyticsNumber(item.forecastRange?.lower) + '–' + analyticsNumber(item.forecastRange?.upper) + '.</small></div>';`,
    `'<div class="warning-action"><b>Recommended action</b><br>' + escapeHtml(item.action) + '<br><small>Forecast confidence: ' + confidence + ' · ' + item.observations + ' historical observations · 95% monthly demand range ' + analyticsNumber(item.forecastRange?.lower) + '–' + analyticsNumber(item.forecastRange?.upper) + '.</small></div>' +
        '<section class="scenario-panel" id="predictiveScenario" data-sku="' + escapeHtml(item.sku) + '"><h4>Stage 2 · Scenario simulator</h4><p>Test a demand change and a planned delivery before committing an order. Pipeline quantity is a manual scenario until confirmed shipment data is connected.</p><div class="scenario-inputs">' +
        '<label>Demand change (%)<input id="scenarioDemand" type="number" min="-80" max="200" step="5" value="0"></label>' +
        '<label>Pipeline quantity<input id="scenarioPipeline" type="number" min="0" step="1" value="0"></label>' +
        '<label>Delivery delay (days)<input id="scenarioDelay" type="number" min="0" max="365" step="1" value="30"></label>' +
        '<label>Target stock level<select id="scenarioTarget"><option value="3">3 MOS</option><option value="6">6 MOS</option><option value="9">9 MOS</option><option value="12">12 MOS</option></select></label></div>' +
        '<div id="scenarioResults"></div></section>';`,
  );
  html = html.replace(
    `      panel.hidden = false;
      document.getElementById("predictiveWarningClose").focus();`,
    `      panel.hidden = false;
      calculatePredictiveScenario();
      document.getElementById("predictiveWarningClose").focus();`,
  );
}

if (!html.includes("function calculatePredictiveScenario")) {
  html = html.replace(
    "    function closePredictiveWarning() {",
    `    function calculatePredictiveScenario() {
      const scenario = document.getElementById("predictiveScenario");
      const results = document.getElementById("scenarioResults");
      if (!scenario || !results) return;
      const item = analyticsItemsForDate(state.analyticsDate).find(row => row.sku === scenario.dataset.sku);
      if (!item || !Number.isFinite(item.forecastMonthlyDemand) || item.forecastMonthlyDemand <= 0) {
        results.innerHTML = '<div class="scenario-verdict critical"><b>Scenario unavailable</b><br>A usable demand forecast is required before pipeline timing can be simulated.</div>';
        return;
      }
      const demandChange = Math.max(-80, Math.min(200, Number(document.getElementById("scenarioDemand").value) || 0));
      const pipeline = Math.max(0, Number(document.getElementById("scenarioPipeline").value) || 0);
      const delay = Math.max(0, Number(document.getElementById("scenarioDelay").value) || 0);
      const targetMos = Math.max(1, Number(document.getElementById("scenarioTarget").value) || 3);
      const monthlyDemand = item.forecastMonthlyDemand * (1 + demandChange / 100);
      const dailyDemand = monthlyDemand / 30.4375;
      const currentStock = Math.max(0, Number(item.stockOnHand) || 0);
      const daysWithoutPipeline = currentStock / dailyDemand;
      const pipelineArrivesInTime = pipeline > 0 && delay < daysWithoutPipeline;
      const stockAtArrival = Math.max(0, currentStock - dailyDemand * delay);
      const usablePipeline = pipelineArrivesInTime ? pipeline : 0;
      const projectedDays = pipelineArrivesInTime ? delay + (stockAtArrival + pipeline) / dailyDemand : daysWithoutPipeline;
      const stockoutDate = new Date(state.analyticsDate + "T00:00:00Z");
      stockoutDate.setUTCDate(stockoutDate.getUTCDate() + Math.max(0, Math.floor(projectedDays)));
      const targetUnits = monthlyDemand * targetMos;
      const recommendedOrder = Math.max(0, Math.ceil(targetUnits - currentStock - usablePipeline));
      const arrivalGap = Math.floor(daysWithoutPipeline - delay);
      const risk = daysWithoutPipeline <= 0 ? "critical" : !pipelineArrivesInTime && delay >= daysWithoutPipeline ? "critical" : projectedDays <= 30 ? "critical" : projectedDays <= 90 ? "watch" : "safe";
      let action = recommendedOrder > 0 ? "Order " + analyticsNumber(recommendedOrder) + " units to reach " + targetMos + " MOS under this scenario." : "No additional order is indicated for the selected target.";
      if (pipeline > 0 && !pipelineArrivesInTime) action = "Expedite the planned delivery: stock is projected to run out " + Math.abs(arrivalGap) + " days before arrival. " + action;
      else if (pipelineArrivesInTime) action = "The pipeline arrives with approximately " + analyticsNumber(stockAtArrival) + " units remaining. " + action;
      results.innerHTML = '<div class="scenario-results"><article><span>Adjusted monthly demand</span><strong>' + analyticsNumber(monthlyDemand) + '</strong><small>' + (demandChange >= 0 ? '+' : '') + demandChange + '% scenario</small></article>' +
        '<article><span>Stock at delivery</span><strong>' + analyticsNumber(stockAtArrival) + '</strong><small>' + (pipelineArrivesInTime ? 'Delivery arrives before stockout' : pipeline > 0 ? 'Delivery may arrive too late' : 'No pipeline entered') + '</small></article>' +
        '<article><span>Projected stockout</span><strong>' + analyticsDate(stockoutDate.toISOString().slice(0, 10)) + '</strong><small>' + analyticsNumber(projectedDays) + ' days of cover</small></article>' +
        '<article><span>Scenario order quantity</span><strong>' + analyticsNumber(recommendedOrder) + '</strong><small>Target ' + targetMos + ' MOS</small></article></div>' +
        '<div class="scenario-verdict ' + risk + '"><b>' + (risk === "critical" ? "Intervention required" : risk === "watch" ? "Watch closely" : "Scenario is covered") + '</b><br>' + escapeHtml(action) + '</div>';
    }
    function closePredictiveWarning() {`,
  );
}

if (!html.includes('event.target.closest("#predictiveScenario")')) {
  html = html.replace(
    `    document.getElementById("predictiveWarningDetail").addEventListener("click", event => { if (event.target.id === "predictiveWarningClose") closePredictiveWarning(); });`,
    `    document.getElementById("predictiveWarningDetail").addEventListener("click", event => { if (event.target.id === "predictiveWarningClose") closePredictiveWarning(); });
    document.getElementById("predictiveWarningDetail").addEventListener("input", event => { if (event.target.closest("#predictiveScenario")) calculatePredictiveScenario(); });
    document.getElementById("predictiveWarningDetail").addEventListener("change", event => { if (event.target.closest("#predictiveScenario")) calculatePredictiveScenario(); });`,
  );
}

if (!html.includes('document.getElementById("analyticsKpis").addEventListener')) {
  html = html.replace(
    `    document.getElementById("analyticsSearch").addEventListener("input", event => { state.analyticsSearch = event.target.value; renderManagementAnalytics(); });`,
    `    document.getElementById("analyticsKpis").addEventListener("click", event => { const card = event.target.closest("[data-horizon]"); if (!card) return; state.analyticsHorizon = state.analyticsHorizon === card.dataset.horizon ? "all" : card.dataset.horizon; renderManagementAnalytics(); });
    document.getElementById("analyticsTableBody").addEventListener("click", event => { const product = event.target.closest("[data-warning-sku]"); if (product) openPredictiveWarning(product.dataset.warningSku); });
    document.getElementById("predictiveWarningDetail").addEventListener("click", event => { if (event.target.id === "predictiveWarningClose") closePredictiveWarning(); });
    document.getElementById("analyticsSearch").addEventListener("input", event => { state.analyticsSearch = event.target.value; renderManagementAnalytics(); });`,
  );
}

if (!html.includes("function analyticsHorizonFor")) {
  html = html.replace(
    "    function analyticsSummary(items, date) {",
    `    function analyticsDaysUntil(date, target) {
      if (!target) return null;
      return Math.floor((new Date(target + "T00:00:00Z") - new Date(date + "T00:00:00Z")) / 86400000);
    }
    function analyticsHorizonFor(item, date) {
      if (item.status === "data_gap" || !Number.isFinite(item.forecastMonthlyDemand)) return "data";
      const days = analyticsDaysUntil(date, item.expectedStockoutDate);
      if (days === null) return "stable";
      if (days <= 0 || Number(item.stockOnHand) <= 0) return "now";
      if (days <= 30) return "days30";
      if (days <= 60) return "days60";
      if (days <= 90) return "days90";
      return "stable";
    }
    function analyticsSummary(items, date) {`,
  );
}
if (!html.includes("const horizonMatches = state.analyticsHorizon")) {
  html = html.replace(
    "        return statusMatches && queryMatches;",
    '        const horizonMatches = state.analyticsHorizon === "all" || analyticsHorizonFor(item, state.analyticsDate) === state.analyticsHorizon;\n        return statusMatches && queryMatches && horizonMatches;',
  );
}
if (!html.includes("const horizon = analyticsHorizonFor(item, date);")) {
  html = html.replace(
    "        summary.reorderUnits += item.recommendedOrderQuantity || 0;",
    '        const horizon = analyticsHorizonFor(item, date);\n        if (Object.hasOwn(summary, horizon)) summary[horizon] += 1;\n        summary.reorderUnits += item.recommendedOrderQuantity || 0;',
  );
}
html = html.replace(
  /      const cards = \[\["Understocked".*?\n      document\.getElementById\("analyticsKpis"\)\.innerHTML = .*?;\r?\n/,
  `      const cards = [["Critical now", summary.now, "Stocked out or due now", "now", "critical"], ["0–30 days", summary.days30, "Immediate intervention", "days30", "days30"], ["31–60 days", summary.days60, "Confirm pipeline", "days60", "days60"], ["61–90 days", summary.days90, "Plan replenishment", "days90", "days90"], ["Data warnings", summary.data, "Forecast cannot be trusted", "data", "data"]];
      document.getElementById("analyticsKpis").innerHTML = cards.map(card => '<button type="button" class="warning-card ' + card[4] + (state.analyticsHorizon === card[3] ? ' active' : '') + '" data-horizon="' + card[3] + '"><span>' + card[0] + '</span><strong>' + analyticsNumber(card[1]) + '</strong><small>' + card[2] + '</small></button>').join("");
`,
);
html = html.replace(
  /      const cards = \[\["Understocked"[^\r\n]+\r?\n      document\.getElementById\("analyticsKpis"\)\.innerHTML = [^\r\n]+\r?\n/,
  `      const cards = [["Critical now", summary.now, "Stocked out or due now", "now", "critical"], ["0–30 days", summary.days30, "Immediate intervention", "days30", "days30"], ["31–60 days", summary.days60, "Confirm pipeline", "days60", "days60"], ["61–90 days", summary.days90, "Plan replenishment", "days90", "days90"], ["Data warnings", summary.data, "Forecast cannot be trusted", "data", "data"]];
      document.getElementById("analyticsKpis").innerHTML = cards.map(card => '<button type="button" class="warning-card ' + card[4] + (state.analyticsHorizon === card[3] ? ' active' : '') + '" data-horizon="' + card[3] + '"><span>' + card[0] + '</span><strong>' + analyticsNumber(card[1]) + '</strong><small>' + card[2] + '</small></button>').join("");
`,
);
if (!html.includes('id="predictiveWarningDetail"')) {
  html = html.replace(
    /(          <div class="table-shell"><div class="table-scroll"><table class="analytics-table">.*?id="analyticsResultCount".*?<\/div><\/div>)\r?\n        <\/section>/s,
    '$1\n          <aside class="warning-detail" id="predictiveWarningDetail" hidden aria-label="Commodity forecast warning detail"></aside>\n        </section>',
  );
}

writeFileSync("index.html", html, "utf8");
console.log(JSON.stringify({ output: "index.html", predictiveWarningCenter: true }, null, 2));
