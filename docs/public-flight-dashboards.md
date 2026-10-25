# Public flight dashboards

Church of Malware / saviorSEC · October 25, 2026.

DRONEmapper now configures 94 public flight feeds, including 72 additions checked against Skydio's public dashboard catalog. Police, fire, utility, research, commercial and government operators retain their own categories. Multiple dashboards from one operator count as one operator in coverage statistics.

New feeds check for changes every five minutes. Existing agency-specific intervals and publication windows remain in place. Upstream rate limits and failures back off, retain the last successful records, and appear in coverage status. The map refreshes every 15 seconds. Public dashboard publication can lag the flight; collection cannot make an unpublished flight available.

The collector keeps original takeoff, landing, duration, published mission category, operator, platform and generalized flight envelope. It fetches no video, incident narratives or private account data. Completed flights are historical records, never current aircraft GPS. They become ghosts after 14 days. Only a fresh aircraft-position report can count as live.

New feeds initially select the most recent 500 published rows per dashboard. Existing feeds keep their previous limits. The coverage API reports selected, omitted, invalid and mapped row counts; this is not a claim to contain every flight. Empty enabled dashboards contribute no map markers until usable records appear.

The review examined 255 public catalog entries: 77 had an enabled, matching public dashboard and production layer. Five were already configured; one incident-specific portal was excluded. Test/demo entries and unconfirmed public paths were not added. A dashboard title does not establish the model of each aircraft; those model fields remain unknown.

Registry: `public/police-flight-sources.json`. Review provenance: `integration/public-dashboard-review.json`. The legacy `/api/police-coverage` and `/data/police-flights.json` routes now also include non-police operators and expose their categories. [View current coverage](https://dronemapper.churchofmalware.org/police-flights).

This does not cover every Skydio customer or every police drone program. Public catalog access alone is insufficient: a candidate must have an enabled matching public dashboard, reviewed operator, valid production layer, supported schema and valid original flight times and areas. Retail/consumer accounts are included only if they intentionally publish a compatible public dashboard; no such account was confirmed in this review.
