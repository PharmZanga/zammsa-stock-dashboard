import { readFileSync, writeFileSync } from "node:fs";
import { stockHistory } from "../src/zammsaHistory.js";
import { reports } from "../src/zammsaData.js";
import { analyticsReport } from "../src/analyticsReport.js";

const latestReport = reports.at(-1);
const latestRows = stockHistory.filter((row) => row.reportDate === latestReport.key);

const programmeByPrefix = {
  ARV: "National ART Programme",
  TB: "Anti-TB Medicines",
  MAL: "Anti-Malarials",
  RH: "Reproductive Health",
  RN: "Renal",
  CAN: "Oncology",
  HTK: "HIV Test Kits",
  LAB: "Laboratory Services",
  DEN: "Dental",
  EPS: "Epidemic / PPE Supplies",
  PC: "Epidemic / PPE Supplies",
  IMAG: "Imaging",
  SUT: "Sutures",
  MS: "Medical Supplies",
};

function programmeFor(row) {
  const prefix = row.code.match(/^[A-Z]+/)?.[0] || "";
  if (programmeByPrefix[prefix]) return programmeByPrefix[prefix];
  return row.category || "Other Essential Medicines";
}

function classificationFor(row) {
  const prefix = row.code.match(/^[A-Z]+/)?.[0] || "";
  if (prefix === "ARV") return "Antiretroviral medicines";
  if (prefix === "TB") return "Tuberculosis medicines";
  if (prefix === "MAL") return "Malaria commodities";
  if (prefix === "RH") return "Reproductive health commodities";
  if (prefix === "RN") return "Renal medicines and consumables";
  if (prefix === "CAN") return "Oncology medicines";
  if (prefix === "HTK") return "HIV diagnostic test kits";
  if (prefix === "LAB") return "Laboratory reagents and consumables";
  if (prefix === "DEN") return "Dental medicines and supplies";
  if (prefix === "EPS" || prefix === "PC") return "Epidemic preparedness and PPE";
  if (prefix === "IMAG") return "Imaging supplies";
  if (prefix === "SUT") return "Sutures";
  if (prefix === "MS") return "Medical and surgical supplies";
  return row.category || programmeFor(row);
}

function bestName(history) {
  const clean = history.filter((row) => !/(Forecast AMI|Low Demand|\sTBD(?:\s|$))/i.test(row.item));
  const source = clean.length ? clean : history;
  return [...source].sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.item.length - b.item.length)[0]?.item
    || "Item description unavailable";
}

function normalizeCode(code) {
  const history = stockHistory.filter((row) => row.code === code);
  const latest = [...history].sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0];
  const byDate = {};
  for (const report of reports) {
    const candidates = history.filter((row) => row.reportDate === report.key);
    if (!candidates.length) continue;
    const selected = [...candidates].sort((a, b) => {
      const aScore = Number(a.ami !== null) + Number(a.stockOnHand !== null) + Number(a.mos !== null);
      const bScore = Number(b.ami !== null) + Number(b.stockOnHand !== null) + Number(b.mos !== null);
      return bScore - aScore;
    })[0];
    byDate[report.key] = {
      present: true,
      ami: selected.ami,
      soh: selected.stockOnHand,
      mos: selected.mos,
      comment: selected.comment || "",
    };
  }
  return {
    code,
    name: bestName(history),
    programme: programmeFor(latest),
    classification: classificationFor(latest),
    reports: byDate,
  };
}

function replaceRequired(text, search, replacement, label) {
  const updated = text.replace(search, replacement);
  if (updated === text && !text.includes(replacement)) {
    throw new Error(`Could not update ${label}`);
  }
  return updated;
}

const allCodes = [...new Set(stockHistory.map((row) => row.code))].sort();
const data = allCodes.map(normalizeCode);
const zeroOrPointOne = latestRows.filter((row) => row.mos !== null && row.mos <= 0.1).length;
const near = latestRows.filter((row) => row.mos !== null && row.mos > 0.1 && row.mos < 1).length;
const gaps = latestRows.filter((row) => row.mos === null).length;
const latestFive = reports.slice(-5);

