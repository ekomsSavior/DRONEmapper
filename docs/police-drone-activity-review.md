# Police drone activity from dispatch and public flight logs

Research reviewed 2026-10-21 for Church of Malware / saviorSEC.
Implementation: SFPD flight-log adapter and fourteen agency portal links. Complete live export validation passed October 22, 2026; both collectors produced the same 8,244 historical records.

## Findings

CrimeRadar combines public scanner feeds and other public-safety reports with automated transcription, summaries and incident mapping. Its website advertises a five-minute refresh. These are unconfirmed dispatch reports, not aircraft telemetry. Its FAQ does not name its upstream radio provider and says it does not offer public research access or data exports. No supported ingestion API was established in this review.

Sources: https://www.crimeradar.us/ and https://www.crimeradar.us/faq

CrimeRadar's terms section 7 restrict automated collection, republication and compiling its content into another service without permission. Use its workflow as a reference; do not configure it as a DRONEmapper feed without an appropriate data arrangement.

Source: https://www.crimeradar.us/terms

Broadcastify is a separate potential provider, not a verified CrimeRadar upstream. Its terms explicitly require a developer/commercial license for automated access, transcription, classification and redistribution, including noncommercial projects. The developer program distinguishes internal processing from public live-audio redistribution. A consumer listening subscription is insufficient. No subscription, contact, license acceptance or feed collection was performed.

Sources: https://www.broadcastify.com/terms/ and https://support.broadcastify.com/hc/en-us/articles/204740425-Live-Audio-Feed-Catalog-API-v-1-3-Documentation

## Priority sources

| Source | What was verified | Integration status |
| --- | --- | --- |
| Chula Vista PD / AirData | Official public flight-history portal; public flights delayed two hours. The portal states that addresses and flight paths do not precisely represent incident locations. | Evaluate a permitted structured export and stable flight IDs. Preserve flight time and publication delay; historical activity, not a current aircraft position. |
| Wichita PD / Skydio | City's transparency page describes near-real-time public drone operations and links its dashboard. | Review public flight records, timestamps, geometry and reuse/export conditions. Near-real-time wording does not prove current telemetry. |
| Bellingham PD / Skydio | City confirms a public flight dashboard. Indexed dashboard displays flight times, durations, purposes and available paths. | Review public record schema and actual publication delay. Do not assume a uniform delay across agencies. |
| Community-owned receiver audio / agency open dispatch data | Architectural input option; no particular feed validated here. | Requires a concrete source, permission for processing/redistribution, documented agency/channel and timestamps. Local transcription can avoid a paid speech service. |

Chula Vista: https://www.chulavistaca.gov/departments/police-department/programs/uas-drone-program and https://app.airdata.com/u/cvpd

Wichita: https://www.wichita.gov/1617/Transparency and https://cloud.skydio.com/dashboard/wichita

Bellingham: https://cob.org/news/2026/bellingham-police-department-launches-drone-as-first-responder-program and https://cloud.skydio.com/dashboard/bellinghampolice-wa

AirData documents configurable publication delays and confidential-flight controls: https://airdata.com/public-safety

## Proposed DRONEmapper behavior

Add police-drone activity reports alongside existing Remote ID positions and program/deployment records. Treat dispatch and published flights as different evidence types.

- Dispatch: require an explicit drone/UAS/UAV reference or a reviewed agency-specific unit identifier. Generic aerial support, air unit, helicopter, medevac or an unexplained callsign does not establish drone involvement. A report of somebody else's drone does not establish a police drone deployment.
- Preserve distinct reported events: requested, dispatched, reported airborne, cancelled, completed. A request is not proof of launch; repeated radio calls are not additional aircraft.
- Public flight logs: preserve provider flight IDs, actual flight timestamps, publication timestamps, stated purpose and supplied geometry. Never animate a completed path as a live aircraft.
- Incident location is an activity area, not drone coordinates. Use a coarse area when only an incident location is available. Do not map a feed's city/antenna coordinates as the incident. Ambiguous or absent location stays off the map.
- Keep the exact supporting wording privately for review. Public cards can show agency, event time, reported state, general area and age. Exclude victim names, private medical details and unrelated personal identifiers. Audio playback requires separate redistribution rights; transcription rights alone are insufficient.
- Never merge a dispatch report into a nearby scanner track solely because time/location match. Agency ownership requires explicit evidence. Record corrections and cancellations without overwriting earlier facts.

## Fit with the existing collector

The current EFF integration supplies documented agency program areas; it does not supply flight events. Extend the shared five-minute collector with independently cached, bounded sources only after verifying access and schema. Preserve source timestamps, deduplicate by provider plus flight/incident ID, respect backoff and retain the last successful result without making it fresh again. Dispatch records must not increment the live-position count.

Before enabling a source: inspect real permitted records, test cancelled requests and helicopter/civilian-drone mentions, validate geography and time zones, exercise corrections/deduplication, and verify public output contains no invented position or ownership. Add attribution required by the source. Publicly viewable portals are candidates, not established open-data feeds or permission to redistribute everything they display.

