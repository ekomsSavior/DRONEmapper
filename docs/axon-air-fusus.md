# Axon Air / Fusus drone references

Church of Malware / saviorSEC · reviewed 25 October 2026.

The map, Android scanner and desktop scanner share three reviewed Skydio families: **X10, X2/X2E and R10**. Open a matching drone's details to see its model link and **Compatible platform: Axon Air / Fusus**. Android and desktop also include them in **Device reference**. Compatibility does not establish an active cloud connection or a police operator.

## Reception and tracking

Existing Wi-Fi/Bluetooth Remote ID decoding supplies broadcast identity and, when present, aircraft coordinates. Reviewed FAA serial ranges already include X10E SR47P and X2E hardware revisions. Overlapping X2E revisions stay ambiguous. R10 is a product reference until its serial allocations are reviewed; its generic Remote ID messages can still be received. This release does not add a Connect SL, cellular or Fusus cloud decoder.

X10 uses proprietary Connect SL at 2.4/5 GHz, with cellular options. R10 uses Connect SL/cellular and supports indoor visual navigation. Spectrum energy, a manufacturer OUI, a company domain or a cloud IP cannot identify an aircraft's operator or position.

Fusus receives Skydio video, telemetry and flight alerts through an authenticated organization integration. It requires Skydio Cloud live-streaming access and integration credentials. Published flight dashboards remain the public-data route. The repo below contains no public flight stream, aircraft coordinates or RF signatures. No private cloud feed is connected by this update.

Desktop's optional **Local network discovery** can recognize plaintext DNS questions under `fusus.com` and `dedrone.com`, alongside Carbyne. These remain local domain hints; website visits also match. They are excluded from radar, wardrive exports and public map uploads. The feature is off by default.

## Map evidence

Three dated program records were added from Axon's 20 June 2024 report: Miami Beach's X10/Axon use, Forsyth County's drone/Fusus coordination, and Oakland County's Axon Air/DedroneBeyond pilot. They retain the publication date and rounded city/county reference areas, with no live GPS claim. Unknown aircraft models remain unknown. They are distinct from flight logs and received tracks.

## Research audit and credits

[saviorSEC / Axon Galaxy](https://github.com/saviorSEC/axon-galaxy), commit `476c844ed9f70b231c8ee0f9252f38cd884f9ec1`, supplied research leads. All 43 services, 55 relationships and 7 zones were reviewed. Drone-relevant leads were Fusus, Dedrone, Axon Air and the Evidence integration. Identity, DevOps, VPN, email, CDN and generic hosting entries are not drone detections. Cloud IPs were not mapped as vehicles. The referenced full recon report is absent from that snapshot; no repository license was present. No repo code or raw infrastructure dataset was copied.

Primary references:

- [Axon Fusus–Skydio integration](https://www.axon.com/help/axon-air/robotics-and-drones/axon-air/livestreaming-skydio.htm)
- [Skydio Connect](https://support.skydio.com/hc/en-us/articles/20592871628571-Understanding-Skydio-Connect)
- [R10 FAQ](https://www.skydio.com/r10/faq)
- [X2E Remote ID information](https://support.skydio.com/hc/en-us/articles/8629239357595-What-is-Remote-ID-and-how-does-Skydio-have-you-covered)
- [Axon program report, 20 June 2024](https://www.axon.com/blog/next-gen-drone-and-drone-as-first-responder-dfr-solutions)
- [DedroneBeyond](https://www.dedrone.com/solutions/dedrone-beyond)

Edit `integration/drone-platforms.json`, then run `python3 scripts/sync-drone-platforms.py` to keep the three interfaces aligned. Model references do not modify observation identity, timestamps, classifications or sharing permissions.
