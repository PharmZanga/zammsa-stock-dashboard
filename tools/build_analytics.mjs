import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAnalyticsReport } from "../src/analytics/analytics.js";
import { ingestMovementsCsv, ingestSnapshotsCsv } from "../src/analytics/ingestion.js";
import { stockHistory } from "../src/zammsaHistory.js";

const configArg = process.argv.find((argument) => argument.startsWith("--config="));
const configPath = resolve(configArg ? configArg.slice("--config=".length) : "config/analytics.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
let snapshots = stockHistory.map((row) => ({
  sku: row.code,
  description: row.item,
  programme: row.category,
  location: config.location || "Central",
  date: row.reportDate,
  stockOnHand: row.stockOnHand,
  ami: row.ami,
  mos: row.mos,
  unitCost: null,
  comment: row.comment || "",
}));
let movements = [];
const ingestionIssues = [];

if (config.snapshotCsv) {
  const result = ingestSnapshotsCsv(readFileSync(resolve(config.snapshotCsv), "utf8"), config.snapshotSchema || {});
  snapshots = result.records;
  ingestionIssues.push(...result.issues);
}
if (config.movementCsv) {
  const result = ingestMovementsCsv(readFileSync(resolve(config.movementCsv), "utf8"), config.movementSchema || {});
  movements = result.records;
  ingestionIssues.push(...result.issues);
}

const report = buildAnalyticsReport({ snapshots, movements, config });
report.ingestionIssues = ingestionIssues;
writeFileSync("src/analyticsReport.js", `export const analyticsReport = ${JSON.stringify(report, null, 2)};\n`, "utf8");
console.log(JSON.stringify({ output: "src/analyticsReport.js", location: report.location, asOfDate: report.asOfDate, commodities: report.items.length, summary: report.summary, ingestionIssues: ingestionIssues.length }, null, 2));
