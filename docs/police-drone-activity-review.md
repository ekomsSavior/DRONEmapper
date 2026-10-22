# Police drone activity from dispatch and public flight logs

Research reviewed 2026-10-22 for Church of Malware / saviorSEC.
Implementation: automatic SFPD logs plus 20 agency-published flight layers and Roselle’s deployment log,
shared by the hosted Worker and local Python website. The reviewed registry is
`public/police-flight-sources.json`; `/api/police-coverage` reports actual collection
status and `/police-flights.html` displays it. Coverage is not universal.

## Imported public flight layers

Cincinnati, Wichita, Bellingham, Killeen, Fayette County (GA), Saint Paul,
New Orleans, Tampa, Laurel, Nashville, Hawaii DLE, University of Illinois,
Niles, Cleveland, Santa Clara County Sheriff, Duluth, Arvada and Pickens County
(GA), Laredo and Overland Park link public Skydio dashboards from their official sites. Their published
ArcGIS flight layers supply completed takeoff/landing times and flight envelopes.
Only agency-published data is queried. No credentials, private operations or
undocumented account access are used; dashboard code is not bundled.

The adapter validates schema and source revision, reads 1,000 rows per page and
limits each department to its latest 5,000 published rows. Tampa follows its
published last-30-days window. Check intervals are 5, 15 or 60 minutes; a check
does not override an agency's publication delay. Unchanged layers reuse cache.
Identical duplicate flights collapse; conflicting copies are excluded. Partial
pages and revision changes retain the last good snapshot. Coverage exposes
selected, omitted and filtered/duplicate row counts. These are rows, not a claim
that every underlying mission was published.

Flight envelopes are rounded outward to 0.001 degrees and mapped at their center.
Cards include department, purpose, start, end, duration and the published area.
Unknown aircraft models and identities remain unknown. Completed records cannot
be live; after 14 days they become ghost flights, not profiles of one aircraft.
SFPD's date-only records keep day precision and separate PDDL attribution. Other
agency facts retain source attribution; no open-data license is invented.

## Remaining coverage work

The Atlas of Surveillance program layer supplies broader documented agency
coverage; it does not supply flights. The coverage page keeps these counts apart.
New departments can be added to the reviewed registry after an official portal
link, public-layer schema and real-response test are established.

Buxton (ME), Carmel (IN), and Arlington (TX) publish DroneSense portals. Their
public flight-list responses were inspected; the response lists supply event
fields but no coordinates. They are linked for review, not geocoded from private
incident addresses or claimed as imported flights. Agency-approved coordinate
exports would support a future adapter. DroneSense's customer terms are separate
from a public-data license.

Airdata portals for Chula Vista, Anne Arundel, Everett, Lancaster, Los Angeles
Port, Elk Grove, Bothell, Westmont and Chico were identified. Airdata's reuse
terms require review before automated republication; these remain portal leads.
Portland's advertised Tableau CSV download returned 404 during validation.
Redmond provides a separate dashboard. None is counted as an automatic feed.

Do not infer a drone from a generic air-support dispatch request. An agency's
program or an aggregate annual flight total is not an individual mapped flight.


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
| Wichita PD / Skydio | City's transparency page describes near-real-time public drone operations and links its dashboard. | Automatic completed-flight import enabled, checked every five minutes. Preserve the original flight time; completed missions never count as live positions. |
| Bellingham PD / Skydio | City confirms a public flight dashboard. Indexed dashboard displays flight times, durations, purposes and available paths. | Automatic completed-flight import enabled, checked every five minutes. The latest published flight time is shown on the coverage page. |
| Community-owned receiver audio / agency open dispatch data | Architectural input option; no particular feed validated here. | Requires a concrete source, permission for processing/redistribution, documented agency/channel and timestamps. Local transcription can avoid a paid speech service. |

Chula Vista: https://www.chulavistaca.gov/departments/police-department/programs/uas-drone-program and https://app.airdata.com/u/cvpd

Wichita: https://www.wichita.gov/1617/Transparency and https://cloud.skydio.com/dashboard/wichita

Bellingham: https://cob.org/news/2026/bellingham-police-department-launches-drone-as-first-responder-program and https://cloud.skydio.com/dashboard/bellinghampolice-wa

