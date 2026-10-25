# Security-device references and local discovery

Android **0.8.2** and Desktop **0.6.1**, by **Church of Malware / saviorSEC**.

## What changed

- **Device reference** contains the Verkada CM42 camera and GW31-E gateway, with official model and manufacturer links.
- A received Wi-Fi beacon/probe response with a reviewed Verkada MAC allocation can appear as **Verkada device · model unknown**. Android also checks the phone's Wi-Fi scan results. These are gray, local vendor observations, not confirmed cameras or drones.
- Desktop has an optional **Local network discovery** receiver for ARP sender observations. It works independently of Wi-Fi monitor capture, Bluetooth, SDR and USB serial.
- Camera-link names in Wi-Fi probe responses now reach the existing WiFi CAM/Tello candidate logic. Remote ID decoding still accepts its supported beacon/NAN formats.
- Bluetooth addresses whose public/random type is unavailable no longer receive an inferred OUI vendor on desktop.

## Use local network discovery

1. Install Wireshark/dumpcap and enable capture access: Wireshark capture-group access on Linux, Npcap on Windows, or ChmodBPF on macOS.
2. Stop listening in the desktop dashboard. Open **Radio settings → Local network discovery** and select an interface on the network you administer. Use **Receiver status → Refresh** if needed.
3. Save settings and start listening. Observed matching senders appear under **Local network devices**, with their MAC, manufacturer link, receive time and input interface.
4. Choose **Off** to disable this receiver. Existing monitor-mode Wi-Fi receivers keep their own separate interfaces.

Headless equivalent, while the node is stopped:

```sh
dronemapper-node doctor
dronemapper-node configure --lan-interface eth0
dronemapper-node run
```

Replace `eth0` with an interface returned by `doctor`. Use `--lan-interface ''` to disable. Windows interface names may be Npcap device paths.

The receiver requests non-promiscuous Ethernet capture and filters only ARP, including up to two VLAN tags. It performs no network discovery probes, opens no camera streams and does not change interface mode. A wired camera need not broadcast ARP during the observation window. Switches, VLANs and wireless client isolation limit visibility. This is not a network inventory or a radio-range measurement.

## What the CM42 photo establishes

The reference label names **CM42-256-HW**. The [CM42 datasheet](https://docs.verkada.com/docs/video-security-cm42-datasheet.pdf) documents a 5 MP indoor camera with RJ45 Ethernet and PoE. There is no validated CM42 Wi-Fi/Bluetooth detection signature here. A receiver hearing another radio cannot place this wired camera on a radar.

The bundled [OUI Master Database](https://github.com/Ringmast4r/OUI-Master-Database/tree/b8826bb53e949822f702e63865e582955cdc3505) records `E0:A7:00` for Verkada Inc. The photograph's blurred address was not reconstructed. The registry prefix identifies an allocation holder, not a CM42, its owner, or a unique installation. Locally administered and multicast addresses are excluded from vendor recognition. Addresses and device names can be imitated.

## Additional research: GW31-E

Verkada's separate [GW31-E gateway](https://help.verkada.com/connectivity/configuration/add-wi-fi-gateway-to-command) can supply a Wi-Fi uplink to wired cameras. The [LED documentation](https://help.verkada.com/connectivity/configuration/add-wi-fi-gateway-to-command/wi-fi-gateway-status-leds) describes Bluetooth setup mode. We still need validated advertisement bytes before implementing a Bluetooth signature. A gateway's presence would not establish the number, model or coordinates of attached cameras. The current Wi-Fi parser does not inspect client data traffic.

[Verkada network settings](https://help.verkada.com/command/need-help/required-network-settings) describe DHCP, DNS and outbound cloud connections. Those cloud domains are configuration references, not a public camera-location feed. The scanner does not connect to those services.

## Data handling and validation

Vendor-only observations remain in memory on the receiving device and expire from the live list after two minutes. They are excluded from public-map uploads and Android saved wardrives/exports. LAN observations have no radar dot, GPS or signal-strength estimate. The command-line mode prints these local observations; redirected output is under the user's control. Existing drone/robot sharing choices are unchanged.

`integration/security-device-references.json` is the reviewed source for both apps; regenerate bundled copies with `python3 scripts/sync-device-references.py`. References are not detections or map records.

Desktop 0.6.1 also offers separate, opt-in [Carbyne domain lookup recognition](carbyne-discovery.md). With that option on, the LAN capture filter additionally permits plaintext DNS questions; the device-vendor path still uses only ARP. Domain activity stays in its own local list and never becomes a device or camera claim.

Tests cover real libpcap filter compilation against synthetic ARP/VLAN packets, malformed/source-mismatched packets, sender-versus-target handling, probe-response parsing, expiry, receiver isolation, and exclusion from uploads/exports. Android tests exercise API 28 and 35. The CM42 was supplied as a photo only: physical CM42/GW31-E reception and this new LAN receiver on Windows/macOS still need device testing. No photograph-derived or synthetic sightings were added to the public map.
