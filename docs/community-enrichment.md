# Community research review — 21 October 2026

Church of Malware / saviorSEC reviewed all **152 files** in the updated collection:
23 new, 30 changed and 99 unchanged since the previous review. JSON, CSV, YAML,
vendor dossiers, protocol notes, domain lists and helper scripts were checked.
The internal-only research documents and scripts are not redistributed.

## Included

- **12 additional accepted FAA declarations**, independently retrieved with their
  revision-specific serial allocations. They add 22 rules and 12 combinations:
  Harris Aerial Carrier H6/H8E, Amazon MK27-2/MK30, DeltaQuad Evo, five XAG models,
  and two ZERO ZERO ROBOTICS models. The complete shared catalog now contains
  **3,738 rules / 141 manufacturer-model-aircraft/module combinations**. Android,
  desktop and server use the same rules. Sparse serial ranges retain their holes.
- **14 dated activity references**, bringing the reviewed layer to **40 records
  across 20 countries**. Seven cover robots: ANYmal at Northern Lights, Onkalo,
  BASF, Kårstø and railCare, plus Spot trials in Bishan and Changi. Seven cover
  autonomous vehicles: the Dallas–Houston Aurora corridor, May Mobility in Grand
  Rapids, Toyota/May Mobility in Miyawaka, and WeRide in Sentosa, Marina Coastal
  Drive and the Esplanade. These are dated regional references, not live locations
  or a count of individual vehicles. Supervised trials remain described as such.
- **A conservative CyberDog BLE candidate matcher**, independently implemented
  from manufacturer-published advertisement values. It appears in the scanner
  list/radar, supports separate optional area sharing and Android offline trip
  uploads, and remains explicitly unconfirmed. [Protocol and test status](robot-signals.md).

Primary evidence, dates and review decisions are retained in the
[FAA review](faa-enrichment-review.json) and [historical review](reviewed-history.json).
The historical adapter runs in the existing collection cycle. Refreshing it does
not change an event's original date or discover new articles automatically.

## Checked but not imported as detections

| Material | Decision |
| --- | --- |
| 226 FAA source rows / 204 distinct tracking IDs | Duplicated manufacturer files are deduplicated by tracking ID. Only additional accepted RID evidence extends the catalog. |
| Aggregated serial prefixes | Min/max aggregation can cross model boundaries, gaps and certification types. Exact verified allocations are used instead. |
| 37 OUI prefixes | Already present in the shared IEEE lookup. Radio registrants do not prove autonomy, model or ownership. |
| 105 RF rows and FCC filings | Useful receiver research; supported bands alone do not identify a device. GNSS reception and 77 GHz vehicle radar are not HackRF drone decoders. |
| 18 regulatory registry references | Identity/certification research, not live flight feeds. |
| Four counter-UAS program rows | Missing event coordinates and malformed column alignment; no map pins created. |
| Vendor cloud/domain lists | No newly verified public live-position feed. Internal fleet, login and MQTT endpoints are not connected. |
| Generic robot signatures | Shared BLE UUIDs, ports and broad SSID/OUI patterns are insufficient; only the documented three-field CyberDog combination was added. |
| Source helper scripts | Reviewed without execution. Their broad refresh/git operations and permissive parser were not adopted. |

Two domain-attribution issues were caught: `delair.com` belongs to an unrelated
HVAC business, and the listed `primoco.com` hosts were not established as the UAV
manufacturer. They do not create vendor links or deployment points.

Existing five-minute sources, including DEPLOY and AV Map, continue providing
their reviewed deployment/service data. This collection adds no new external live
telemetry feed or universal ground-vehicle radio decoder. See
[sources and reception](source-reception-review.md) for collection behavior.
