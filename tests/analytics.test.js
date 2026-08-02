import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAnalyticsReport, classifyMos } from "../src/analytics/analytics.js";
import { DEFAULT_POLICY } from "../src/analytics/config.js";
import { ingestSnapshotsCsv, normalizeDate } from "../src/analytics/ingestion.js";

test("CSV ingestion handles quoted commas, missing values, dates, and duplicates", () => {
  const csv = `SKU,Description,Snapshot Date,Location,Stock on Hand,Average Monthly Issue,Months of Stock\nEM001,"Medicine, 5mg",15/07/2026,Central,"1,200",600,2\nEM001,"Medicine, 5mg",15/07/2026,Central,900,,1.5\nEM002,Other,2026-07-15,Central,-,100,TBD`;
  const result = ingestSnapshotsCsv(csv, {
    dateOrder: "DMY",
    columns: { sku: "SKU", description: "Description", date: "Snapshot Date", location: "Location", stockOnHand: "Stock on Hand", ami: "Average Monthly Issue", mos: "Months of Stock" },
  });
  assert.equal(result.records.length, 2);
  assert.equal(result.records.find((row) => row.sku === "EM001").stockOnHand, 900);
  assert.equal(result.records.find((row) => row.sku === "EM001").ami, null);
  assert.equal(result.issues[0].type, "duplicate");
  assert.equal(normalizeDate("7/15/2026", { dateOrder: "MDY" }), "2026-07-15");
});
test("official MOS policy flags boundaries correctly", () => {
  assert.equal(classifyMos(1.99, DEFAULT_POLICY), "understocked");
  assert.equal(classifyMos(2, DEFAULT_POLICY), "adequate");
  assert.equal(classifyMos(4, DEFAULT_POLICY), "adequate");
  assert.equal(classifyMos(4.01, DEFAULT_POLICY), "overstocked");
  assert.equal(classifyMos(12, DEFAULT_POLICY), "overstocked");
  assert.equal(classifyMos(12.01, DEFAULT_POLICY), "excess");
});

test("forecast report has stable dashboard output shape", () => {
  const snapshots = [
    ["2026-05-15", 300, 100, 3],
    ["2026-06-15", 180, 110, 1.64],
    ["2026-07-15", 90, 120, 0.75],
  ].map(([date, stockOnHand, ami, mos]) => ({ sku: "EM001", description: "Medicine", programme: "EMMS", location: "Central", date, stockOnHand, ami, mos, unitCost: 2 }));
  const report = buildAnalyticsReport({ snapshots, config: { location: "Central", leadTimeDays: 30 } });
  assert.equal(report.location, "Central");
  assert.equal(report.items.length, 1);
  assert.equal(report.items[0].status, "understocked");
  assert.equal(report.items[0].forecast.points.length, 3);
  assert.ok(report.items[0].forecastRange.lower <= report.items[0].forecastRange.upper);
  assert.ok(report.items[0].recommendedOrderQuantity > 0);
});

test("management analytics exposes stream, programme and historical date controls", () => {
  const dashboard = readFileSync("index.html", "utf8");
  assert.match(dashboard, /id="analyticsStream"/);
  assert.match(dashboard, /id="analyticsProgramme"/);
  assert.match(dashboard, /id="analyticsDate"/);
  assert.match(dashboard, /function analyticsItemsForDate\(date\)/);
  assert.match(dashboard, /Compared with/);
});

test("predictive warning center includes the Stage 2 scenario simulator", () => {
  const dashboard = readFileSync("index.html", "utf8");
  assert.match(dashboard, /id="predictiveScenario"/);
  assert.match(dashboard, /id="scenarioDemand"/);
  assert.match(dashboard, /id="scenarioPipeline"/);
  assert.match(dashboard, /id="scenarioDelay"/);
  assert.match(dashboard, /id="scenarioTarget"/);
  assert.match(dashboard, /function calculatePredictiveScenario\(\)/);
  assert.match(dashboard, /Scenario order quantity/);
  assert.match(dashboard, /Expedite the planned delivery/);
});