Recommended sequence: validate one official flight-history source first, then add dispatch ingestion from an explicitly permitted feed. This can establish actual police-drone activity while avoiding dependence on an unavailable CrimeRadar export.

## Implemented source: San Francisco

Official dataset: https://data.sf.gov/d/giw5-ttjs (PDDL 1.0). Schema and five real rows were checked on October 21, 2026. The catalog reports 8,864 rows; this is not the number with usable coordinates. Complete live pagination passed on October 22: 8,864 source rows produced 8,244 mapped records, with 620 omitted for unavailable or invalid dates/locations. Flight days span May 16, 2024 through August 31, 2026.

Both Worker and Python collectors select only the Socrata row ID, flight date, reported duration, broad purpose, published point, neighborhood and publication date. They page in row-ID order, verify the dataset revision before and after collection, validate schema/license and retain the previous cache on failure. Successful checks run hourly; the agency publishes monthly. Provider row IDs distinguish log entries, not aircraft. Corrections or replaced exports are reconciled on the next successful collection.

Mapped entries are historical operation areas. Missing or invalid coordinates are omitted; no geocoding is used. Dates remain calendar days because the source does not provide launch times. Generalized points never create live tracks or aircraft profiles. Unknown manufacturer/model remain unknown. Free-text incident descriptions, CAD numbers, addresses and pilot identities are excluded.

The public export is /data/police-flights.json. The map details include flight date, duration, mission category and an official agency-history link. /police-flights.html lists the verified portals; a portal link is not an imported feed.

## Additional official portals

- Portland: https://www.portland.gov/police/open-data/uascalls — monthly, generalized call areas; the recorded date is the original call time, not launch time. The dashboard offers a public CSV export. Pending retrieval/schema validation.
- Cincinnati: https://www.cincinnati-oh.gov/police/department-references/cpd-drones-as-first-responders1/ — official announcement links https://cloud.skydio.com/dashboard/cincinnatipolicedrones. A public ArcGIS flight layer was inspected; item-level reuse terms and a minimal projection still need review before an adapter.
- Saint Paul: https://www.stpaul.gov/publicsafetytechnology — links https://cloud.skydio.com/dashboard/sppd; updates every 24 hours.
- Killeen: https://killeentexas.gov/745/Drone-Transparency — links https://cloud.skydio.com/dashboard/killeenpdtx.
- Fayette County, Georgia: https://fayettesheriff.org/about-us/divisions/special-operations/ — links https://cloud.skydio.com/dashboard/fayettecountysheriff. Geography is required in matching to avoid same-name counties.
- Paradise: https://www.paradiseca.gov/police/page/drones — agency describes a transition between Airdata and BRINC; link its own page for current portal selection.

## Sources not mapped as individual flights

Bloomington municipal UAV logs (https://data.bloomington.in.gov/d/3a7f-6kb4) are PDDL but contain no supplied coordinates and mix departments. They cannot be labeled police flights or assigned invented locations.

Devon & Cornwall Police's Q1 2025 disclosure reports 868 flights across 187 deployments, with 28 deployments in Plymouth; it provides no individual event locations. It is useful aggregate context, not 868 map pins: https://www.devon-cornwall.police.uk/foi-ai/devon--cornwall-police/disclosure-logs/2025-disclosures/drone-flights/

Ontario Provincial Police reports an RPAS fleet in its annual report, not a public flight telemetry feed: https://www.opp.ca/ar2024/overview.html . Generic crime datasets in the UK and elsewhere do not establish that a police drone attended an incident.

Other agency directories verified through their public pages: Brooklyn Park (https://www.brooklynpark.org/real-time-operations-center/), El Cerrito (https://www.el-cerrito.org/1400/Aerial-Operations), Pacifica (https://www.cityofpacifica.org/departments/police/transparency) and Oceanside (https://www.ci.oceanside.ca.us/Home/Components/News/News/742/946?arch=1). These link the official information pages; they do not guess vendor dashboard URLs or claim structured imports. Some pages restrict automated retrieval.

## Live validation follow-up, October 22

The complete SFPD request returned five pages, then the original normalizer rejected a provider row ID. Its slug-like allowlist was too restrictive. Both implementations now retain bounded printable provider IDs exactly, including punctuation, without trimming or truncating identity. New parity cases cover punctuation, whitespace, control characters and overlong identifiers. The validation helper now saves request/response pages before normalization and supports offline replay; the corrected complete import passed its rerun. Actual IDs containing tilde (~) confirmed the cause; both language implementations produce identical records across all seven saved HTTP responses.

Cincinnati's ArcGIS item metadata was retrieved successfully: item 5954ee0b48654284be02d3a8e13bab1d is public and describes the Cincinnati Police Department feature service, owned by bella_skydio_inc. licenseInfo and accessInformation are null. This does not establish a reuse license; retain the official portal link while structured-feed review continues.

The Portland dashboard's advertised PPBOpenDataDownloads/UAS_Drones.csv endpoint returned HTTP 404 during direct validation. Its October 15, 2026 dashboard still offers that download path. Keep the agency portal link; no working CSV collector is claimed.
