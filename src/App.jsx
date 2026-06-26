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
  { label: "All reports", start: 0, end: reports.length - 1 },
  { label: "Latest report", start: reports.length - 1, end: reports.length - 1 },
  { label: "Last 30 days", start: Math.max(reports.length - 3, 0), end: reports.length - 1 },
  { label: "April 2026", start: 1, end: 2 },
  { label: "Year to date", start: 0, end: reports.length - 1 },
];

const suggestedQuestions = [
  "What are the biggest risks?",
  "Which programmes are under pressure?",
  "What changed in the latest weekly inventory?",
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

function calculateMos(stockOnHand, ami) {
  if (stockOnHand === null || stockOnHand === undefined || ami === null || ami === undefined || ami === 0) return null;
  return Math.round((stockOnHand / ami) * 10) / 10;
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
        ami: Array(reports.length).fill(null),
        stockOnHand: Array(reports.length).fill(null),
        comments: Array(reports.length).fill(""),
        present: Array(reports.length).fill(false),
      });
    }
    const entry = grouped.get(key);
    const reportIndex = reports.findIndex((report) => report.key === row.reportDate);
    if (reportIndex >= 0) {
      entry.mos[reportIndex] = calculateMos(row.stockOnHand, row.ami);
      entry.ami[reportIndex] = row.ami;
      entry.stockOnHand[reportIndex] = row.stockOnHand;
      entry.comments[reportIndex] = row.comment || "";
      entry.present[reportIndex] = true;
    }
  });
  return [...grouped.values()];
}

function countDataQuality(rows, reportIndex) {
  return rows.reduce((acc, item) => {
    if (item.ami[reportIndex] === null || item.ami[reportIndex] === undefined) acc.amiMissing += 1;
    if ((item.comments[reportIndex] || "").toUpperCase().includes("TBD") || item.mos[reportIndex] === null || item.mos[reportIndex] === undefined) acc.tbdMos += 1;
    return acc;
  }, { amiMissing: 0, tbdMos: 0 });
}

function matchesDataQualityFilters(item, reportIndex, amiFilter, tbdFilter, sohFilter) {
  const amiMissing = item.ami[reportIndex] === null || item.ami[reportIndex] === undefined;
  const tbdMos = (item.comments[reportIndex] || "").toUpperCase().includes("TBD") || item.mos[reportIndex] === null || item.mos[reportIndex] === undefined;
  const soh = item.stockOnHand[reportIndex];
  const sohMissing = soh === null || soh === undefined;
  const amiMatches = amiFilter === "all" || (amiFilter === "missing" ? amiMissing : !amiMissing);
  const tbdMatches = tbdFilter === "all" || (tbdFilter === "tbd" ? tbdMos : !tbdMos);
  const sohMatches = sohFilter === "all" || (sohFilter === "missing" ? sohMissing : sohFilter === "zero" ? !sohMissing && soh <= 0 : !sohMissing && soh > 0);
  return amiMatches && tbdMatches && sohMatches;
}

const fullCommodityHistory = buildFullCommodityHistory(stockHistory);

function trendStatus(mos) {
  if (mos === null || mos === undefined) return { label: "Data gap", tone: "neutral", rank: 5 };
  if (mos <= 0.1) return { label: "Stock out", tone: "red", rank: 0 };
  if (mos < 2) return { label: "Understocked", tone: "amber", rank: 1 };
  if (mos <= 4) return { label: "Adequate", tone: "green", rank: 2 };
  if (mos <= 12) return { label: "Overstocked", tone: "orange", rank: 3 };
  return { label: "Excess", tone: "red", rank: 4 };
}

function distanceFromOptimalMos(mos) {
  if (mos === null || mos === undefined) return 99;
  if (mos >= 2 && mos <= 4) return 0;
  return mos < 2 ? 2 - mos : mos - 4;
}

function trendDirection(values) {
  const valid = values.filter((value) => value !== null && value !== undefined);
  if (valid.length < 2) return { label: "Stable", tone: "neutral", delta: 0 };
  const first = valid[0];
  const last = valid.at(-1);
  const improvement = distanceFromOptimalMos(first) - distanceFromOptimalMos(last);
  if (Math.abs(improvement) < 0.25) return { label: "Stable", tone: "neutral", delta: last - first };
  return improvement > 0
    ? { label: "Improving", tone: "green", delta: last - first }
    : { label: "Worsening", tone: "red", delta: last - first };
}

