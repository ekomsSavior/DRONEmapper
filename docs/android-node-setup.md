# Android scanner nodes

By Church of Malware and saviorSEC, the Church’s research branch.

## On the phone

Install the APK from the website’s **Android nodes** page. Enable Bluetooth, Wi-Fi and Location; tap **Start listening**. Android requires Nearby devices and precise Location permission for the available radio APIs. The app requests a phone location for optional on-device radar or separately enabled approximate-area sharing. Exact radar GPS stays in memory on the phone.

Remote ID provides broadcast identifiers and, when present, aircraft-reported positions. Matching Wi-Fi camera network names appear as possible signals, with their full BSSID locally. Do not assume a matching name proves an aircraft or its maker. There is no universal robot, vehicle or proprietary radio detector.

## Contribute to the website

Tap **Connect to DRONEmapper**, then **Continue in browser**. Create an account with your email and a unique passphrase, verify the email, and sign in. Check that the connection code matches your phone and approve it. Return to the app and choose **Sharing choices**. No key copying is needed.

Choose an optional display name or remain **Anonymous**. Names stay private unless you enable public attribution in **Display name & anonymity**. The email is never shown with map reports. Optional authenticator-app 2FA includes one-use recovery codes.

Enable **Share new observations**; **Also share approximate areas for Wi-Fi candidates** is a separate choice. Tap **Save**, then **Start listening** if needed. Remote ID positions upload about every ten seconds; the public map refreshes every fifteen seconds. Wi-Fi candidates require a fresh location fix with accuracy at most 100 m. Only the center of a 0.01° receiver cell is uploaded (about 1.1 km north–south). It is neither the drone’s position nor an RF range estimate.

**Open world map** opens the website. **Manage account** opens your profile, security settings and node list. Removing a node revokes its credential and removes that node’s contributed observations.

The map shows timestamps, node activity, reporting-node counts and supported identification. Full MAC addresses, SSIDs, raw phone GPS and pilot/control-station locations are not uploaded. A per-install secret produces a stable candidate identifier from the radio address; the server keys it again. This links repeat reports from the same node without publishing the MAC. Clearing app data, replacing the node key or a changing radio address can create a new profile. Different devices are never merged by vendor prefix.

## History

Actual observed vehicles and candidate signals retain first/last seen, report counts and up to 365 daily summaries. After 14 days without a new sighting they become ghosts. A fresh sighting restores the recent state. A ghost is a last-known record, not evidence that a device remains there. Live still means an observation within two minutes.

Detailed node events/trails last 24 hours, capped at 50,000 events. Profiles persist until deleted by the operator; revoking a node removes its contributions. Enrollment is capped at 5,000 nodes and 50,000 node/profile pairs. Deployment/program areas retain documented dates and are not counted as sightings when refreshed.

## Run your own map

[Account service setup](account-setup.md) is optional for self-hosted maps. Manual per-node credentials remain available under **Advanced map connection**.

`npm ci`, copy the root Wrangler configuration, enable `NODE_INGEST_ENABLED="true"`, and deploy under your own account. Set a random administrator secret of at least 32 characters with `npx wrangler secret put NODE_ADMIN_TOKEN`. Keep it out of the app and source control.

Using that administrator credential, POST an empty JSON object to `/v1/admin/nodes` with `Authorization: Bearer ADMIN_SECRET`. The response returns a unique `node_key` once and its `node_handle`. Give each phone its own key. Revoke with POST `/v1/admin/revoke` and `{"node_handle":"THE_HANDLE"}`. Never share the administrator credential.

For a local Worker test use `npx wrangler dev --ip 127.0.0.1 --port 8783`, a private `.dev.vars` containing the administrator secret, and the local-only variable `NODE_ALLOW_LOCAL_HTTP="true"`. With USB debugging, `adb reverse tcp:8783 tcp:8783` lets a debug APK use `http://127.0.0.1:8783/v1/observations`. Release APKs require HTTPS. The older Python `node_server.py` is a separate Remote ID-only development harness, not the full website ingestion service.

## Optional USB Wi-Fi

Connect an RTL8187L adapter (USB 0bda:8187) with OTG, then choose **USB Wi-Fi adapter** and approve Android’s USB permission. The bundled driver covers 2.4 GHz channels 1–11, one channel at a time. Other adapters need specific userspace drivers; an antenna alone does not add radio support. Physical adapter reception still needs testing.

## Stop and privacy

**Stop listening** ends capture, disables both sharing choices and clears pending uploads. Sharing also starts off after process restart. Changing destination or disabling sharing clears the queue. A request already transmitted may finish. Local queues contain at most 500 fresh reports and expire after 15 minutes. No analytics or advertising SDKs.
