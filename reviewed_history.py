"""Dated operational milestones; reference areas are never aircraft positions."""
from datetime import date
import json
from pathlib import Path
import re

from data_sources import finite, https


def normalize_history(payload):
    records = []
    seen = set()
    reviewed = date.fromisoformat(payload["reviewed_at"])
    for event in payload["events"]:
        stamp = event["date"]
        if not re.fullmatch(r"\d{4}(?:-\d{2}(?:-\d{2})?)?", stamp):
            raise ValueError("Invalid historical date")
        earliest = date.fromisoformat(stamp + {4: "-01-01", 7: "-01", 10: ""}[len(stamp)])
        if earliest > reviewed or event["id"] in seen or not https(event["evidence_url"]):
            raise ValueError("Unreviewed, duplicate or future history")
        if not finite(event["latitude"], -90, 90) or not finite(event["longitude"], -180, 180):
            raise ValueError("Invalid historical reference point")
        if (event["kind"], event["domain"]) not in {("drone", "air"), ("delivery-robot", "ground"), ("autonomous-vehicle", "ground")}:
            raise ValueError("Unsupported historical device class")
        seen.add(event["id"])
        record = {key: event[key] for key in ("name", "manufacturer", "model", "operator",
            "kind", "domain", "purpose", "place", "latitude", "longitude", "summary", "evidence_url")}
        record.update(id="milestone:" + event["id"], record_type="historical",
            status="documented-milestone", first_year=earliest.year, record_dates=stamp,
            observed_at=None, position_basis="reported-area",
            precision="Historical city/region reference; not a vehicle position",
            source="milestones", source_url=event["evidence_url"],
            verification="Dated operator report; continued operation not inferred",
            reviewed_at=payload["reviewed_at"])
        records.append(record)
    return records


def fetch_history():
    return normalize_history(json.loads((Path(__file__).parent / "docs/reviewed-history.json").read_text()))
