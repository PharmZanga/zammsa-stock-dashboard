import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

import pdfplumber


CODE_RE = re.compile(r"^[A-Z]{2,}\d{3,4}$")
TONE_BY_CATEGORY = {
    "Laboratory Services": "red",
    "Other Essential Medicines": "amber",
    "Medical Supplies": "amber",
    "Dental": "green",
    "Renal": "amber",
    "Anti-TB Medicines": "red",
    "Epidemic / PPE Supplies": "green",
    "Anti-Malarials": "green",
}


def load_js_export(path, export_name):
    text = path.read_text(encoding="utf-8")
    marker = f"export const {export_name} ="
    start = text.index(marker) + len(marker)
    remaining = text[start:]
    end_export = remaining.find("\nexport const ")
    literal = remaining[: end_export if end_export >= 0 else None].strip().rstrip(";")
    return json.loads(literal)


def clean_cell(value):
    return " ".join((value or "").replace("\n", " ").split())


def parse_number(value):
    cleaned = clean_cell(value).replace(",", "").replace(" ", "")
    if cleaned in {"", "-", "TBD"}:
        return None
    return float(cleaned)


def is_number_cell(value):
    cleaned = clean_cell(value).replace(",", "").replace(" ", "")
    return cleaned in {"", "-", "TBD"} or bool(re.fullmatch(r"-?\d+(?:\.\d+)?", cleaned))


def fallback_category(section, code):
    section_lower = section.lower()
    if "anti-malar" in section_lower:
        return "Anti-Malarials"
    if "anti-tb" in section_lower:
        return "Anti-TB Medicines"
    if "art programme" in section_lower:
        return "National ART Programme"
    if "hiv test" in section_lower:
        return "HIV Test Kits"
    if "reproductive" in section_lower:
        return "Reproductive Health"
    if "peritonial" in section_lower or code.startswith("RN"):
        return "Renal"
    if "dental" in section_lower or code.startswith("DEN"):
        return "Dental"
    if code.startswith(("MS", "SUT")):
        return "Medical Supplies"
    if code.startswith("LAB"):
        return "Laboratory Services"
    if code.startswith(("EPS", "PC")):
        return "Epidemic / PPE Supplies"
    if code.startswith("IMAG"):
        return "Imaging"
    if code.startswith("CAN"):
        return "Oncology"
    return "Other Essential Medicines"


def parse_pdf_rows(path, report_key, report_label, category_by_code):
    rows = []
    section = ""
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for cells in table:
                    if len(cells) != 6:
                        continue
                    code = clean_cell(cells[0])
                    if not CODE_RE.fullmatch(code):
                        if code and code != "Ordering Code" and not code.startswith("ZAMMSA Central"):
                            section = code
                        continue
                    item = clean_cell(cells[1])
                    ami_cell = clean_cell(cells[2])
                    # A few long descriptions cross the visual boundary into the AMI cell.
                    # In those rows the overflow ends with the source AMI dash.
                    if not is_number_cell(ami_cell) and ami_cell.endswith("-"):
                        overflow = ami_cell[:-1].strip()
                        joiner = " "
                        if item.endswith("(") or re.match(r"^\d+\s*\)", overflow):
                            joiner = ""
                        elif item and overflow and item[-1].isalnum() and overflow[0].islower():
                            joiner = ""
                        item = clean_cell(f"{item}{joiner}{overflow}")
                        item = re.sub(r"\(\s+", "(", item)
                        item = re.sub(r"\s+\)", ")", item)
                        ami_cell = "-"
                    ami = parse_number(ami_cell)
                    stock_on_hand = parse_number(cells[3])
                    mos = parse_number(cells[4])
                    source_mos = clean_cell(cells[4]).upper()
                    comment = clean_cell(cells[5])
                    if source_mos == "TBD" and "TBD" not in comment.upper():
                        comment = f"TBD{'; ' + comment if comment else ''}"
                    rows.append(
                        {
                            "code": code,
                            "item": item,
                            "category": category_by_code.get(code, fallback_category(section, code)),
                            "ami": ami,
                            "stockOnHand": stock_on_hand,
                            "mos": mos,
                            "comment": comment,
                            "reportDate": report_key,
                            "reportLabel": report_label,
                        }
                    )
    return rows


def summarize(rows, report_key, report_label, report_short):
    return {
        "key": report_key,
        "label": report_label,
        "short": report_short,
        "total": len(rows),
        "critical": sum(row["mos"] is not None and row["mos"] < 2 for row in rows),
        "near": sum(row["mos"] is not None and 2 <= row["mos"] < 4 for row in rows),
        "over": sum(row["mos"] is not None and row["mos"] > 6 for row in rows),
        "gaps": sum(row["mos"] is None for row in rows),
        "amiMissing": sum(row["ami"] is None for row in rows),
        "tbdMos": sum(row["mos"] is None for row in rows),
    }


