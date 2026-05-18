import { useMemo, useState } from "react";
import { categories, commodityHistory, managementConcerns, programmePressure, reports, trend } from "./zammsaData.js";

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

  const start = Math.min(rangeStart, rangeEnd);
  const end = Math.max(rangeStart, rangeEnd);
  const selectedReport = reports[end].key;
  const selectedTrend = trend[end];
  const previousTrend = trend[end - 1];
  const filteredTrend = trend.slice(start, end + 1);
  const categoryRisks = programmePressure[selectedReport] || [];

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
    return commodityHistory
      .map((item) => ({ ...item, status: classify(item.mos[end]) }))
      .filter((item) => item.present[end])
      .filter((item) => !q || `${item.code} ${item.item} ${item.category}`.toLowerCase().includes(q))
      .filter((item) => statusFilter === "all" || item.status.tone === statusFilter)
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .sort((a, b) => a.status.rank - b.status.rank || (a.mos[end] ?? 99999) - (b.mos[end] ?? 99999))
      .slice(0, 160);
  }, [end, query, statusFilter, categoryFilter]);

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
        </div>
      </section>

      <section className="control-strip">
        <div className="mode-tabs">
          <button className={view === "latest" ? "active" : ""} type="button" onClick={() => setView("latest")}>Command view</button>
          <button className={view === "historic" ? "active" : ""} type="button" onClick={() => setView("historic")}>Trend view</button>
        </div>
        <div className="range-control">
          <label>From <span>{reports[start].short}</span><input type="range" min="0" max={reports.length - 1} value={rangeStart} onChange={(event) => setRangeStart(Number(event.target.value))} /></label>
          <label>To <span>{reports[end].short}</span><input type="range" min="0" max={reports.length - 1} value={rangeEnd} onChange={(event) => setRangeEnd(Number(event.target.value))} /></label>
        </div>
      </section>

      <section className="stats-grid">
        <Stat label="Critical stockouts" value={selectedTrend.critical} tone="red" sub={`${pct(selectedTrend.critical, previousTrend?.critical)} vs prior report`} active={statusFilter === "red"} onClick={() => setStatus("red")} />
        <Stat label="Near-critical" value={selectedTrend.near} tone="amber" sub="More than 0.1 and below 1 MOS" active={statusFilter === "amber"} onClick={() => setStatus("amber")} />
        <Stat label="Overstocked" value={selectedTrend.over} tone="blue" sub="Above 24 months of stock" active={statusFilter === "blue"} onClick={() => setStatus("blue")} />
        <Stat label="AMI/TBD gaps" value={selectedTrend.gaps} tone="green" sub="Rows requiring data-quality follow-up" active={statusFilter === "neutral"} onClick={() => setStatus("neutral")} />
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