AirData documents configurable publication delays and confidential-flight controls: https://airdata.com/public-safety

## Dispatch ingestion requirements

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

The flight-history adapters above are implemented. Dispatch ingestion still needs an explicitly permitted, validated feed; no CrimeRadar export is configured.

## Implemented source: San Francisco

Official dataset: https://data.sf.gov/d/giw5-ttjs (PDDL 1.0). Schema and five real rows were checked on October 21, 2026. The catalog reports 8,864 rows; this is not the number with usable coordinates. Complete live pagination passed on October 22: 8,864 source rows produced 8,244 mapped records, with 620 omitted for unavailable or invalid dates/locations. Flight days span May 16, 2024 through August 31, 2026.

Both Worker and Python collectors select only the Socrata row ID, flight date, reported duration, broad purpose, published point, neighborhood and publication date. They page in row-ID order, verify the dataset revision before and after collection, validate schema/license and retain the previous cache on failure. Successful checks run hourly; the agency publishes monthly. Provider row IDs distinguish log entries, not aircraft. Corrections or replaced exports are reconciled on the next successful collection.

Mapped entries are historical operation areas. Missing or invalid coordinates are omitted; no geocoding is used. Dates remain calendar days because the source does not provide launch times. Generalized points never create live tracks or aircraft profiles. Unknown manufacturer/model remain unknown. Free-text incident descriptions, CAD numbers, addresses and pilot identities are excluded.

The public export is /data/police-flights.json. The map details include flight date, duration, mission category and an official agency-history link. /police-flights.html lists the verified portals; a portal link is not an imported feed.

## Additional official portals

- Portland: https://www.portland.gov/police/open-data/uascalls — monthly, generalized call areas; the recorded date is the original call time, not launch time. The dashboard offers a public CSV export. Pending retrieval/schema validation.
- Cincinnati: https://www.cincinnati-oh.gov/police/department-references/cpd-drones-as-first-responders1/ — official announcement links https://cloud.skydio.com/dashboard/cincinnatipolicedrones. Its public flight layer is now imported with only flight times, broad purpose and a generalized envelope.
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

Cincinnati's ArcGIS item metadata was retrieved successfully: item 5954ee0b48654284be02d3a8e13bab1d is public and describes the Cincinnati Police Department feature service, owned by bella_skydio_inc. licenseInfo and accessInformation are null. This does not establish a reuse license. The adapter now selects published flight facts and generalized envelopes, retains source attribution and does not redistribute dashboard software or imply a license to the underlying service.

The Portland dashboard's advertised PPBOpenDataDownloads/UAS_Drones.csv endpoint returned HTTP 404 during direct validation. Its October 15, 2026 dashboard still offers that download path. Keep the agency portal link; no working CSV collector is claimed.

## Additional coverage verified after publication

Overland Park’s official flights link (https://www.opkansas.gov/drones-as-first-responder-flights-0) redirects to its public dashboard. Its 536 published rows produced 531 valid completed flights. Laredo’s official police page links its DFR transparency portal; that public dashboard identifies the department and supplies 6,193 rows. Its latest 5,000 rows produced 4,631 distinct valid flights. Both now use the automatic collector with 15-minute checks.

Roselle’s police page (https://www.roselle.il.us/61/Police) links its public ArcGIS dashboard. This is a deployment log, not aircraft telemetry. The adapter requests only row ID, calendar date, duration, broad category and supplied geometry. It cross-checks the displayed date against the UTC date field, generalizes points to 0.01-degree cells, omits addresses and case numbers, checks hourly and retains the original day precision. A deployment entry may describe total flight time; it does not identify an aircraft.

Further leads: Shaker Heights publishes annual flight-log documents at https://www.shakerheightsoh.gov/1005/SHPD-Drone-Flight-Logs . Canadian RCMP transparency reporting and the UK law-enforcement UAV survey provide program/aggregate context, not validated event coordinates; no additional flight pins are inferred from them.

Validation totals: 22 department feeds, 30,841 mapped flight/deployment records on October 22. Roselle supplies 139 rows; 138 pass the date/location validation. Publication checks retain the last good snapshot if a later request fails. These counts are measured imported records, not a claim of nationwide or real-time coverage.