let html = readFileSync("index.html", "utf8");
html = replaceRequired(
  html,
  /    const stockData = .*?;\r?\n    const reportDates =/s,
  `    const stockData = ${JSON.stringify(data).replaceAll("</", "<\\/")};\n    const reportDates =`,
  "embedded stock dataset",
);
html = replaceRequired(
  html,
  /    const reportDates = .*?;/,
  `    const reportDates = ${JSON.stringify(reports)};`,
  "embedded report dates",
);
html = replaceRequired(
  html,
  /    const analyticsReport = .*?;\r?\n    const state =/s,
  `    const analyticsReport = ${JSON.stringify(analyticsReport).replaceAll("</", "<\\/")};\n    const state =`,
  "embedded analytics report",
);
html = replaceRequired(html, /Latest central report: [^<]+/, `Latest central report: ${latestReport.label}`, "sidebar date");
html = replaceRequired(html, /<span class="freshness">Updated [^<]+<\/span>/, `<span class="freshness">Updated 22 July 2026</span>`, "freshness date");
html = replaceRequired(html, /Latest report<br><strong>[^<]+<\/strong>/, `Latest report<br><strong>${latestReport.label}</strong>`, "overview date");
html = replaceRequired(html, /<strong>\d+<\/strong><small>Latest central report<\/small>/, `<strong>${latestRows.length}</strong><small>Latest central report</small>`, "row metric");
html = replaceRequired(html, /<strong>\d+<\/strong><small>MOS at or below 0\.1<\/small>/, `<strong>${zeroOrPointOne}</strong><small>MOS at or below 0.1</small>`, "stockout metric");
html = replaceRequired(html, /<strong>\d+<\/strong><small>More than 0\.1 and below 1 MOS<\/small>/, `<strong>${near}</strong><small>More than 0.1 and below 1 MOS</small>`, "near-critical metric");
html = replaceRequired(html, /<strong>\d+<\/strong><small>TBD or missing MOS<\/small>/, `<strong>${gaps}</strong><small>TBD or missing MOS</small>`, "data-gap metric");
html = replaceRequired(
  html,
  /<div class="timeline">.*?<\/div>\s*<\/section>/s,
  `<div class="timeline">${latestFive.map((report) => `<div><span>${report.label}</span><strong>${stockHistory.filter((row) => row.reportDate === report.key).length} rows</strong></div>`).join("")}</div>\n        </section>`,
  "report timeline",
);
html = html.replace("Management-level signals from five central stock reports", `Management-level signals from ${reports.length} central stock reports`);
html = html.replace(/\d+ latest rows require AMI completion or TBD MOS confirmation\./, `${gaps} latest rows require AMI completion or TBD MOS confirmation.`);
html = html.replaceAll("across seven reports", `across ${reports.length} reports`);
html = html.replaceAll("commodities listed on 30 June 2026", `commodities listed on ${latestReport.label}`);
html = html.replaceAll("Latest central stock report: <b>30 June 2026</b>", `Latest central stock report: <b>${latestReport.label}</b>`);
html = html.replace(/reportFor\(item, "\d{4}-\d{2}-\d{2}"\)\.present/, `reportFor(item, "${latestReport.key}").present`);
html = html.replace(/stockLevel\(item, "\d{4}-\d{2}-\d{2}"\)/, `stockLevel(item, "${latestReport.key}")`);
html = html.replace(/q\.match\(\/\\b\[a-z\]\{2,4\}\\d\{4\}\\b\/i\)/, 'q.match(/\\b[a-z]{2,4}\\d{3,4}\\b/i)');
html = html.replace(
  /The navigator contains seven biweekly report dates:.*?Choose one report date/,
  `The navigator contains ${reports.length} biweekly report dates: ${reports.map((report) => report.label).join(", ")}. Choose one report date`,
);
html = html.replace(
  /The 30 June 2026 central extract has 332 rows with missing AMI and 329 rows with TBD or missing MOS\./,
  `The ${latestReport.label} central extract has ${latestRows.filter((row) => row.ami === null).length} rows with missing AMI and ${gaps} rows with TBD or missing MOS.`,
);
html = html.replace(
  /const state = \{ view: "overview", classification: "all", stock: "all", search: "", snapshot: "[^"]+"(.*?), trendDate: "[^"]+" \};/,
  `const state = { view: "overview", classification: "all", stock: "all", search: "", snapshot: "${latestReport.key}"$1, trendDate: "${latestReport.key}" };`,
);
html = html.replace(
  /Object\.assign\(state, \{ classification: "all", stock: "all", search: "", snapshot: "[^"]+"/,
  `Object.assign(state, { classification: "all", stock: "all", search: "", snapshot: "${latestReport.key}"`,
);

writeFileSync("index.html", html, "utf8");
console.log(JSON.stringify({ output: "index.html", reports: reports.length, uniqueCodes: data.length, latestRows: latestRows.length, analyticsItems: analyticsReport.items.length }, null, 2));