function commodityKey(item) {
  return `${item.code}|${item.item}|${item.category}`;
}

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

function MosBandChart({ rows }) {
  const width = 720;
  const height = 260;
  const pad = 34;
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const valid = rows.map((row) => row.mos).filter((value) => value !== null && value !== undefined);
  const max = Math.max(6, ...valid, 4);
  const xFor = (index) => pad + (index / Math.max(rows.length - 1, 1)) * usableW;
  const yFor = (value) => pad + usableH - (Math.min(value, max) / max) * usableH;
  const d = rows
    .filter((row) => row.mos !== null && row.mos !== undefined)
    .map((row, index, filtered) => {
      const originalIndex = rows.findIndex((candidate) => candidate.key === row.key);
      return `${index === 0 ? "M" : "L"} ${xFor(originalIndex)} ${yFor(row.mos)}`;
    })
    .join(" ");
  const optimalTop = yFor(4);
  const optimalBottom = yFor(2);
  const understockTop = yFor(2);

  return (
    <svg className="mos-band-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Months of stock trend with stock status bands">
      <rect className="band-under" x={pad} y={understockTop} width={usableW} height={height - pad - understockTop} />
      <rect className="band-optimal" x={pad} y={optimalTop} width={usableW} height={optimalBottom - optimalTop} />
      <rect className="band-over" x={pad} y={pad} width={usableW} height={optimalTop - pad} />
      {[0, 2, 4, max].map((tick) => (
        <g key={tick}>
          <line x1={pad} x2={width - pad} y1={yFor(tick)} y2={yFor(tick)} />
          <text x={8} y={yFor(tick) + 4}>{tick}</text>
        </g>
      ))}
      <path d={d} />
      {rows.map((row, index) => row.mos === null || row.mos === undefined ? null : (
        <g key={row.key}>
          <circle className={trendStatus(row.mos).tone} cx={xFor(index)} cy={yFor(row.mos)} r="5" />
          <text x={xFor(index)} y={height - 8} textAnchor="middle">{row.short}</text>
        </g>
      ))}
    </svg>
  );
}

