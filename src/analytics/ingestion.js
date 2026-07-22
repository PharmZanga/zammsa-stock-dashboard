import { parseCsv } from "./csv.js";

export function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned || /^(?:-|tbd|n\/a|na|null)$/i.test(cleaned)) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}
export function normalizeDate(value, { dateOrder = "DMY" } = {}) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return date.toISOString().slice(0, 10);
    }
  }
  const match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s|$)/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
    const month = dateOrder === "MDY" ? first : second;
    const day = dateOrder === "MDY" ? second : first;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return date.toISOString().slice(0, 10);
    }
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function field(row, schema, name) {
  const source = schema.columns?.[name] || name;
  return row[source];
}

function deduplicate(records, keyFor, issues) {
  const unique = new Map();
  for (const record of records) {
    const key = keyFor(record);
    if (unique.has(key)) issues.push({ type: "duplicate", key, action: "kept_last" });
    unique.set(key, record);
  }
  return [...unique.values()];
}

export function normalizeSnapshotRows(rows, schema = {}) {
  const issues = [];
  const records = [];
  rows.forEach((row, index) => {
    const sku = String(field(row, schema, "sku") ?? "").trim();
    const date = normalizeDate(field(row, schema, "date"), schema);
    if (!sku || !date) {
      issues.push({ type: "invalid_snapshot", row: index + 2, reason: !sku ? "missing_sku" : "invalid_date" });
      return;
    }
    records.push({
      sku,
      description: String(field(row, schema, "description") ?? "").trim(),
      programme: String(field(row, schema, "programme") ?? "Unclassified").trim() || "Unclassified",
      location: String(field(row, schema, "location") ?? schema.defaultLocation ?? "Central").trim() || "Central",
      date,
      stockOnHand: parseNumber(field(row, schema, "stockOnHand")),
      ami: parseNumber(field(row, schema, "ami")),
      mos: parseNumber(field(row, schema, "mos")),
      unitCost: parseNumber(field(row, schema, "unitCost")),
      comment: String(field(row, schema, "comment") ?? "").trim(),
      sourceRow: index + 2,
    });
  });
  return {
    records: deduplicate(records, (record) => `${record.date}|${record.sku}|${record.location}`, issues),
    issues,
  };
}

export function normalizeMovementRows(rows, schema = {}) {
  const issues = [];
  const records = [];
  rows.forEach((row, index) => {
    const sku = String(field(row, schema, "sku") ?? "").trim();
    const date = normalizeDate(field(row, schema, "date"), schema);
    const quantity = parseNumber(field(row, schema, "quantity"));
    const transactionType = String(field(row, schema, "transactionType") ?? schema.defaultTransactionType ?? "outbound").trim().toLowerCase();
    if (!sku || !date || quantity === null) {
      issues.push({ type: "invalid_movement", row: index + 2, reason: !sku ? "missing_sku" : !date ? "invalid_date" : "invalid_quantity" });
      return;
    }
    records.push({
      transactionId: String(field(row, schema, "transactionId") ?? `${date}-${sku}-${index + 2}`).trim(),
      sku,
      description: String(field(row, schema, "description") ?? "").trim(),
      location: String(field(row, schema, "location") ?? schema.defaultLocation ?? "Central").trim() || "Central",
      date,
      transactionType,
      quantity: Math.abs(quantity),
      batch: String(field(row, schema, "batch") ?? "").trim(),
      expiryDate: normalizeDate(field(row, schema, "expiryDate"), schema),
      unitCost: parseNumber(field(row, schema, "unitCost")),
      sourceRow: index + 2,
    });
  });
  return {
    records: deduplicate(records, (record) => `${record.transactionId}|${record.sku}|${record.location}`, issues),
    issues,
  };
}

export function ingestSnapshotsCsv(text, schema = {}) {
  return normalizeSnapshotRows(parseCsv(text, schema.csv), schema);
}

export function ingestMovementsCsv(text, schema = {}) {
  return normalizeMovementRows(parseCsv(text, schema.csv), schema);
}
