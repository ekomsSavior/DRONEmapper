# HackRF on Android

Android 0.7.1 includes the **USB SDR · HackRF** connection and local RF spectrum
introduced in 0.6.0, plus saved wardrives for Wi-Fi and Remote ID observations.
Built by **Church of Malware / saviorSEC**. No root is required.

1. Install the signed update over the existing app; do not uninstall first.
2. Connect the HackRF through USB OTG. A PortaPack must be in HackRF USB mode.
3. Open **USB SDR · HackRF**. Choose a center frequency, then **Choose receiver →
   Connect → Allow** in Android's USB permission prompt.
4. Watch **USB SDR** for the hardware name, frequency and increasing IQ sample count.
   Expand **SDR spectrum** to view measured RF power. **Disconnect SDR** stops only
   the HackRF; **Stop listening** stops all receivers.

The connection recognizes USB `1d50:6089`, reads the board ID to distinguish HackRF
One / Pro, and uses Android USB Host control transfers and the bulk-IN endpoint.
Firmware is not changed. RF amplifier and antenna power are disabled; receive
LNA/VGA gains are 16/20 dB. Sampling is 8 Msps with a 6 MHz analog filter; the display
covers an 8 MHz window around the selected center frequency. USB throughput and
power vary by phone, hub and cable. A powered hub may help if reception stalls.

This Android path receives IQ and displays a Hann-windowed FFT in dBFS. It does
not yet demodulate DJI DroneID or ADS-B. Those integrations are in the
[desktop node](desktop-node-setup.md) for Windows, macOS and Linux.
RF peaks are not identified drones, GPS positions or directions, and do not enter
the radar, upload queue or public map. The app does not save raw IQ. Wi-Fi and
Bluetooth continue independently, including their existing opt-in reports.

Version 0.5.1's **USB Wi-Fi adapter** menu cannot open HackRF. Its “Permission:
not granted” report is a consequence of having no SDR Connect path; it is not
proof of a broken cable. In 0.6.0 the Wi-Fi chooser directs HackRF users to the SDR
menu. New or unsupported board IDs fail with a specific message instead of
starting an unverified configuration.

## Test checklist

- Connect permission granted / denied / retry; unplug and reconnect.
- Sample count increases and spectrum changes when tuning a known local signal.
- Stop / disconnect ends reception, clears spectrum and leaves other receivers
  alone; restarting the app requires reconnecting USB.
- Copy **Phone capabilities** with the actual phone, Android version, firmware and
  sample counter. Reports omit USB serial numbers and phone identifiers.

Automated USB permission tests cover Android API 28 and 35. Protocol command,
configuration failure and FFT tests use isolated fixtures. These are software
checks, not proof of physical reception on the Moto or Pixel / Android 17.
A community tester reported working Android HackRF reception on 2026-10-19.
That report does not establish compatibility with every phone or USB setup;
an instrumented Moto/Pixel reception check remains pending.

## References

- [Android USB Host API](https://developer.android.com/develop/connectivity/usb/host)
- [Great Scott Gadgets libhackrf USB implementation](https://github.com/greatscottgadgets/hackrf/blob/main/host/libhackrf/src/hackrf.c)
- [HackRF board IDs](https://github.com/greatscottgadgets/hackrf/blob/main/host/libhackrf/src/hackrf.h)

The Android receive driver is an independent implementation of the documented
USB command layout. No upstream libhackrf binary is bundled.
