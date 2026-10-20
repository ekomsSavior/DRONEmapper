# Research enrichment — 20 October 2026

Church of Malware / saviorSEC reviewed both the original and expanded worldwide
community research collections of FAA declarations, FCC filings, vendor notes and
radio signatures. They are research leads, not receiver logs. Their internal-only
documents and scripts are not redistributed here.

The scanner catalog now contains **2,320 rules covering 106 distinct manufacturer,
model and aircraft/module combinations**, up from 110 rules and 84 combinations.
New coverage includes Teal, BRINC, Zipline, Freefly, Inspired Flight, Wingtra,
AgEagle and Quantum-Systems. Coverage is partial: an unmatched serial remains
unknown. A matching broadcast is not authenticated device identity.

We independently retrieved the public FAA declarations and serial allocations.
Only accepted Remote ID declarations are used. Operations-over-people approvals,
controllers and FCC radio certifications do not become aircraft detections.
Individually assigned numbers are compacted without filling gaps. Decimal suffix
runs require digits; letters cannot slip into those numeric ranges.

`faa-enrichment-review.json` records declaration decisions, revision IDs, evidence
links and SHA-256 digests. Large individually assigned serial sets are deferred
when they exceed the bounded offline catalog budget; existing-model allocations
were not blindly replaced. The catalog does not claim complete coverage of every
aircraft made by a listed company.

To review another sanitized public FAA export, use
`python3 scripts/compile_faa_evidence.py /path/to/evidence`, inspect the changes,
then run `python3 linux-node/refresh-catalogs.py`. Each input JSON contains
`tracking`, `makeName`, `modelName`, `docType`, `status`, `certificationTypeId`,
`evidence_url`, `reviewed_at`, and `revisions` with `id`, `sha256` and `allocations`
(exact serials or explicit `START-END` ranges). This is an offline review tool,
not automatic trust of an external signature list.

The same generated rules ship in the website, Android app and desktop node.
Catalog recognition works offline and is applied to supported Remote ID reports.
It does not add a new RF decoder or recover Remote ID from ordinary Wi-Fi CSVs.

Twenty-two independently checked operational milestones add history in **13
countries**: China, Ecuador, Estonia, France, Ghana, Japan, Kenya, Nigeria, South
Africa, Sweden, Thailand, the United Arab Emirates and the United States.
`reviewed-history.json` preserves
each event's original date precision and primary evidence. Coordinates are rounded
city/region reference points, not measured aircraft positions, launch sites or
service boundaries. Historical milestones never acquire fresh observation times
when the collector refreshes them. Regenerate the shared adapter with
`python3 scripts/build_reviewed_history.py`.

The worldwide folder's **37 OUI prefixes** were checked against IEEE's public
MA-L registry. All 37 already match the existing shared vendor lookup; no duplicate
prefixes were added. `worldwide-oui-review.json` records the allocation names,
existing matches and source digest. These identify the radio registrant, not a
vehicle model, owner or autonomous capability. Broad allocations for Yamaha, FLIR,
Baidu and Kakao are not promoted to drone/robot sightings.

International vendor coverage does not mean universal radio reception. Regional
certification tables and frequency lists in the research pack were not imported as
decoder rules. Planned services, supplier headquarters and launch announcements
without evidence of physical activity were excluded from the map. The Valence
entry records a shuttle inauguration, not its later planned public-service date;
the Abu Dhabi entry retains the onboard-specialist condition of that expansion.

FCC bands, OUI allocations and vendor hostnames remain useful research context,
but do not by themselves establish that a drone is nearby. MQTT is a transport;
connecting an authorized broker and understanding its payload schema are separate
requirements. The existing Remote ID, DJI DroneID, Wi-Fi candidate and ADS-B
pipelines remain the supported reception paths. No private fleet service is
accessed by this enrichment.