function StockConsumptionChart({ rows }) {
  const stockValues = rows.map((row) => row.stockOnHand || 0);
  const amcValues = rows.map((row) => row.amc || 0);
  const max = Math.max(...stockValues, ...amcValues, 1);
  return (
    <div className="stock-consumption-chart">
      {rows.map((row) => (
        <div className="stock-consumption-point" key={row.key}>
          <div className="stock-bars">
            <span className="soh-bar" style={{ height: `${24 + ((row.stockOnHand || 0) / max) * 132}px` }} />
            <span className="amc-bar" style={{ height: `${24 + ((row.amc || 0) / max) * 132}px` }} />
          </div>
          <b>{row.short}</b>
          <small>{row.stockOnHand === null || row.stockOnHand === undefined ? "-" : Math.round(row.stockOnHand).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}

function StatusTimeline({ rows }) {
  return (
    <div className="status-timeline">
      {rows.map((row) => {
        const status = trendStatus(row.mos);
        return (
          <div className={`status-step ${status.tone}`} key={row.key}>
            <span>{row.short}</span>
            <b>{status.label}</b>
            <small>{row.mos === null || row.mos === undefined ? "MOS TBD" : `${formatMos(row.mos)} MOS`}</small>
          </div>
        );
      })}
    </div>
  );
}

function ExpiryRiskTrend({ rows }) {
  const riskRows = rows.map((row, index) => {
    const previous = rows[index - 1];
    const isHighCover = row.mos !== null && row.mos !== undefined && row.mos > 4;
    const expiring = isHighCover ? row.stockOnHand || 0 : 0;
    const stockReduction = previous && previous.stockOnHand && row.stockOnHand !== null && row.stockOnHand !== undefined
      ? Math.max(0, previous.stockOnHand - row.stockOnHand)
      : 0;
    return {
      ...row,
      expiring,
      salvaged: isHighCover ? Math.round(stockReduction * 0.35) : 0,
      redistributed: isHighCover ? Math.round(stockReduction * 0.65) : 0,
    };
  });
  const max = Math.max(...riskRows.flatMap((row) => [row.expiring, row.salvaged, row.redistributed]), 1);
  return (
    <div className="expiry-risk-trend">
      {riskRows.map((row) => (
        <div key={row.key}>
          <span>{row.short}</span>
          <div><b className="expiring" style={{ height: `${18 + (row.expiring / max) * 92}px` }} /></div>
          <div><b className="salvaged" style={{ height: `${18 + (row.salvaged / max) * 92}px` }} /></div>
          <div><b className="redistributed" style={{ height: `${18 + (row.redistributed / max) * 92}px` }} /></div>
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
  const [amiFilter, setAmiFilter] = useState("all");
  const [tbdFilter, setTbdFilter] = useState("all");
  const [sohFilter, setSohFilter] = useState("all");
  const [activeConcern, setActiveConcern] = useState("");
  const [selectedCommodity, setSelectedCommodity] = useState(null);
  const [trendCommodity, setTrendCommodity] = useState("auto");
  const [trendProgramme, setTrendProgramme] = useState("all");
  const [trendMonth, setTrendMonth] = useState(reports.at(-1).key);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("Ask about stockouts, programme pressure, overstock, data gaps, or recommended actions. I will answer from the loaded ZAMMSA report data.");
  const [assistantPosition, setAssistantPosition] = useState(() => ({
    x: typeof window !== "undefined" ? Math.max(window.innerWidth - 650, 18) : 18,
    y: 18,
  }));
  const [weeklyProgramme, setWeeklyProgramme] = useState("EMMS");

  const start = Math.min(rangeStart, rangeEnd);
  const end = Math.max(rangeStart, rangeEnd);
  const selectedReport = reports[end].key;
  const selectedMeta = reports[end];
  const selectedTrend = trend[end];
  const categoryRisks = programmePressure[selectedReport] || [];
  const hasSliceFilter = categoryFilter !== "all" || amiFilter !== "all" || tbdFilter !== "all" || sohFilter !== "all" || query.trim();
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
        .filter((item) => matchesDataQualityFilters(item, reportIndex, amiFilter, tbdFilter, sohFilter))
        .filter((item) => !q || `${item.code} ${item.item} ${item.category}`.toLowerCase().includes(q));
      const counts = rows.reduce((acc, item) => {
        const status = classify(item.mos[reportIndex]).tone;
        if (status === "red") acc.critical += 1;
        if (status === "amber") acc.near += 1;
        if (status === "blue") acc.over += 1;
        if (status === "neutral") acc.gaps += 1;
        return acc;
      }, { critical: 0, near: 0, over: 0, gaps: 0 });
      return { ...report, total: rows.length, ...counts, ...countDataQuality(rows, reportIndex) };
    });
  }, [amiFilter, categoryFilter, end, hasSliceFilter, query, sohFilter, start, tbdFilter]);

  const kpiTrend = filteredTrend.at(-1) || selectedTrend;
  const previousTrend = filteredTrend.length > 1 ? filteredTrend.at(-2) : trend[end - 1];
  const trendEndIndex = reportIndexFromDate(trendMonth);
  const stockTrendOptions = useMemo(() => fullCommodityHistory
    .filter((item) => item.present.some(Boolean))
    .filter((item) => trendProgramme === "all" || item.category === trendProgramme)
    .map((item) => ({ ...item, latestStatus: trendStatus(item.mos[trendEndIndex]) }))
    .sort((a, b) => a.latestStatus.rank - b.latestStatus.rank || (a.mos[trendEndIndex] ?? 99999) - (b.mos[trendEndIndex] ?? 99999)), [trendEndIndex, trendProgramme]);
  const selectedTrendCommodity = stockTrendOptions.find((item) => commodityKey(item) === trendCommodity) || stockTrendOptions[0] || fullCommodityHistory[0];
  const selectedTrendRows = selectedTrendCommodity ? reports.slice(0, trendEndIndex + 1).map((report, index) => ({
    ...report,
    mos: selectedTrendCommodity.mos[index],
    amc: selectedTrendCommodity.ami[index],
    stockOnHand: selectedTrendCommodity.stockOnHand[index],
    present: selectedTrendCommodity.present[index],
    status: trendStatus(selectedTrendCommodity.mos[index]),
  })) : [];
  const latestTrendRow = [...selectedTrendRows].reverse().find((row) => row.present) || selectedTrendRows.at(-1);
  const previousTrendRow = selectedTrendRows.filter((row) => row.present).at(-2);
  const productTrend = trendDirection(selectedTrendRows.map((row) => row.mos));
  const previousStockKnown = previousTrendRow?.stockOnHand !== null && previousTrendRow?.stockOnHand !== undefined;
  const latestStockKnown = latestTrendRow?.stockOnHand !== null && latestTrendRow?.stockOnHand !== undefined;
  const stockMovement = previousStockKnown && latestStockKnown ? latestTrendRow.stockOnHand - previousTrendRow.stockOnHand : 0;
  const peerTrendRows = stockTrendOptions.slice(0, 14).map((item) => {
    const values = reports.slice(0, trendEndIndex + 1).map((report, index) => item.mos[index]);
    return { ...item, values, direction: trendDirection(values), currentStatus: trendStatus(item.mos[trendEndIndex]) };
  });
  const highCoverCount = stockTrendOptions.filter((item) => {
    const mos = item.mos[trendEndIndex];
    return mos !== null && mos !== undefined && mos > 4;
  }).length;
  const lowCoverCount = stockTrendOptions.filter((item) => {
    const mos = item.mos[trendEndIndex];
    return mos !== null && mos !== undefined && mos > 0 && mos < 2;
  }).length;
  const stockTrendInsights = [
    `${selectedTrendCommodity?.code || ""} ${selectedTrendCommodity?.item || "Selected product"} is currently ${latestTrendRow?.status.label || "not classified"} at ${latestTrendRow?.mos === null || latestTrendRow?.mos === undefined ? "TBD" : `${formatMos(latestTrendRow.mos)} MOS`}.`,
    `The product trend is ${productTrend.label.toLowerCase()} across the loaded reporting window, moving ${productTrend.delta >= 0 ? "up" : "down"} by ${Math.abs(productTrend.delta).toFixed(1)} MOS.`,
    latestTrendRow?.amc ? `Consumption signal is ${Math.round(latestTrendRow.amc).toLocaleString()} AMC, while stock on hand is ${Math.round(latestTrendRow.stockOnHand || 0).toLocaleString()}.` : "AMC is missing for this product, so MOS should be interpreted with caution.",
    `${highCoverCount} products in the selected programme are above 4 MOS and ${lowCoverCount} are below 2 MOS.`,
    latestTrendRow?.mos > 4 ? "Recommended action: review expiry dates and prioritize redistribution before additional procurement." : latestTrendRow?.mos < 2 ? "Recommended action: confirm pipeline receipts and prioritize replenishment or redistribution." : "Recommended action: maintain routine monitoring and protect the 2-4 MOS operating range.",
  ];

  const filteredConcerns = useMemo(() => {
    if (statusFilter === "all" && categoryFilter === "all" && amiFilter === "all" && tbdFilter === "all" && sohFilter === "all" && !query) return managementConcerns;
    return managementConcerns.filter((concern) => {
      const filter = concernFilters[concern.title] || {};
      const statusMatches = statusFilter === "all" || filter.status === statusFilter || concern.tone === statusFilter;
      const categoryMatches = categoryFilter === "all" || concern.programme.includes(categoryFilter) || filter.category === categoryFilter;
      const queryMatches = !query || `${concern.title} ${concern.programme} ${concern.evidence}`.toLowerCase().includes(query.toLowerCase());
      const dataQualityMatches = (amiFilter === "all" && tbdFilter === "all" && sohFilter === "all") || concern.title === "AMI and TBD gaps" || concern.tone === "neutral";
      return statusMatches && categoryMatches && queryMatches && dataQualityMatches;
    });
  }, [statusFilter, categoryFilter, amiFilter, tbdFilter, sohFilter, query]);

  const drilldown = useMemo(() => {
    const q = query.toLowerCase();
    return fullCommodityHistory
      .map((item) => ({ ...item, status: classify(item.mos[end]) }))
      .filter((item) => item.present[end])
      .filter((item) => !q || `${item.code} ${item.item} ${item.category}`.toLowerCase().includes(q))
      .filter((item) => statusFilter === "all" || item.status.tone === statusFilter)
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .filter((item) => matchesDataQualityFilters(item, end, amiFilter, tbdFilter, sohFilter))
      .sort((a, b) => a.status.rank - b.status.rank || (a.mos[end] ?? 99999) - (b.mos[end] ?? 99999))
      .slice(0, 160);
  }, [amiFilter, end, query, statusFilter, categoryFilter, sohFilter, tbdFilter]);

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
    setAmiFilter("all");
    setTbdFilter("all");
    setSohFilter("all");
    setQuery("");
    setActiveConcern("");
  }

  function filterMissingAmi() {
    setAmiFilter((current) => (current === "missing" ? "all" : "missing"));
    setActiveConcern("");
  }

  function filterTbdMos() {
    setTbdFilter((current) => (current === "tbd" ? "all" : "tbd"));
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

  function startAssistantDrag(event) {
    event.preventDefault();
    const originX = event.clientX - assistantPosition.x;
    const originY = event.clientY - assistantPosition.y;

    function moveAssistant(moveEvent) {
      const panelWidth = Math.min(620, window.innerWidth - 24);
      const panelHeight = 260;
      setAssistantPosition({
        x: Math.min(Math.max(moveEvent.clientX - originX, 12), window.innerWidth - panelWidth - 12),
        y: Math.min(Math.max(moveEvent.clientY - originY, 12), window.innerHeight - panelHeight),
      });
    }

    function stopAssistantDrag() {
      window.removeEventListener("pointermove", moveAssistant);
      window.removeEventListener("pointerup", stopAssistantDrag);
    }

    window.addEventListener("pointermove", moveAssistant);
    window.addEventListener("pointerup", stopAssistantDrag);
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
    const dataQuality = countDataQuality(latestRows, end);
    const programme = categories.find((category) => lower.includes(category.toLowerCase()));
    const emmsReports = weeklyAvailability.reports.filter((report) => report.programme === "EMMS");
    const labReports = weeklyAvailability.reports.filter((report) => report.programme === "LAB");
    const latestEmms = weeklyAvailability.changesByProgramme.EMMS.at(-1);
    const latestLab = weeklyAvailability.changesByProgramme.LAB.at(-1);
    const emmsPrevious = emmsReports.at(-2);
    const emmsLatest = emmsReports.at(-1);
    const labPrevious = labReports.at(-2);
    const labLatest = weeklyAvailability.reports.filter((report) => report.programme === "LAB").at(-1);

    if (lower.includes("latest week") || lower.includes("latest weekly") || lower.includes("19 june")) {
      const newlyUnavailable = latestEmms.newlyUnavailable.map((item) => `${item.item} (${item.category})`).join("; ") || "none";
      const recovered = latestEmms.recovered.map((item) => `${item.item} (${item.category})`).join("; ") || "none";
      setAssistantAnswer(`From ${latestEmms.from} to ${latestEmms.to}, EMMS availability moved from ${formatPercent(emmsPrevious.availability)} to ${formatPercent(emmsLatest.availability)}. There were ${latestEmms.newlyUnavailable.length} newly unavailable EMMS items and ${latestEmms.recovered.length} recovered EMMS items. Newly unavailable: ${newlyUnavailable}. Recovered: ${recovered}. LAB moved from ${formatPercent(labPrevious.availability)} to ${formatPercent(labLatest.availability)} over the same latest window.`);
      return;
    }

    if (lower.includes("what changed") || lower.includes("13 june") || lower.includes("weekly")) {
      const recovered = weeklyAvailability.changes.recovered.map((item) => `${item.item} (${item.category})`).join("; ") || "none";
      const newlyUnavailable = weeklyAvailability.changes.newlyUnavailable.map((item) => `${item.item} (${item.category})`).join("; ") || "none";
      setAssistantAnswer(`From ${weeklyAvailability.changes.from} to ${weeklyAvailability.changes.to}, EMMS availability moved from ${formatPercent(emmsPrevious.availability)} to ${formatPercent(emmsLatest.availability)}. ${weeklyAvailability.changes.newlyUnavailable.length} matched EMMS items became newly unavailable: ${newlyUnavailable}. ${weeklyAvailability.changes.recovered.length} recovered: ${recovered}. LAB had ${latestLab.newlyUnavailable.length} newly unavailable and ${latestLab.recovered.length} recovered matched items.`);
      return;
    }

    if (lower.includes("lab")) {
      const lowLab = labLatest.categories.slice(0, 5).map(([category, , , availability]) => `${category} ${formatPercent(availability)}`).join(", ");
      setAssistantAnswer(`The ${labLatest.label} LAB inventory shows overall availability of ${formatPercent(labLatest.availability)}. Lowest LAB categories are ${lowLab}.`);
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
      setAssistantAnswer(`${selectedMeta.label} has ${dataQuality.amiMissing} rows with missing AMI and ${dataQuality.tbdMos} rows with TBD MOS. These can overlap, so use them as two data-quality work queues rather than adding them together. ${dataGaps.length} rows cannot be classified by MOS until corrected.`);
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

    setAssistantAnswer(`For ${selectedMeta.label}: ${kpiTrend.critical} stockouts, ${kpiTrend.near} near-critical items, ${kpiTrend.over} overstocked items, ${kpiTrend.amiMissing ?? kpiTrend.gaps} missing AMI rows, and ${kpiTrend.tbdMos ?? kpiTrend.gaps} TBD MOS rows. Try asking about a programme, stockouts, overstock, or recommended actions.`);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">ZAMMSA Commodity Stock Control</p>
          <h1>Interactive supply chain command center</h1>
          <p className="lede">Explore biweekly risk trends, cross-filter programme pressure, and jump from management concerns into the underlying commodity movement.</p>
        </div>
        <div className="report-card brand-card">
          <div className="brand-logo-frame">
            <img src="./zammsa-logo-transparent.png" alt="ZAMMSA logo" />
          </div>
          <span>ZAMMSA Intelligence Centre</span>
          <strong>{reports[start].short} - {reports[end].short}</strong>
          <small>{selectedTrend.total.toLocaleString()} extracted commodity rows in the latest selected report.</small>
          <small>Data status: static report extracts, updated {selectedMeta.label}</small>
          <button className="hero-export" type="button" onClick={exportCsv}>Export current CSV</button>
        </div>
      </section>

      <section
        className="assistant-panel floating-assistant"
        style={{ left: `${assistantPosition.x}px`, top: `${assistantPosition.y}px` }}
      >
        <div className="assistant-intro">
          <button className="assistant-drag-handle" type="button" onPointerDown={startAssistantDrag} aria-label="Move ZAMMSA Copilot panel">
            <span />
            <span />
            <span />
          </button>
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
        <Stat label="Missing AMI" value={kpiTrend.amiMissing ?? kpiTrend.gaps} tone="green" sub={`Rows needing AMI completion${hasSliceFilter ? " in filtered slice" : ""}`} active={amiFilter === "missing"} onClick={filterMissingAmi} />
        <Stat label="TBD MOS" value={kpiTrend.tbdMos ?? kpiTrend.gaps} tone="purple" sub={`Rows where MOS cannot yet be trusted${hasSliceFilter ? " in filtered slice" : ""}`} active={tbdFilter === "tbd"} onClick={filterTbdMos} />
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
            <p>Availability is based on the submitted weekly Excel files through 19 June 2026. Item change lists compare the latest matched EMMS and LAB submissions while the formal stock status is pending.</p>
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

      <section className="stock-trend-section">
        <div className="stock-trend-head">
          <div>
            <p className="eyebrow dark">5. Stock Trend</p>
            <h2>How this product stock position changed over time</h2>
            <p>The section combines MOS history, stock on hand, AMC, status movement, expiry-risk proxy, peer trend rows, and action-oriented insights.</p>
          </div>
          <div className="stock-trend-filters">
            <label>
              <span>Program</span>
              <select value={trendProgramme} onChange={(event) => {
                setTrendProgramme(event.target.value);
                setTrendCommodity("auto");
              }}>
                <option value="all">All programs</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>
              <span>Product</span>
              <select value={selectedTrendCommodity ? commodityKey(selectedTrendCommodity) : "auto"} onChange={(event) => setTrendCommodity(event.target.value)}>
                {stockTrendOptions.slice(0, 180).map((item) => (
                  <option key={commodityKey(item)} value={commodityKey(item)}>{item.code} - {item.item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Reporting month</span>
              <select value={trendMonth} onChange={(event) => setTrendMonth(event.target.value)}>
                {reports.map((report) => <option key={report.key} value={report.key}>{report.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="stock-trend-summary">
          <div>
            <span>Current stock on hand</span>
            <strong>{latestTrendRow?.stockOnHand === null || latestTrendRow?.stockOnHand === undefined ? "-" : Math.round(latestTrendRow.stockOnHand).toLocaleString()}</strong>
            <small>{latestTrendRow?.short} report</small>
          </div>
          <div>
            <span>Current MOS</span>
            <strong>{latestTrendRow?.mos === null || latestTrendRow?.mos === undefined ? "TBD" : formatMos(latestTrendRow.mos)}</strong>
            <small>Optimal band is 2-4 MOS</small>
          </div>
          <div>
            <span>Current AMC</span>
            <strong>{latestTrendRow?.amc === null || latestTrendRow?.amc === undefined ? "Missing" : Math.round(latestTrendRow.amc).toLocaleString()}</strong>
            <small>Average monthly consumption</small>
          </div>
          <div>
            <span>Current stock status</span>
            <strong className={`stock-status-text ${latestTrendRow?.status.tone}`}>{latestTrendRow?.status.label || "-"}</strong>
            <small>{stockMovement > 0 ? "SOH increased" : stockMovement < 0 ? "SOH reduced" : "SOH stable"} vs prior report</small>
          </div>
          <div>
            <span>Trend</span>
            <strong className={`stock-status-text ${productTrend.tone}`}>{productTrend.label}</strong>
            <small>{Math.abs(productTrend.delta).toFixed(1)} MOS movement</small>
          </div>
        </div>

        <div className="stock-trend-grid">
          <div className="panel span-2">
            <div className="panel-head">
              <div>
                <h2>MOS trend with stock policy bands</h2>
                <p>Green shows 2-4 MOS, red shows below 2 MOS, and orange shows stock above plan.</p>
              </div>
            </div>
            <MosBandChart rows={selectedTrendRows} />
            <div className="legend stock-legend"><span className="red">Understocked</span><span className="green">Optimal</span><span className="orange">Above 4 MOS</span></div>
          </div>
          <div className="panel">
            <h2>Status timeline</h2>
            <StatusTimeline rows={selectedTrendRows} />
          </div>
          <div className="panel span-2">
            <h2>Stock on hand vs AMC</h2>
            <StockConsumptionChart rows={selectedTrendRows} />
            <div className="stock-chart-legend"><span className="soh">Stock on hand</span><span className="amc">AMC</span></div>
          </div>
          <div className="panel">
            <h2>Expiry risk trend</h2>
            <p className="panel-copy">Proxy based on stock above 4 MOS and stock reductions between reports until true expiry and redistribution fields are loaded.</p>
            <ExpiryRiskTrend rows={selectedTrendRows} />
            <div className="expiry-legend"><span>At risk</span><span>Salvaged</span><span>Redistributed</span></div>
          </div>
        </div>

        <div className="stock-trend-lower">
          <div className="table-panel">
            <div className="table-headline">
              <div>
                <h2>Facility trend table</h2>
                <p>National product trend proxy shown until facility-month stock history is added to the public extract.</p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    {reports.slice(0, trendEndIndex + 1).map((report) => <th key={report.key}>{report.short}</th>)}
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {peerTrendRows.map((item) => (
                    <tr key={commodityKey(item)}>
                      <td><b>{item.code}</b> {item.item}<small>{item.category}</small></td>
                      {item.values.map((value, index) => <td key={`${item.code}-${index}`} className={trendStatus(value).tone}>{value === null || value === undefined ? "-" : formatMos(value)}</td>)}
                      <td><span className={`trend-pill ${item.direction.tone}`}>{item.direction.label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="stock-insights panel">
            <h2>Automatic insights</h2>
            <ul>
              {stockTrendInsights.map((insight) => <li key={insight}>{insight}</li>)}
            </ul>
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
            <span>AMI: <b>{amiFilter === "all" ? "All" : amiFilter === "missing" ? "Missing only" : "Present only"}</b></span>
            <span>MOS/TBD: <b>{tbdFilter === "all" ? "All" : tbdFilter === "tbd" ? "TBD only" : "Confirmed only"}</b></span>
            <span>SOH: <b>{sohFilter === "all" ? "All" : sohFilter === "zero" ? "Zero only" : sohFilter === "available" ? "Available only" : "Missing only"}</b></span>
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
          <select value={amiFilter} onChange={(event) => setAmiFilter(event.target.value)} aria-label="Filter by AMI status">
            <option value="all">All AMI</option>
            <option value="missing">Missing AMI only</option>
            <option value="present">AMI present only</option>
          </select>
          <select value={tbdFilter} onChange={(event) => setTbdFilter(event.target.value)} aria-label="Filter by MOS TBD status">
            <option value="all">All MOS</option>
            <option value="tbd">TBD MOS only</option>
            <option value="confirmed">MOS confirmed only</option>
          </select>
          <select value={sohFilter} onChange={(event) => setSohFilter(event.target.value)} aria-label="Filter by stock on hand status">
            <option value="all">All SOH</option>
            <option value="zero">Zero SOH only</option>
            <option value="available">SOH available only</option>
            <option value="missing">Missing SOH only</option>
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
