"""Current NOAA research USV positions, published under CC0-1.0.

No work runs on import. This adapter queries a fixed reviewed set of public
2026 hurricane mission datasets. It never invents positions or turns retrieval
time into observation time. Data older than 24 hours are omitted.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
import math
import time
from urllib.request import HTTPRedirectHandler, Request, build_opener


BASE_URL = "https://data.pmel.noaa.gov/pmel/erddap"
MISSION_URL = "https://www.pmel.noaa.gov/usv-hurricane/"
TIMEOUT_SECONDS = 15
MAX_RESPONSE_BYTES = 65_536
MAX_AGE_SECONDS = 24 * 60 * 60
DATASETS = tuple(
    (f"oshenPD{number}_hurricane_2026", f"Oshen PD{number}", "Oshen USV")
    for number in range(11, 24)
) + tuple(
    (f"sd{number}_hurricane_2026", f"Saildrone {number}", "Saildrone USV")
    for number in (1030, 1040, 1045, 1057, 1068, 1069, 1074, 1083, 1084, 1091)
)

NOAA_ATTRIBUTION = {
    "name": "NOAA AOML / PMEL hurricane research missions",
    "url": MISSION_URL,
    "license": "CC0-1.0",
    "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
    "license_evidence_url": (
        BASE_URL + "/info/oshenPD11_hurricane_2026/index.html"
    ),
    "data_nature": "Latest published measured position; may be delayed",
    "scope": "Reviewed 2026 hurricane research uncrewed surface vehicles",
}


class _NoRedirect(HTTPRedirectHandler):
    """Only the fixed HTTPS endpoints are permitted; fail on redirects."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _endpoint(dataset_id):
    # Dataset IDs come solely from DATASETS; never from user-controlled input.
    if dataset_id not in {item[0] for item in DATASETS}:
        raise ValueError("Unreviewed NOAA dataset")
    return (
        f"{BASE_URL}/tabledap/{dataset_id}.json"
        '?time,latitude,longitude&orderByMax(%22time%22)'
    )


def _fetch_json(url):
    request = Request(url, headers={
        "User-Agent": "DRONE-MAPPER/1.0 (public NOAA research positions)",
        "Accept": "application/json",
    })
    with build_opener(_NoRedirect()).open(request, timeout=TIMEOUT_SECONDS) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise ValueError("NOAA response exceeds size limit")
        return json.loads(raw)


def _position(payload, dataset, now):
    dataset_id, name, model = dataset
    if not isinstance(payload, dict):
        raise ValueError("Malformed NOAA response")
    table = payload.get("table", {})
    if not isinstance(table, dict):
        raise ValueError("Malformed NOAA response table")
    if table.get("columnNames") != ["time", "latitude", "longitude"]:
        raise ValueError("Unexpected NOAA position columns")
    if table.get("columnUnits") != ["UTC", "degrees_north", "degrees_east"]:
        raise ValueError("Unexpected NOAA position units")
    rows = table.get("rows")
    if not isinstance(rows, list) or len(rows) > 100:
        raise ValueError("Unexpected NOAA position row count")
    positions = []
    for row in rows:
        if not isinstance(row, list) or len(row) != 3:
            raise ValueError("Malformed NOAA position row")
        timestamp, latitude, longitude = row
        if (not isinstance(timestamp, str)
                or not timestamp.endswith("Z")
                or isinstance(latitude, bool) or isinstance(longitude, bool)
                or not isinstance(latitude, (float, int))
                or not isinstance(longitude, (float, int))):
            continue
        observed_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).timestamp()
        if not all(math.isfinite(v) for v in (observed_at, latitude, longitude)):
            continue
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            continue
        if now - observed_at > MAX_AGE_SECONDS or observed_at - now > 5:
            continue
        positions.append({
            "id": "noaa:pmel:" + dataset_id,
            "kind": "surface-vessel",
            "domain": "water",
            "name": name,
            "model": model,
            "operator": "NOAA AOML / PMEL mission",
            "purpose": "research",
            "latitude": latitude,
            "longitude": longitude,
            "observed_at": observed_at,
            "record_type": "position",
            "source": "NOAA AOML / PMEL",
            "source_url": f"{BASE_URL}/tabledap/{dataset_id}.html",
            "evidence_url": MISSION_URL,
            "license": "CC0-1.0",
            "precision": "Measured position",
            "status": "observed",
        })
    return max(positions, key=lambda item: item["observed_at"]) if positions else None


def fetch_noaa(*, now=None, diagnostics=None):
    """Return recent measured positions; raise if every dataset request fails.

    Pass a dictionary as diagnostics to receive partial-failure/freshness counts.
    A successful empty result means no valid observations within 24 hours.
    Poll this function from the site's existing collector, not each visitor.
    """
    now = time.time() if now is None else float(now)
    if not math.isfinite(now):
        raise ValueError("Invalid current time")

    def fetch(dataset):
        try:
            record = _position(_fetch_json(_endpoint(dataset[0])), dataset, now)
            return record, None
        except (OSError, ValueError, TypeError, KeyError) as error:
            return None, f"{dataset[0]}: {type(error).__name__}"

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(fetch, DATASETS))
    records = [record for record, error in results if record is not None]
    errors = [error for record, error in results if error is not None]
    if diagnostics is not None:
        diagnostics.update({
            "source": "noaa",
            "datasets_requested": len(DATASETS),
            "datasets_failed": len(errors),
            "positions": len(records),
            "without_recent_valid_position": len(DATASETS) - len(errors) - len(records),
            "checked_at": now,
            "latest_observed_at": max((item["observed_at"] for item in records), default=None),
            "errors": errors,
        })
    if len(errors) == len(DATASETS):
        raise RuntimeError("All NOAA position requests failed")
    return sorted(records, key=lambda item: item["id"])
