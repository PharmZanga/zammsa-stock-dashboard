import { useMemo, useState } from "react";
import { categories, managementConcerns, programmePressure, reports, trend } from "./zammsaData.js";
import { weeklyAvailability } from "./weeklyAvailability.js";
import { stockHistory } from "./zammsaHistory.js";

const STATUS_META = {
  red: { label: "Stockout", metric: "critical" },
  amber: { label: "Near-critical", metric: "near" },
  blue: { label: "Overstock", metric: "over" },
  green: { label: "Adequate", metric: null },
  neutral: { label: "Data gap", metric: "gaps" },
};

const concernFilters = {
  "Persistent stockouts": { status: "red", query: "", category: "all" },
  "Deteriorating supply": { status: "amber", query: "", category: "all" },
  "Programme risk areas": { status: "all", query: "", category: "Anaesthetics" },
  "Extreme overstock": { status: "blue", query: "", category: "all" },
  "AMI and TBD gaps": { status: "neutral", query: "", category: "all" },
  "Volatile reporting base": { status: "neutral", query: "", category: "all" },
};

const quickRanges = [
  { label: "All reports", start: 0, end: 3 },
  { label: "Latest report", start: 3, end: 3 },
  { label: "Last 30 days", start: 2, end: 3 },
  { label: "April 2026", start: 1, end: 2 },
  { label: "Year to date", start: 0, end: 3 },
];

const suggestedQuestions = [
  "What are the biggest risks?",
  "Which programmes are under pressure?",
  "What changed from 1 May to 8 May?",
  "How many stockouts are there?",
  "What should management do next?",
];

function classify(mos) {
  if (mos === null || mos === undefined) return { label: "Data gap", tone: "neutral", rank: 4 };
  if (mos <= 0.1) return { label: "Stockout", tone: "red", rank: 0 };
  if (mos < 1) return { label: "Near-critical", tone: "amber", rank: 1 };
  if (mos > 24) return { label: "Overstock", tone: "blue", rank: 3 };
  return { label: "Adequate", tone: "green", rank: 2 };
}

function formatMos(value) {
  if (value === null || value === undefined) return "TBD";
  if (value >= 100) return Math.round(value).toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function pct(current, previous) {
  if (!previous) return "New";
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${Math.round(change)}%`;
}

function metricValue(point, status) {
  const metric = STATUS_META[status]?.metric;
  return metric ? point[metric] : point.total - point.critical - point.near - point.over - point.gaps;
}

function reportIndexFromDate(value) {
  const exact = reports.findIndex((report) => report.key === value);
  return exact >= 0 ? exact : reports.length - 1;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function topItems(items, count = 5) {
  return items.slice(0, count).map((item) => `${item.code} ${item.item}`).join("; ");
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function buildFullCommodityHistory(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = `${row.code || "-"}|${row.item}|${row.category}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        code: row.code || "-",
        item: row.item,
        category: row.category,
        mos: Array(reports.length).fill(null),
        present: Array(reports.length).fill(false),
      });
    }
    const entry = grouped.get(key);
    const reportIndex = reports.findIndex((report) => report.key === row.reportDate);
    if (reportIndex >= 0) {
      entry.mos[reportIndex] = row.mos;
      entry.present[reportIndex] = true;
    }
  });
  return [...grouped.values()];
}

const fullCommodityHistory = buildFullCommodityHistory(stockHistory);

function Stat({ label, value, tone, sub, active, onClick }) {
  return (
    <button className={`stat stat-${tone} ${active ? "active" : ""}`} type="button" onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </button>
  );
}

function Badge({ status }) {
  return <span className={`badge badge-${status.tone}`}>{status.label}</span>;
}

