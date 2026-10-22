# Vehicle research, recurring data and HackRF

Reviewed 21 October 2026 by Church of Malware / saviorSEC.

The reviewed worldwide research now contributes 40 historical operational
milestones in 20 countries. The shared Android, desktop and server catalog
contains 3,738 rules covering 141 manufacturer/model/module combinations. This identifies supported decoded broadcasts;
it does not add a radio decoder for autonomous ground vehicles.

The research pack's vehicle frequencies, FCC filings, cloud hostnames and broad
OUI allocations do not uniquely identify a nearby robotaxi or delivery robot.
Existing OUI lookup can name the radio registrant. It cannot establish whether a
vehicle is autonomous, its model, operator or location. Satellite navigation is
normally received by the vehicle; a GNSS receiver's presence is not a broadcast
of that vehicle's location.

## Sources in the collection cycle

| Source | What DRONEmapper uses | Update behavior |
| --- | --- | --- |
| [AV Map events](https://github.com/path-avmap/av-map-data) | Launched driverless service areas, plus ended services in History | Existing five-minute collector replays the dated CSV and its geometry files |
| [DEPLOY registry](https://registry.deploy.report/docs/v1) | Published robot, drone and vehicle deployment facts | Existing five-minute collector; approximate deployment areas |
| Reviewed operator publications | 40 independently checked dates and approximate regions | Versioned review file; refreshing the collector does not discover new articles |
| [FAA declarations](https://uasdoc.faa.gov/listDocs) | Declared serial allocations for offline model identification | Reviewed catalog releases; not a flight-position feed |
| [Skydio Cloud](https://apidocs.skydio.com/reference/live-telemetry) | Potential operator-contributed telemetry | Not connected; requires an organization's authorized API token and enabled telemetry |

AV Map history only includes a service with an earlier launched, autonomous,
public/waitlist state and a subsequent dated end event. Announced, testing-only,
supervised and private services do not become driverless history. The start date
is the first qualifying driverless state in that service episode. Ended records
keep their own geometry and dates when a service later reopens. Coordinates remain
area references, and `observed_at` stays null. The initial reviewed feed contributes
two ended-service areas: Cruise in San Francisco and May Mobility in Sun City.

The Skydio API's [authentication documentation](https://apidocs.skydio.com/reference/authentication)
describes access to an organization's data. Its unauthenticated demonstration
stream is simulated and is not used. Vendor news pages can provide further dated
evidence after review, but their publication times are not vehicle observation times.
MQTT addresses also require an authorized broker and a known telemetry schema;
finding a hostname does not establish a public data feed.

## Android connection update

Android 0.8.1 retains the 0.7.2 connection update: it offers **Open SDR** when a HackRF is selected in **USB Wi-Fi adapter**.
The button opens frequency selection before requesting Android USB permission.
Its receive driver was already included in 0.6.0 and newer.

A PortaPack advertising `1d50:6018` with a PortaPack product name is identified as
the Mayhem serial console, not a capture receiver. This USB ID is shared with other
devices, so it is insufficient by itself. The app asks the user to select
**HackRF / RF → Yes** on the PortaPack, the list now refreshes automatically. Standard HackRF capture uses
`1d50:6089`. No firmware commands are sent to the serial console.

References: [Mayhem USB descriptors](https://github.com/portapack-mayhem/mayhem-firmware/blob/next/firmware/application/usb_serial_descriptor.c),
[Mayhem HackRF mode](https://github.com/portapack-mayhem/mayhem-firmware/wiki/HackRF),
[HackRF troubleshooting](https://hackrf.readthedocs.io/en/latest/troubleshooting.html).

The Android spectrum shows received RF power; it does not decode DJI DroneID or
ADS-B. Those decoder options are in the desktop node. A screenshot with increasing
IQ samples and a spectrum demonstrates that the receiver path was running at that
moment; it does not establish a drone detection or diagnose another failing setup.
