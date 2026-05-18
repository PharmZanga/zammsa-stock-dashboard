import { useMemo, useState } from "react";
import { categories, commodityHistory, managementConcerns, programmePressure, reports, trend } from "./zammsaData.js";

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

function Stat({ label, value, tone, sub }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function Badge({ status }) {
  return <span className={`badge badge-${status.tone}`}>{status.label}</span>;
}

function MiniTrend({ points, valueKey, tone }) {
  const max = Math.max(...points.map((point) => point[valueKey]), 1);
  return (
    <div className="mini-trend">
      {points.map((point) => (
        <div className="mini-point" key={`${valueKey}-${point.key}`}>
          <div className={`mini-bar ${tone}`} style={{ height: `${28 + (point[valueKey] / max) * 80}px` }} />
          <b>{point[valueKey]}</b>
          <span>{point.short}</span>
        </div>
      ))}
    </div>
  );
}

function RiskBars({ data }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="bars">
      {data.map((item) => (
        <div className="bar-row" key={item.label}>
          <span>{item.label}</span>
          <div className="bar-track">
            <div className={`bar-fill ${item.tone}`} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <b>{item.value}</b>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [selectedReport, setSelectedReport] = useState("2026-04-30");
  const [view, setView] = useState("latest");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const selectedMeta = reports.find((report) => report.key === selectedReport) || reports.at(-1);
  const selectedIndex = reports.findIndex((report) => report.key === selectedReport);
  const selectedTrend = trend.find((item) => item.key === selectedReport) || trend.at(-1);
  const previousTrend = trend[trend.findIndex((item) => item.key === selectedReport) - 1];
  const categoryRisks = programmePressure[selectedReport] || [];

  const drilldown = useMemo(() => {
    const q = query.toLowerCase();
    return commodityHistory
      .map((item) => ({ ...item, status: classify(item.mos[selectedIndex]) }))
      .filter((item) => item.present[selectedIndex])
      .filter((item) => !q || `${item.code} ${item.item} ${item.category}`.toLowerCase().includes(q))
      .filter((item) => statusFilter === "all" || item.status.tone === statusFilter)
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .sort((a, b) => a.status.rank - b.status.rank || (a.mos[selectedIndex] ?? 99999) - (b.mos[selectedIndex] ?? 99999))
      .slice(0, 160);
  }, [selectedIndex, query, statusFilter, categoryFilter]);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">ZAMMSA Commodity Stock Control</p>
          <h1>Historic stock status dashboard</h1>
          <p className="lede">Public review view showing biweekly risk trends, programme pressure, and management concerns from central stock reports.</p>
        </div>
        <div className="report-card">
          <span>Current report</span>
          <strong>{selectedMeta.label}</strong>
          <small>{selectedTrend.total.toLocaleString()} extracted commodity rows across the selected report.</small>
        </div>
      </section>

      <section className="control-strip">
        <div className="mode-tabs">
          <button className={view === "latest" ? "active" : ""} type="button" onClick={() => setView("latest")}>Latest view</button>
          <button className={view === "historic" ? "active" : ""} type="button" onClick={() => setView("historic")}>Historic trend</button>
        </div>
        <select value={selectedReport} onChange={(event) => setSelectedReport(event.target.value)}>
          {reports.map((report) => <option key={report.key} value={report.key}>{report.label}</option>)}
        </select>
      </section>

      <section className="stats-grid">
        <Stat label="Critical stockouts" value={selectedTrend.critical} tone="red" sub={`${pct(selectedTrend.critical, previousTrend?.critical)} vs prior report`} />
        <Stat label="Near-critical" value={selectedTrend.near} tone="amber" sub="More than 0.1 and below 1 MOS" />
        <Stat label="Overstocked" value={selectedTrend.over} tone="blue" sub="Above 24 months of stock" />
        <Stat label="AMI/TBD gaps" value={selectedTrend.gaps} tone="green" sub="Rows requiring data-quality follow-up" />
      </section>

      {view === "historic" && (
        <section className="timeline-grid">
          <div className="panel"><h2>Critical stockouts over time</h2><MiniTrend points={trend} valueKey="critical" tone="red" /></div>
          <div className="panel"><h2>Near-critical over time</h2><MiniTrend points={trend} valueKey="near" tone="amber" /></div>
          <div className="panel"><h2>Overstock over time</h2><MiniTrend points={trend} valueKey="over" tone="blue" /></div>
          <div className="panel"><h2>Data gaps over time</h2><MiniTrend points={trend} valueKey="gaps" tone="green" /></div>
        </section>
      )}

      <section className="workspace-grid">
        <div className="panel span-2">
          <div className="panel-head"><div><h2>Programme pressure</h2><p>Selected-report commodities currently stocked out or near-critical.</p></div></div>
          <RiskBars data={categoryRisks} />
        </div>
        <div className="panel">
          <h2>Public sharing note</h2>
          <p className="panel-copy">This view focuses on counts, movements, categories, and management actions. Raw stock-on-hand and AMI values are intentionally excluded from the public drilldown.</p>
        </div>
      </section>

      <section className="concerns-section">
        <div className="section-head"><div><p className="eyebrow dark">Management Concerns</p><h2>Concerns inferred from report signals</h2></div></div>
        <div className="concerns-grid">
          {managementConcerns.map((concern) => (
            <article className={`concern concern-${concern.tone}`} key={concern.title}>
              <div><span>{concern.severity}</span><small>{concern.programme}</small></div>
              <h3>{concern.title}</h3>
              <p>{concern.evidence}</p>
              <b>{concern.action}</b>
            </article>
          ))}
        </div>
      </section>

      <section className="table-panel">
        <div className="table-tools">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, commodity, or category" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option><option value="red">Stockout</option><option value="amber">Near-critical</option><option value="blue">Overstock</option><option value="green">Adequate</option><option value="neutral">Data gap</option>
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Code</th><th>Commodity</th><th>Category</th>{reports.map((report) => <th key={report.key}>{report.short} MOS</th>)}<th>Latest status</th></tr></thead>
            <tbody>
              {drilldown.map((item) => (
                <tr key={item.code}>
                  <td className="code">{item.code}</td><td>{item.item}</td><td>{item.category}</td>
                  {reports.map((report, index) => <td key={`${item.code}-${report.key}`} className={classify(item.mos[index]).tone}>{item.present[index] ? formatMos(item.mos[index]) : "-"}</td>)}
                  <td><Badge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default App;
