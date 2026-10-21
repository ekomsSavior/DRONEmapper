# ESP32 / CYD serial receivers and channel hopping

DRONEmapper Desktop 0.4.0 · **Church of Malware / saviorSEC**

## Connect an external receiver

1. Install the desktop bundle on Windows, macOS or Linux. Its launchers install
   pySerial automatically. For a manual upgrade, run
   `python -m pip install "./linux-node[all]"` in your node environment.
2. Connect the board using a USB data cable. Install its vendor's USB/UART driver
   only if your OS does not create a serial port. On Linux, your user also needs
   serial-device access (usually the dialout group; log out/in after changing groups).
3. In **Radio settings → USB serial receiver**, click **Refresh ports**, choose
   the port, select **Marauder · RID reports** and **115200**, then **Connect receiver**.
4. On Remote ID-capable Marauder firmware, open **Wi-Fi → Sniffers → Remote ID Scan**.
   Close other serial terminals and flashers first. Follow **Receiver status** for
   connection errors and report counts. Click **Disconnect receiver** to release it.

Connecting briefly restarts the node's selected receivers and preserves their
settings and sharing choices. Wi-Fi, Bluetooth, one SDR and serial can then run
together. The serial reader sends no commands. The OS or USB/UART driver may
reset some boards when the port opens; start the scan again if that happens.

CLI, while the node is stopped:

```sh
dronemapper-node configure --serial-port /dev/ttyUSB0 --serial-baud 115200 --serial-format marauder
dronemapper-node serve --listen
```

Windows ports look like `COM3`; macOS ports usually look like
`/dev/cu.usbserial-...`. An empty `--serial-port ''` disables this input.
Only attached local serial ports are accepted; TCP serial URLs are not supported.

## What each format contributes

**Marauder RID CSV:** the adapter reads the stock 30-field `RID,` records.
The local list and clickable signal radar show the reported broadcast ID, RSSI,
channel, transport and packet count. Operator identifiers and locations are discarded.
Marauder's CSV omits the ID type and the broadcast location timestamp, and it
can repeat retained coordinates. Consequently these reports stay local, with
any coordinates shown only as receiver-reported details of unknown fix age.
They do not become fresh map positions or position-radar bearings.
Lost reports and duplicate packet counts are ignored; local contacts expire after
120 seconds without a new report. A radio address is not a confirmed aircraft identity.

**DRONEmapper raw Remote ID JSON:** choose this format for firmware or a bridge
that supplies one JSON object per newline using the existing [MQTT envelope](linux-node-setup.md#optional-mqtt-input).
Required fields are `schema_version: 1`, `protocol` (
`wifi-beacon`, `wifi-aware` or `ble`), `mac`, `payload_hex`
(the raw 25-byte protocol-v2 message or message pack), and `received_at`
(UTC Unix seconds from a synchronized receiver/bridge clock).
Optional `rssi_dbm` carries measured signal strength. No extra fields are accepted.
Maximum line size is 4,096 bytes. This format is **not stock Marauder output**.

Valid raw messages use the same decoder, identity checks, broadcast-time freshness
rules and opt-in **Share fresh Remote ID positions** setting as the other receivers.
The aircraft's location timestamp is decoded from its actual broadcast, never
invented from the host's receipt time. Operator data and transmitter MACs do not
go to the public map. Ordinary logs and historical recordings must not be replayed
through the live serial input; use historical imports for supported archive formats.

A board running unrelated firmware will not produce these records. Use the
[official Marauder installer](https://justcallmekoko.github.io/MarauderInstaller/)
for your exact board revision. An ESP32-WROOM/CYD receives 2.4 GHz, not 5 GHz;
transport support also depends on the firmware build. Remote ID reception does
not make a non-Remote-ID toy drone broadcast Remote ID.

## Channel hopping

One Wi-Fi radio receives one channel at a time. Hopping searches more channels
but misses transmissions while the receiver is elsewhere. Multiple dedicated
radios can combine continuous monitoring with a hopping search.

- **Marauder:** its Remote ID scanner manages hopping itself, prioritizing NAN
  channel 6 and visiting other supported beacon channels. Suitable dual-band
  hardware also supports channel 149. DRONEmapper reads its reported channel.
- **Android USB Wi-Fi:** the existing app hops the capture driver's supported
  channels every 1.5 seconds. Built-in phone Wi-Fi scanning is controlled by Android.
- **Linux monitor adapters:** use the optional helper below. Fixed-channel
  operation remains available without the helper.
- **Windows/macOS:** Wi-Fi channel selection still depends on the OS/driver.
  This Linux helper does not change their interfaces.

After monitor setup, run this in a **second terminal** from the bundle root:

```sh
sudo python3 linux-node/channel-hop.py --interface dmmon0
```

The default plan covers channels 1–11 with extra visits to 6 and a 0.75-second
dwell. It checks the radio's available channels, excludes disabled/no-IR/DFS
channels, refuses another active interface on the same radio, and never changes
the regulatory domain. Keep the dashboard running as your normal user. Only
this separate channel helper needs administrator access.

Choose a different supported plan, for example:

```sh
sudo python3 linux-node/channel-hop.py --interface dmmon0 --channels 6,1,6,11 --dwell 1
```

Use channel 149 only if your adapter and regulatory configuration expose it.
The helper rejects an unsupported plan instead of silently changing it.
**Ctrl+C** stops hopping and restores the original channel when the interface
is still available and dedicated. Starting two hoppers on the same radio is refused.
Leave one adapter on channel 6 and hop a second, separate radio for broader coverage.

## Validation and references

Offline tests cover fragmented serial reads, oversized/noisy lines, malformed
records, duplicate reports, actual POSIX serial-loopback I/O, sharing consent,
missing timestamp handling, supported-channel checks and original-channel restore.
These software tests do not establish over-the-air Marauder reception or
Windows/macOS USB-driver compatibility. A CYD running Marauder 1.19.0 has
booted successfully and connected to the Linux node over USB at 115200 baud.
No Remote ID report was received during that check; over-the-air reception
validation is still pending.

The Marauder CSV layout was reviewed at upstream commit
`45f47daa6ae65b36bbef9f9051977adcb315b1c5` in `esp32_marauder/WiFiScanRemoteId.h`.
This project implements a separate parser; no firmware is bundled.
[Marauder Remote ID](https://github.com/justcallmekoko/ESP32Marauder/wiki/Remote-ID) ·
[Marauder source](https://github.com/justcallmekoko/ESP32Marauder) ·
[pySerial](https://pyserial.readthedocs.io/en/latest/pyserial_api.html).
