# Carbyne: local domain activity and integration research

Desktop **0.6.1** · **Church of Malware / saviorSEC** · reviewed 25 October 2026.

## Use it

1. Stop listening in the desktop dashboard.
2. Open **Radio settings → Local network discovery** and choose a LAN interface on a network you manage. Wireshark/dumpcap capture access is required.
3. Enable **Listen for Carbyne domain lookups**, save, and start listening.
4. Open **Local service activity** for matching observations, receive times, the input interface and a platform link. **Device reference** includes the reviewed Carbyne integration links.

Headless configuration, with the node stopped:

```sh
dronemapper-node configure --lan-interface eth0 --lan-dns
dronemapper-node run
```

Use an attached interface from `dronemapper-node doctor`. Disable domain listening with `configure --no-lan-dns`. Wi-Fi monitor capture, Bluetooth, SDR and serial receivers keep their separate settings. This addition is desktop-only; Android remains 0.8.2 with its existing radio receivers.

## What an observation means

The listener recognizes a plaintext DNS question for `carbyne.com` or one of its subdomains. It shows **Carbyne domain lookup**, not a detected camera, drone, dispatch installation or confirmed service connection. Visiting the public company website can produce this same result. No RF signature, MAC allocation, fixed server IP or map coordinates are assigned to Carbyne.

Capture is non-promiscuous and sends no discovery packets. It covers UDP port 53 over unfragmented IPv4 or IPv6 without extension headers, including up to two VLAN tags; supported query types are A, AAAA, SVCB and HTTPS. DNS over HTTPS/TLS, TCP DNS, cached lookups and traffic outside the capture interface's visibility will not appear. DNS evidence is unauthenticated.

Only the reviewed base domain, question type, source interface and receive time are kept in memory for two minutes. Full subdomains, IP addresses, client MACs, DNS answers, application contents and raw packets are not saved. There are no radar positions, public uploads or wardrive exports for these observations. Headless JSON output remains under the user's control. The setting is off by default and is independent of ARP vendor discovery.

## Research findings

| Evidence | Finding | Use in DRONEmapper |
| --- | --- | --- |
| [Carbyne website](https://carbyne.com/) | Describes Axon 911 Core, built and supported by Carbyne | Reviewed platform identity and public domain reference |
| [Official integration overview](https://carbyne.com/cloud-advantage/carbyne-integrations/) | Describes CAD, mapping, IoT and other integrations | Integration lead; not a public telemetry contract |
| [Public WordPress index](https://carbyne.com/wp-json/) | A read-only check returned the company site's WordPress REST index with `wp/v2` and CMS/plugin namespaces | Website metadata; no drone-position endpoint established |
| [WordPress REST documentation](https://developer.wordpress.org/rest-api/) | Public site content can be available through REST while private content has access controls | An accessible index alone is not an exposed dispatch service |
| [Cloudflare IP documentation](https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/) | Proxied sites share Cloudflare infrastructure | The submitted `104.19.154.92` is not used as a Carbyne device signature or physical location |

The submitted `32.08, 34.78` coordinates have no verified device observation attached and are not added to the map. Continued operation under a Carbyne brand/domain does not establish independent ownership or a separate accessible telemetry network. Shared Axon ownership does not make Carbyne, Fusus and Dedrone wire formats interchangeable.

For a telemetry adapter, the remaining evidence needed is an official field schema and a public or operator-authorized feed with timestamped device observations. A usable message must distinguish device coordinates from call, caller, operator or receiver locations. No caller details, recordings or private incident contents are collected by this feature. The website index and company announcements are not replayed as live sightings.

## Verification

Offline packet tests cover domain suffix boundaries, malformed DNS, query-versus-response handling, IPv4/IPv6, VLANs, fragmentation, the actual libpcap filter, opt-in, expiry and exclusion from public upload/radar/device identity. Test packets are never transmitted or published. No Carbyne deployment or private service account was available for a physical integration test.

Reviewed platform rules live in `linux-node/dronemapper_node/data/service-references.json` and ship with all three desktop launchers.
