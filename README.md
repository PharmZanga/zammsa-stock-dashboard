# ZAMMSA Stock Status Dashboard

Public review dashboard for ZAMMSA Central stock status reports.

The dashboard currently summarizes three reporting periods:

- 31 March 2026
- 15 April 2026
- 30 April 2026

It highlights stockout trends, near-critical commodities, overstock, AMI/TBD data gaps, programme pressure, and management concerns inferred from the reports.

## Development

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

This repository includes a GitHub Actions workflow that builds the Vite app and deploys the `dist` folder to GitHub Pages.