function TrendLine({ points, keys, height = 170 }) {
  const width = 620;
  const pad = 28;
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const values = points.flatMap((point) => keys.map((key) => point[key]));
  const max = Math.max(...values, 1);
  const xFor = (index) => pad + (index / Math.max(points.length - 1, 1)) * usableW;
  const yFor = (value) => pad + usableH - (value / max) * usableH;
  const tones = { critical: "red", near: "amber", over: "blue", gaps: "green", mos: "blue" };

  return (
    <svg className="trend-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historic trend line chart">
      {[0, 0.5, 1].map((tick) => (
        <line key={tick} x1={pad} x2={width - pad} y1={pad + usableH * tick} y2={pad + usableH * tick} />
      ))}
      {keys.map((key) => {
        const d = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point[key])}`).join(" ");
        return <path key={key} className={tones[key]} d={d} />;
      })}
      {points.map((point, index) => (
        <g key={point.key}>
          <text x={xFor(index)} y={height - 6} textAnchor="middle">{point.short}</text>
          {keys.map((key) => <circle key={key} className={tones[key]} cx={xFor(index)} cy={yFor(point[key])} r="4" />)}
        </g>
      ))}
    </svg>
  );
}

function Sparkline({ values, onClick }) {
  const cleaned = values.map((value) => (value === null || value === undefined ? null : Number(value)));
  const valid = cleaned.filter((value) => value !== null);
  const max = Math.max(...valid, 1);
  const min = Math.min(...valid, 0);
  const range = Math.max(max - min, 1);
  const points = cleaned.map((value, index) => {
    const x = 8 + index * 26;
    const y = value === null ? 30 : 52 - ((value - min) / range) * 42;
    return { x, y, value };
  });
  const d = points.filter((point) => point.value !== null).map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  return (
    <button className="sparkline-button" type="button" onClick={onClick} aria-label="Open commodity trend">
      <svg viewBox="0 0 72 60">
        <path d={d} />
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={point.value === null ? 2 : 3} />)}
      </svg>
    </button>
  );
}

function RiskBars({ data, activeCategory, onCategory }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="bars">
      {data.map((item) => (
        <button className={`bar-row ${activeCategory === item.label ? "active" : ""}`} type="button" key={item.label} onClick={() => onCategory(item.label)}>
          <span>{item.label}</span>
          <div className="bar-track">
            <div className={`bar-fill ${item.tone}`} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <b>{item.value}</b>
        </button>
      ))}
    </div>
  );
}

function AvailabilityBars({ categories }) {
  return (
    <div className="availability-bars">
      {categories.slice(0, 14).map((item) => (
        <div className="availability-row" key={item.category}>
          <span>{item.category}</span>
          <div className="availability-track">
            <div className={item.availability < 0.25 ? "red" : item.availability < 0.5 ? "amber" : "green"} style={{ width: `${item.availability * 100}%` }} />
          </div>
          <b>{formatPercent(item.availability)}</b>
        </div>
      ))}
    </div>
  );
}

function CommodityModal({ item, onClose }) {
  if (!item) return null;
  const status = classify(item.mos.at(-1));
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="code">{item.code}</span>
            <h2>{item.item}</h2>
            <p>{item.category}</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <TrendLine points={reports.map((report, index) => ({ ...report, mos: item.mos[index] ?? 0 }))} keys={["mos"]} />
        <div className="modal-grid">
          {reports.map((report, index) => (
            <div key={report.key}>
              <span>{report.label}</span>
              <strong>{item.present[index] ? formatMos(item.mos[index]) : "-"}</strong>
              <small>{classify(item.mos[index]).label}</small>
            </div>
          ))}
        </div>
        <Badge status={status} />
      </div>
    </div>
  );
}

function App() {
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(reports.length - 1);
  const [view, setView] = useState("latest");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeConcern, setActiveConcern] = useState("");
  const [selectedCommodity, setSelectedCommodity] = useState(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("Ask about stockouts, programme pressure, overstock, data gaps, or recommended actions. I will answer from the loaded ZAMMSA report data.");
  const [weeklyProgramme, setWeeklyProgramme] = useState("EMMS");

  const start = Math.min(rangeStart, rangeEnd);
  const end = Math.max(rangeStart, rangeEnd);
  const selectedReport = reports[end].key;
  const selectedMeta = reports[end];
  const selectedTrend = trend[end];
  const categoryRisks = programmePressure[selectedReport] || [];
  const hasSliceFilter = categoryFilter !== "all" || query.trim();
  const weeklyProgrammes = [...new Set(weeklyAvailability.reports.map((report) => report.programme))];
  const weeklyReports = weeklyAvailability.reports.filter((report) => report.programme === weeklyProgramme);
  const latestWeekly = weeklyReports.at(-1) || weeklyAvailability.reports.at(-1);
  const weeklyCategoryBars = latestWeekly.categories
    .map(([category, available, total, availability]) => ({ category, available, total, availability }))
    .sort((a, b) => a.availability - b.availability);
  const weeklyChange = weeklyAvailability.changesByProgramme?.[weeklyProgramme]?.at(-1) || weeklyAvailability.changes;

  const filteredTrend = useMemo(() => {
    const q = query.toLowerCase();
    if (!hasSliceFilter) return trend.slice(start, end + 1);
    return reports.slice(start, end + 1).map((report, offset) => {
      const reportIndex = start + offset;
      const rows = fullCommodityHistory
        .filter((item) => item.present[reportIndex])
        .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
        .filter((item) => !q || `${item.code} ${item.item} ${item.category}`.toLowerCase().includes(q));
      const counts = rows.reduce((acc, item) => {
        const status = classify(item.mos[reportIndex]).tone;
        if (status === "red") acc.critical += 1;
        if (status === "amber") acc.near += 1;
        if (status === "blue") acc.over += 1;
        if (status === "neutral") acc.gaps += 1;
        return acc;
      }, { critical: 0, near: 0, over: 0, gaps: 0 });
      return { ...report, total: rows.length, ...counts };
    });
  }, [categoryFilter, end, hasSliceFilter, query, start]);

  const kpiTrend = filteredTrend.at(-1) || selectedTrend;
  const previousTrend = filteredTrend.length > 1 ? filteredTrend.at(-2) : trend[end - 1];

  const filteredConcerns = useMemo(() => {
    if (statusFilter === "all" && categoryFilter === "all" && !query) return managementConcerns;
    return managementConcerns.filter((concern) => {
      const filter = concernFilters[concern.title] || {};
      const statusMatches = statusFilter === "all" || filter.status === statusFilter || concern.tone === statusFilter;
      const categoryMatches = categoryFilter === "all" || concern.programme.includes(categoryFilter) || filter.category === categoryFilter;
      const queryMatches = !query || `${concern.title} ${concern.programme} ${concern.evidence}`.toLowerCase().includes(query.toLowerCase());
      return statusMatches && categoryMatches && queryMatches;
    });
  }, [statusFilter, categoryFilter, query]);

  const drilldown = useMemo(() => {
    const q = query.toLowerCase();
    return fullCommodityHistory
      .map((item) => ({ ...item, status: classify(item.mos[end]) }))
      .filter((item) => item.present[end])
      .filter((item) => !q || `${item.code} ${item.item} ${item.category}`.toLowerCase().includes(q))
      .filter((item) => statusFilter === "all" || item.status.tone === statusFilter)
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .sort((a, b) => a.status.rank - b.status.rank || (a.mos[end] ?? 99999) - (b.mos[end] ?? 99999))
      .slice(0, 160);
  }, [end, query, statusFilter, categoryFilter]);

  const exportRows = useMemo(() => drilldown.map((item) => ({
    code: item.code,
    commodity: item.item,
    category: item.category,
    mos: reports.map((report, index) => item.present[index] ? formatMos(item.mos[index]) : "-"),
    status: item.status.label,
  })), [drilldown]);

  function setStatus(status) {
    setStatusFilter((current) => (current === status ? "all" : status));
    setActiveConcern("");
  }

  function applyConcern(concern) {
    const filter = concernFilters[concern.title] || { status: "all", category: "all", query: "" };
    setStatusFilter(filter.status || "all");
    setCategoryFilter(filter.category || "all");
    setQuery(filter.query || "");
    setActiveConcern(concern.title);
  }

  function resetFilters() {
    setStatusFilter("all");
    setCategoryFilter("all");
    setQuery("");
    setActiveConcern("");
  }

  function applyQuickRange(range) {
    setRangeStart(range.start);
    setRangeEnd(range.end);
  }

  function exportCsv() {
    const headers = ["Code", "Commodity", "Category", ...reports.map((report) => `${report.short} MOS`), "Latest status"];
    const lines = [
      headers.map(csvCell).join(","),
      ...exportRows.map((row) => [row.code, row.commodity, row.category, ...row.mos, row.status].map(csvCell).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zammsa-dashboard-${selectedReport}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    window.print();
  }

  function answerQuestion(question) {
    const text = question.trim();
    if (!text) return;
    const lower = text.toLowerCase();
    const latestRows = fullCommodityHistory
      .map((item) => ({ ...item, status: classify(item.mos[end]) }))
      .filter((item) => item.present[end]);
    const stockouts = latestRows.filter((item) => item.status.tone === "red");
    const nearCritical = latestRows.filter((item) => item.status.tone === "amber");
    const overstock = latestRows.filter((item) => item.status.tone === "blue");
    const dataGaps = latestRows.filter((item) => item.status.tone === "neutral");
    const programme = categories.find((category) => lower.includes(category.toLowerCase()));
    const emmsFirst = weeklyAvailability.reports.find((report) => report.programme === "EMMS" && report.date === "2026-05-01");
    const emmsSecond = weeklyAvailability.reports.find((report) => report.programme === "EMMS" && report.date === "2026-05-08");
    const emmsThird = weeklyAvailability.reports.find((report) => report.programme === "EMMS" && report.date === "2026-05-15");
    const labPrevious = weeklyAvailability.reports.find((report) => report.programme === "LAB" && report.date === "2026-05-08");
    const labLatest = weeklyAvailability.reports.filter((report) => report.programme === "LAB").at(-1);

    if (lower.includes("15 may") || lower.includes("latest week")) {
      const latestEmms = weeklyAvailability.changesByProgramme.EMMS.at(-1);
      const newlyUnavailable = latestEmms.newlyUnavailable.map((item) => `${item.item} (${item.category})`).join("; ");
      setAssistantAnswer(`From 8 May to 15 May, EMMS availability moved from ${formatPercent(emmsSecond.availability)} to ${formatPercent(emmsThird.availability)}. There were ${latestEmms.newlyUnavailable.length} newly unavailable EMMS items and no recovered EMMS items. Newly unavailable: ${newlyUnavailable}. LAB moved from ${formatPercent(labPrevious.availability)} to ${formatPercent(labLatest.availability)}.`);
      return;
    }

    if (lower.includes("what changed") || lower.includes("1 may") || lower.includes("8 may") || lower.includes("weekly")) {
      const recovered = weeklyAvailability.changes.recovered.map((item) => `${item.item} (${item.category})`).join("; ");
      setAssistantAnswer(`From 1 May to 8 May, EMMS availability moved from ${formatPercent(emmsFirst.availability)} to ${formatPercent(emmsSecond.availability)}. No items became newly unavailable in the matched EMMS list, and 2 recovered: ${recovered}.`);
      return;
    }

    if (lower.includes("lab")) {
      const lowLab = labLatest.categories.slice(0, 5).map(([category, , , availability]) => `${category} ${formatPercent(availability)}`).join(", ");
      setAssistantAnswer(`The 8 May LAB report shows overall availability of ${formatPercent(labLatest.availability)}. Lowest LAB categories are ${lowLab}.`);
      return;
    }

    if (programme) {
      const programmeRows = latestRows.filter((item) => item.category === programme);
      const pressure = programmeRows.filter((item) => ["red", "amber"].includes(item.status.tone));
      setAssistantAnswer(`${programme} has ${pressure.length} commodities in stockout or near-critical status in ${selectedMeta.label}. Priority examples: ${topItems(pressure) || "none in the public drilldown"}.`);
      return;
    }

    if (lower.includes("stockout") || lower.includes("out of stock") || lower.includes("critical")) {
      setAssistantAnswer(`There are ${stockouts.length} stockout commodities in ${selectedMeta.label}. The first priorities in the public drilldown are: ${topItems(stockouts)}.`);
      return;
    }

    if (lower.includes("near") || lower.includes("low stock")) {
      setAssistantAnswer(`There are ${nearCritical.length} near-critical commodities below 1 MOS. These should be reviewed before they become stockouts: ${topItems(nearCritical)}.`);
      return;
    }

    if (lower.includes("overstock") || lower.includes("expiry") || lower.includes("excess")) {
      setAssistantAnswer(`There are ${overstock.length} overstocked commodities above 24 MOS. Review expiry risk, redistribution options, and forecast assumptions. Examples: ${topItems(overstock)}.`);
      return;
    }

    if (lower.includes("data") || lower.includes("ami") || lower.includes("tbd")) {
      setAssistantAnswer(`There are ${dataGaps.length} rows with missing AMI or TBD MOS in ${selectedMeta.label}. These rows need data-quality follow-up before MOS-based decisions can be fully trusted.`);
      return;
    }

    if (lower.includes("programme") || lower.includes("pressure")) {
      const topProgrammes = categoryRisks.slice(0, 5).map((item) => `${item.label} (${item.value})`).join(", ");
      setAssistantAnswer(`The highest programme pressure areas in ${selectedMeta.label} are ${topProgrammes}. Click a programme bar to filter the full dashboard to that area.`);
      return;
    }

    if (lower.includes("action") || lower.includes("recommend") || lower.includes("management")) {
      setAssistantAnswer(`Recommended management focus: resolve persistent stockouts, review near-critical items for urgent procurement or redistribution, check extreme overstock for expiry/storage risk, and clean AMI/TBD data gaps so MOS can be trusted.`);
      return;
    }

    setAssistantAnswer(`For ${selectedMeta.label}: ${kpiTrend.critical} stockouts, ${kpiTrend.near} near-critical items, ${kpiTrend.over} overstocked items, and ${kpiTrend.gaps} data gaps. Try asking about a programme, stockouts, overstock, or recommended actions.`);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">ZAMMSA Commodity Stock Control</p>
          <h1>Interactive supply chain command center</h1>
          <p className="lede">Explore biweekly risk trends, cross-filter programme pressure, and jump from management concerns into the underlying commodity movement.</p>
        </div>
        <div className="report-card">
          <span>Analysis window</span>
          <strong>{reports[start].short} - {reports[end].short}</strong>
          <small>{selectedTrend.total.toLocaleString()} extracted commodity rows in the latest selected report.</small>
          <small>Data status: static report extracts, updated {selectedMeta.label}</small>
          <button className="hero-export" type="button" onClick={exportCsv}>Export current CSV</button>
        </div>
      </section>

      <section className="control-strip">
        <div className="mode-tabs">
          <button className={view === "latest" ? "active" : ""} type="button" onClick={() => setView("latest")}>Command view</button>
          <button className={view === "historic" ? "active" : ""} type="button" onClick={() => setView("historic")}>Trend view</button>
        </div>
        <div className="range-control">
          <label>From <span>{reports[start].short}</span><input type="date" min={reports[0].key} max={reports.at(-1).key} value={reports[rangeStart].key} onChange={(event) => setRangeStart(reportIndexFromDate(event.target.value))} /></label>
          <label>To <span>{reports[end].short}</span><input type="date" min={reports[0].key} max={reports.at(-1).key} value={reports[rangeEnd].key} onChange={(event) => setRangeEnd(reportIndexFromDate(event.target.value))} /></label>
          <label>Fine tune <span>{reports[start].short}</span><input type="range" min="0" max={reports.length - 1} value={rangeStart} onChange={(event) => setRangeStart(Number(event.target.value))} /></label>
          <label>Fine tune <span>{reports[end].short}</span><input type="range" min="0" max={reports.length - 1} value={rangeEnd} onChange={(event) => setRangeEnd(Number(event.target.value))} /></label>
        </div>
        <div className="quick-ranges" aria-label="Quick date ranges">
          {quickRanges.map((range) => (
            <button className={start === range.start && end === range.end ? "active" : ""} type="button" key={range.label} onClick={() => applyQuickRange(range)}>{range.label}</button>
          ))}
        </div>
      </section>

      <section className="stats-grid">
        <Stat label="Critical stockouts" value={kpiTrend.critical} tone="red" sub={`${pct(kpiTrend.critical, previousTrend?.critical)} vs prior report${hasSliceFilter ? " in filtered slice" : ""}`} active={statusFilter === "red"} onClick={() => setStatus("red")} />
        <Stat label="Near-critical" value={kpiTrend.near} tone="amber" sub={`More than 0.1 and below 1 MOS${hasSliceFilter ? " in filtered slice" : ""}`} active={statusFilter === "amber"} onClick={() => setStatus("amber")} />
        <Stat label="Overstocked" value={kpiTrend.over} tone="blue" sub={`Above 24 months of stock${hasSliceFilter ? " in filtered slice" : ""}`} active={statusFilter === "blue"} onClick={() => setStatus("blue")} />
        <Stat label="AMI/TBD gaps" value={kpiTrend.gaps} tone="green" sub={`Rows requiring data-quality follow-up${hasSliceFilter ? " in filtered slice" : ""}`} active={statusFilter === "neutral"} onClick={() => setStatus("neutral")} />
      </section>

      <section className="trend-panel">
        <div>
          <h2>Risk trend over selected window</h2>
          <p>Lines update when the date window changes; KPI clicks cross-filter the rest of the dashboard.</p>
        </div>
        <TrendLine points={filteredTrend} keys={["critical", "near", "over", "gaps"]} />
        <div className="legend">
          <span className="red">Critical</span><span className="amber">Near-critical</span><span className="blue">Overstock</span><span className="green">Data gaps</span>
        </div>
      </section>

      <section className="weekly-section">
        <div className="weekly-head">
          <div>
            <p className="eyebrow dark">Weekly Inventory Availability</p>
            <h2>Submitted weekly EMMS and LAB reports</h2>
            <p>Availability is based on the submitted Excel files for 1 May, 8 May, and 15 May. Item change lists compare the latest matched weekly submissions.</p>
          </div>
          <select value={weeklyProgramme} onChange={(event) => setWeeklyProgramme(event.target.value)}>
            {weeklyProgrammes.map((programme) => <option key={programme} value={programme}>{programme}</option>)}
          </select>
        </div>
        <div className="weekly-grid">
          <div className="panel">
            <h2>{weeklyProgramme} availability trend</h2>
            <div className="weekly-trend">
              {weeklyReports.map((report) => (
                <div className="weekly-point" key={`${report.programme}-${report.date}`}>
                  <div style={{ height: `${40 + report.availability * 100}px` }} />
                  <strong>{formatPercent(report.availability)}</strong>
                  <span>{report.label}</span>
                  <small>{report.total ? `${report.available}/${report.total} available` : "Category average"}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="panel span-2">
            <h2>Lowest category availability - {latestWeekly.label}</h2>
            <AvailabilityBars categories={weeklyCategoryBars} />
          </div>
        </div>
        <div className="change-grid">
          <div className="change-card">
            <span>Newly unavailable ({weeklyChange.from} to {weeklyChange.to})</span>
            <strong>{weeklyChange.newlyUnavailable.length}</strong>
            {weeklyChange.newlyUnavailable.length ? (
              <ul>{weeklyChange.newlyUnavailable.map((item) => <li key={item.item}>{item.item} <small>{item.category}</small></li>)}</ul>
            ) : <p>No matched items moved from available to unavailable between {weeklyChange.from} and {weeklyChange.to}.</p>}
          </div>
          <div className="change-card recovered">
            <span>Recovered ({weeklyChange.from} to {weeklyChange.to})</span>
            <strong>{weeklyChange.recovered.length}</strong>
            {weeklyChange.recovered.length ? (
              <ul>{weeklyChange.recovered.map((item) => <li key={item.item}>{item.item} <small>{item.category}</small></li>)}</ul>
            ) : <p>No matched items recovered between {weeklyChange.from} and {weeklyChange.to}.</p>}
          </div>
        </div>
      </section>

      {view === "historic" && (
        <section className="timeline-grid">
          {["red", "amber", "blue", "neutral"].map((status) => (
            <div className="panel" key={status}>
              <h2>{STATUS_META[status].label} over time</h2>
              <div className="mini-trend">
                {filteredTrend.map((point) => (
                  <div className="mini-point" key={`${status}-${point.key}`}>
                    <div className={`mini-bar ${status === "neutral" ? "green" : status}`} style={{ height: `${28 + (metricValue(point, status) / Math.max(...filteredTrend.map((p) => metricValue(p, status)), 1)) * 80}px` }} />
                    <b>{metricValue(point, status)}</b>
                    <span>{point.short}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="workspace-grid">
        <div className="panel span-2">
          <div className="panel-head">
            <div>
              <h2>Programme pressure</h2>
              <p>Click any programme bar to filter concerns and commodity rows.</p>
            </div>
          </div>
          <RiskBars data={categoryRisks} activeCategory={categoryFilter} onCategory={(category) => setCategoryFilter(categoryFilter === category ? "all" : category)} />
        </div>
        <div className="panel">
          <h2>Active filter state</h2>
          <div className="filter-state">
            <span>Status: <b>{statusFilter === "all" ? "All" : STATUS_META[statusFilter].label}</b></span>
            <span>Programme: <b>{categoryFilter === "all" ? "All" : categoryFilter}</b></span>
            <span>Data status: <b>Static extracts</b></span>
            <span>Rows shown: <b>{drilldown.length}</b></span>
          </div>
          <button className="ghost-button" type="button" onClick={resetFilters}>Clear filters</button>
        </div>
      </section>

      <section className="concerns-section">
        <div className="section-head">
          <div>
            <p className="eyebrow dark">Management Concerns</p>
            <h2>Interactive alert playbook</h2>
          </div>
        </div>
        <div className="concerns-grid">
          {filteredConcerns.map((concern) => (
            <button className={`concern concern-${concern.tone} ${activeConcern === concern.title ? "active" : ""}`} type="button" key={concern.title} onClick={() => applyConcern(concern)}>
              <div>
                <span>{concern.severity}</span>
                <small>{concern.programme}</small>
              </div>
              <h3>{concern.title}</h3>
              <p>{concern.evidence}</p>
              <b>{concern.action}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="assistant-panel">
        <div>
          <p className="eyebrow dark">Ask ZAMMSA Copilot</p>
          <h2>Questions answered from this dashboard</h2>
          <p>This public version uses the loaded report data only. It does not send data to an external AI service.</p>
        </div>
        <div className="assistant-chat">
          <div className="suggested-questions">
            {suggestedQuestions.map((question) => (
              <button type="button" key={question} onClick={() => {
                setAssistantQuestion(question);
                answerQuestion(question);
              }}>{question}</button>
            ))}
          </div>
          <form onSubmit={(event) => {
            event.preventDefault();
            answerQuestion(assistantQuestion);
          }}>
            <input value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="Ask about stockouts, TB, malaria, overstock, or data gaps" />
            <button type="submit">Ask</button>
          </form>
          <div className="assistant-answer">{assistantAnswer}</div>
        </div>
      </section>

      <section className="table-panel">
        <div className="table-headline">
          <div>
            <h2>Commodity drilldown</h2>
            <p>Exports use the current dashboard filters.</p>
          </div>
          <div className="export-actions">
            <button type="button" onClick={exportCsv}>Export CSV</button>
            <button type="button" onClick={exportPdf}>Export PDF</button>
          </div>
        </div>
        <div className="table-tools">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, commodity, category, or concern evidence" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="red">Stockout</option>
            <option value="amber">Near-critical</option>
            <option value="blue">Overstock</option>
            <option value="green">Adequate</option>
            <option value="neutral">Data gap</option>
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Commodity</th>
                <th>Category</th>
                <th>MOS sparkline</th>
                {reports.map((report) => <th key={report.key}>{report.short} MOS</th>)}
                <th>Latest status</th>
              </tr>
            </thead>
            <tbody>
              {drilldown.map((item) => (
                <tr key={item.code}>
                  <td className="code">{item.code}</td>
                  <td>{item.item}</td>
                  <td>{item.category}</td>
                  <td><Sparkline values={item.mos} onClick={() => setSelectedCommodity(item)} /></td>
                  {reports.map((report, index) => (
                    <td key={`${item.code}-${report.key}`} className={classify(item.mos[index]).tone}>
                      {item.present[index] ? formatMos(item.mos[index]) : "-"}
                    </td>
                  ))}
                  <td><Badge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <CommodityModal item={selectedCommodity} onClose={() => setSelectedCommodity(null)} />
    </main>
  );
}

export default App;