def category_summary(rows):
    grouped = defaultdict(lambda: {"total": 0, "risk": 0, "stockout": 0, "tbd": 0})
    first_seen = {}
    for index, row in enumerate(rows):
        category = row["category"]
        first_seen.setdefault(category, index)
        grouped[category]["total"] += 1
        grouped[category]["risk"] += row["mos"] is not None and row["mos"] < 2
        grouped[category]["stockout"] += row["mos"] == 0
        grouped[category]["tbd"] += row["mos"] is None
    values = [{"name": name, **stats} for name, stats in grouped.items() if stats["risk"]]
    return sorted(values, key=lambda row: (-row["risk"], first_seen[row["name"]]))[:12]


def programme_pressure(categories):
    return [
        {
            "label": row["name"],
            "value": row["risk"],
            "tone": TONE_BY_CATEGORY.get(row["name"], "green"),
        }
        for row in categories[:8]
    ]


def write_data_file(path, reports, trend, pressure, categories, concerns, commodity_history):
    exports = [
        ("reports", reports),
        ("trend", trend),
        ("programmePressure", pressure),
        ("categories", categories),
        ("managementConcerns", concerns),
        ("commodityHistory", commodity_history),
    ]
    path.write_text(
        "".join(f"export const {name} = {json.dumps(value, indent=2)};\n" for name, value in exports),
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser(description="Update the dashboard from a ZAMMSA central stock PDF.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--date", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--short", required=True)
    args = parser.parse_args()

    history_path = Path("src/zammsaHistory.js")
    data_path = Path("src/zammsaData.js")
    history = load_js_export(history_path, "stockHistory")
    category_by_code = {}
    for row in history:
        category_by_code.setdefault(row["code"], row["category"])

    latest_rows = parse_pdf_rows(args.pdf, args.date, args.label, category_by_code)
    # Central reports vary as programme lines are added or removed. Keep the
    # guard below the verified 690-row July report while still catching a
    # partial-page/table extraction failure.
    if len(latest_rows) < 650:
        raise ValueError(f"Expected at least 650 commodity rows, extracted {len(latest_rows)}")
    duplicate_codes = sorted(code for code in {row["code"] for row in latest_rows} if sum(r["code"] == code for r in latest_rows) > 1)
    if duplicate_codes:
        raise ValueError(f"Duplicate ordering codes in report: {', '.join(duplicate_codes)}")

    history = [row for row in history if row["reportDate"] != args.date] + latest_rows
    history_path.write_text(f"export const stockHistory = {json.dumps(history, indent=2)};\n", encoding="utf-8")

    reports = [row for row in load_js_export(data_path, "reports") if row["key"] != args.date]
    reports.append({"key": args.date, "label": args.label, "short": args.short})
    reports.sort(key=lambda row: row["key"])

    trend_row = summarize(latest_rows, args.date, args.label, args.short)
    trend = [row for row in load_js_export(data_path, "trend") if row["key"] != args.date] + [trend_row]
    trend.sort(key=lambda row: row["key"])

    categories = category_summary(latest_rows)
    latest_pressure = programme_pressure(categories)
    pressure = load_js_export(data_path, "programmePressure")
    pressure[args.date] = latest_pressure

    concerns = load_js_export(data_path, "managementConcerns")
    zero_mos = sum(row["mos"] == 0 for row in latest_rows)
    concerns = [
        {
            "title": f"{trend_row['critical']} commodities below 2 months of stock",
            "severity": "High",
            "evidence": f"Latest programme pressure on {args.label} is concentrated in "
            + ", ".join(f"{row['label']} ({row['value']})" for row in latest_pressure[:5])
            + ".",
            "action": concerns[0]["action"],
        },
        {
            "title": f"{zero_mos} commodities displayed at 0.0 MOS",
            "severity": "High",
            "evidence": f"The {args.label} central report lists {zero_mos} ordering codes with zero months of stock.",
            "action": concerns[1]["action"],
        },
        {
            "title": f"{trend_row['tbdMos']} rows still have TBD months of stock",
            "severity": "Medium",
            "evidence": f"{trend_row['amiMissing']} rows have missing AMI and {trend_row['tbdMos']} rows have TBD or missing MOS in the {args.label} report.",
            "action": concerns[2]["action"],
        },
    ]

    commodity_history = load_js_export(data_path, "commodityHistory")
    write_data_file(data_path, reports, trend, pressure, categories, concerns, commodity_history)
    print(json.dumps({"rows": len(latest_rows), "trend": trend_row, "categories": categories, "pressure": latest_pressure}, indent=2))


if __name__ == "__main__":
    main()
