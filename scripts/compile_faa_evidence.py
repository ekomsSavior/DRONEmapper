#!/usr/bin/env python3
"""Compile reviewed FAA public evidence into bounded, exact identification rules.

Input is the sanitized public declaration export described in
docs/research-enrichment.md. This command does not fetch, deploy or publish.
"""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import re

ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"
ROOT = Path(__file__).resolve().parents[1]


def valid_serial(text):
    return bool(re.fullmatch(r"[0-9A-HJ-NP-Z]{6,20}", text)
                and text[4] in "0123456789ABCDEF"
                and int(text[4], 16) == len(text) - 5)


def ordinal(text):
    result = 0
    for char in text:
        result = result * len(ALPHABET) + ALPHABET.index(char)
    return result


def compact(values):
    """Losslessly choose CTA alphabet intervals or guarded decimal suffix runs."""
    values = sorted(set(values), key=lambda value: (len(value), value))
    alpha = []
    previous = None
    for value in values:
        number = ordinal(value)
        if previous is not None and len(value) == len(alpha[-1]["end"]) and number == previous + 1:
            alpha[-1]["end"] = value
        else:
            alpha.append({"start": value, "end": value})
        previous = number
    groups, decimal = defaultdict(list), []
    for value in values:
        match = re.fullmatch(r"(.*?)([0-9]+)", value)
        if match and len(match[1]) >= 5:
            groups[(match[1], len(match[2]))].append(int(match[2]))
        else:
            decimal.append({"start": value, "end": value})
    for (prefix, width), numbers in groups.items():
        last = None
        for number in sorted(numbers):
            value = prefix + str(number).zfill(width)
            if last is not None and number == last + 1:
                decimal[-1]["end"] = value
                decimal[-1]["decimal_suffix"] = width
            else:
                decimal.append({"start": value, "end": value})
            last = number
    return min((alpha, decimal), key=len)


def compile_declaration(record):
    if record.get("status") != "accepted" or record.get("docType") != "rid":
        raise ValueError("An accepted Remote ID declaration is required")
    kind = {1: "aircraft", 2: "module"}.get(record.get("certificationTypeId"))
    if not kind:
        raise ValueError("Unknown declaration category")
    explicit, singles, rejected = [], [], []
    allocations = {value for rev in record["revisions"] for value in rev["allocations"]}
    for value in sorted(allocations):
        parts = value.split("-")
        if len(parts) == 2 and all(valid_serial(x) for x in parts) and len(parts[0]) == len(parts[1]) and parts[0] <= parts[1]:
            explicit.append({"start": parts[0], "end": parts[1]})
        elif valid_serial(value):
            singles.append(value)
        else:
            rejected.append(value)
    common = dict(manufacturer=record["makeName"], model=record["modelName"],
                  device_type=kind, evidence_url=record["evidence_url"],
                  reviewed_at=record["reviewed_at"])
    return [dict(**rule, **common) for rule in explicit + compact(singles)], len(rejected)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path)
    parser.add_argument("--max-rules", type=int, default=2000)
    args = parser.parse_args()
    catalog = ROOT / "worker/rid-catalog.mjs"
    text = catalog.read_text()
    current = json.loads(re.search(r"export const rules\s*=\s*(\[.*\])\s*;", text, re.S)[1])
    known_docs = {r["evidence_url"] for r in current}
    report_path = ROOT / "docs/faa-enrichment-review.json"
    previous = json.loads(report_path.read_text()) if report_path.exists() else []
    report = {row["tracking"]: row for row in previous}
    added_count = 0
    for path in sorted(args.evidence.glob("RID*.json")):
        record = json.loads(path.read_text())
        summary = {key: record[key] for key in ("tracking", "makeName", "modelName", "evidence_url", "reviewed_at")}
        summary["revision_evidence"] = [{key: rev[key] for key in ("id", "sha256")} for rev in record["revisions"]]
        if record.get("status") != "accepted" or record.get("docType") != "rid":
            summary["decision"] = "excluded; not an accepted Remote ID declaration"
        elif record["evidence_url"] in known_docs:
            summary["decision"] = "already-catalogued declaration"
        else:
            rules, rejected = compile_declaration(record)
            summary.update(rule_count=len(rules), rejected_allocation_count=rejected)
            if len(rules) > args.max_rules:
                summary["decision"] = "deferred; individually assigned serial set exceeds bounded catalog budget"
            else:
                if rules:
                    current.extend(rules)
                    added_count += 1
                    known_docs.add(record["evidence_url"])
                    summary["decision"] = "included"
                else:
                    summary["decision"] = "deferred; no usable serial allocations"
        if summary["decision"] == "already-catalogued declaration" and report.get(record["tracking"], {}).get("decision") == "included":
            continue
        report[record["tracking"]] = summary
    # Stable deduplication preserves the evidence associated with each rule.
    current = list({json.dumps(r, sort_keys=True): r for r in current}.values())
    catalog.write_text("// FAA public serial allocations, reviewed evidence; identity remains unverified.\n"
                       "export const rules = " + json.dumps(current, separators=(",", ":")) + ";\n")
    report = sorted(report.values(), key=lambda row: row["tracking"])
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(f"{len(current)} rules; {added_count} additional declarations.")


if __name__ == "__main__":
    main()
