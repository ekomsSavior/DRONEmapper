# Anduril & Warhound references

**Church of Malware / saviorSEC · reviewed October 25, 2026**

[Browse the product library](https://dronemapper.churchofmalware.org/anduril). Android 0.8.5 and Desktop 0.6.4 ship the same reviewed reference data offline. Open **Device reference** in Android or **Device references → Anduril & Warhound** on desktop. Exact manufacturer/model/kind matches on the world map now link to the reviewed product and show its published communications context.

## What changed in reception

Two exact IEEE allocations are recognized as local manufacturer hints in received Wi-Fi beacons/probe responses (and Android system Wi-Fi observations). Desktop also matches the actual ARP sender on the selected local network:

| Registrant | Prefix | Allocation | Primary registry |
| --- | --- | --- | --- |
| Anduril Industries | E8B470C | MA-M, 28 bits | [IEEE MA-M](https://standards-oui.ieee.org/oui28/mam.csv) |
| Anduril Imaging | 8C1F64763 | MA-S, 36 bits | [IEEE MA-S](https://standards-oui.ieee.org/oui36/oui36.csv) |

The full prefix length matters: neither allocation covers its entire first three MAC bytes. Multicast and locally administered addresses are excluded. MACs can be changed or spoofed; an allocation identifies a registrant, not the model, owner, presence of an aircraft, or connection to Lattice. These local hints do not upload as drone/robot sightings or acquire receiver coordinates. No generic Anduril Bluetooth signature is implemented. Third-party radios may carry another manufacturer's address.

Use normal Wi-Fi reception, or a supported USB Wi-Fi adapter for monitor capture. Existing Remote ID, robot patterns and SDR decoders keep their own identification requirements. An SDR energy peak is not an Anduril identification. No firmware, USB permission, HackRF driver or channel-hopping behavior changed in this release.

## Warhound

[Warhound](https://warhound.com/) is a working-dog technology company using licensed technology from Colossal Biosciences and Anduril. Its [October 22, 2026 announcement](https://www.prnewswire.com/news-releases/warhound-launches-with-200-million-to-rebuild-americas-military-working-dog-supply-using-advanced-genetics-and-defense-technology-302918435.html) describes living working dogs and technology for them, not a robotic quadruped. Anduril's involvement does not make every Anduril radio a Warhound device.

No verified Warhound MAC allocation, SSID, BLE UUID, RF fingerprint, public location feed or deployment coordinates were found. Warhound appears in the reference library, not as a fabricated map sighting. Ghost Robotics quadrupeds and Anduril Ghost/Ghost-X aircraft remain separate products.

## Published communications and receiver limits

- [Ghost / Ghost-X](https://www.anduril.com/ghost): layered communications; no universal model-specific passive decoder is integrated. [Ghost-X specifications](https://armory.anduril.com/products/ghost-x) describe the product configuration, not scanner measurements.
- [Lattice Mesh](https://www.anduril.com/lattice/lattice-mesh) and [SDK](https://www.anduril.com/lattice/lattice-sdk): platform networking and authorized integration tools. Public documentation is not a public aircraft feed.
- [Voyager](https://www.anduril.com/voyager): configurable wired/cellular/Wi-Fi networking. This is not one universal SSID or Bluetooth service.
- [Copperhead](https://www.anduril.com/copperhead): underwater acoustic communications and RF links to above-water assets. [Seabed Sentry](https://www.anduril.com/seabed-sentry) specifies an LF/VLF acoustic array. Acoustic means sound: ordinary RF antennas do not receive it.
- [Sentry](https://www.anduril.com/sentry), [Spark](https://www.anduril.com/spark) and [Spyglass](https://www.anduril.com/spyglass): published X/Ku radar bands are outside an unmodified [HackRF One's 1 MHz–6 GHz range](https://greatscottgadgets.com/hackrf/one/) and standard RTL-SDR reception. Radar emissions also require a validated identification method.
- [Wisp](https://www.anduril.com/wisp): passive infrared sensing is not a Wi-Fi/BLE transmission.
- [Pulsar](https://www.anduril.com/pulsar): software-defined electronic-warfare equipment; its own capabilities are not DRONEmapper decoders.

The library covers 28 published Anduril product/software families plus Ghost-X, Ghost Shark, Bolt-M and Warhound: 32 references added to the existing device library. It is not a promise to detect every configuration. References include official links for air, underwater, sensor, compute, networking and wearable products; no unverified catalog entries are turned into geographic markers.

## Maintenance

Edit `integration/security-device-references.json`, retain primary source links, then run `python3 scripts/sync-device-references.py`. The script updates the website, Android asset and desktop data together. Tests enforce exact allocation widths, maker/model/kind matching, and the separation of vendor hints from public sightings. The public-source review fetched published product pages and IEEE registries only; it did not scan private Anduril networks or access customer telemetry.
