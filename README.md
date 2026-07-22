# ZAMMSA Stock Status Dashboard

Public Central-warehouse stock intelligence dashboard for ZAMMSA stock-status and weekly availability reports.

## Analytics capability

The Management Analytics view combines Central stock snapshots with configured transaction CSVs to produce:

- Current stock on hand, MOS and days of supply
- Understock, adequate, overstock, excess and stagnant-stock flags
- Historical stockout frequency and inventory turnover
- Explainable exponential-smoothing demand forecasts with confidence ranges
- Expected stockout dates
- Safety stock, reorder point and recommended order quantity
- Inventory value and carrying-cost estimates when unit cost is available
- Backtested MAE and WAPE forecast-accuracy measures
- Historical "as of" analysis for every available Central report date, using only data available up to the selected date
- Dynamic LAB versus EM/medicines and programme filters, including ART, malaria, TB, reproductive health and other mapped programmes
- A date-aware analyst narrative comparing the selected snapshot with the immediately preceding report
- Structured output in `src/analyticsReport.js` and an exportable management CSV

The official policy is:

| Status | Months of stock |
| --- | ---: |
| Understocked | Below 2 MOS |
| Adequate | 2–4 MOS |
| Overstocked | Above 4 MOS |
| Excess | Above 12 MOS |

Forecasting is initially limited to the Central warehouse. Outbound movements are preferred as the consumption signal. When they are not configured, historical Average Monthly Issue (AMI) is used as an explicitly labelled planning proxy.

## Data configuration

Configure file paths, column mappings, date order and planning assumptions in `config/analytics.json`.

Both snapshot and movement paths are optional. Without a snapshot CSV, the builder uses the existing `src/zammsaHistory.js` Central history.

Canonical snapshot fields:

```text
SKU, description, programme, location, snapshot date,
stock on hand, average monthly issue, months of stock,
unit cost, comment
```

Canonical movement fields:

```text
transaction ID, SKU, description, location, transaction date,
transaction type, quantity, batch, expiry date, unit cost
```

CSV ingestion handles UTF-8 BOMs, quoted commas/newlines, blank values, `TBD`, numeric commas, Excel serial dates, DMY/MDY date formats and duplicate keys. Duplicate snapshot or transaction keys retain the last record and produce an ingestion issue.

## Metrics

- **Days of supply:** stock on hand divided by forecast daily consumption.
- **Safety stock:** service-level factor × demand standard deviation × square root of lead time in months.
- **Reorder point:** forecast lead-time demand plus safety stock.
- **Recommended order quantity:** quantity required to reach the configured target cover after current stock, before pipeline, pack-size and ordering-constraint adjustments.
- **Turnover:** annualised forecast demand divided by average historical stock.
- **Stockout frequency:** stockout observations divided by available historical observations.
- **Carrying cost:** current inventory value multiplied by the configured annual carrying-cost rate.
- **Forecast WAPE:** total absolute forecast error divided by total actual demand in the backtest window.

## Commands

```bash
npm ci
npm test
npm run analytics:build
npm run standalone:build
npm run dev
```

The production build runs the analytics builder and standalone-dashboard rebuild automatically:

```bash
npm run build
```

Use another configuration file with:

```bash
node tools/build_analytics.mjs --config=path/to/analytics.json
```

## Forecast upgrade path

The forecasting strategy is isolated in `src/analytics/forecasting.js`. A future ARIMA, ETS or Prophet implementation can replace the current forecaster without rewriting ingestion, stock analysis or reporting.

Forecast quality will improve materially when the following are available:

- At least 12–24 months of issue/dispensing transactions
- Supplier and lane-specific lead times
- Supplier reliability and fill-rate history
- Confirmed pipeline receipts and purchase orders
- Pack-size and unit-of-measure conversions
- Batch-level expiry dates
- Unit costs and annual carrying-cost assumptions
- Campaign, outbreak, promotion or programme-scale-up calendars

## Deployment

GitHub Pages publishes `index.html` directly. Render uses `npm run build` and automatically deploys commits to `main`.
