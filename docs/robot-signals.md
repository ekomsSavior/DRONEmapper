# Robot dogs and ground robots

Church of Malware / saviorSEC · Android 0.9.0 · Desktop 0.7.0

This release adds eight documented Wi-Fi/Bluetooth patterns to the scanner. Matches
appear as **possible robot dogs** or **possible ground robots** in the live list
and Signals radar. They are unauthenticated clues: a matching name can be changed
or copied, and a controller can be separate from its robot.

## Start a field test

1. Update the Android APK over the existing app, or install Desktop 0.7.0. Keep your
   existing account and settings. Start listening.
2. For Wi-Fi, enable the phone's Wi-Fi and location permissions, or select a
   dedicated desktop adapter in monitor mode. Android's built-in scans are scheduled
   by Android; USB capture and desktop capture must visit the robot's channel.
3. For Bluetooth, enable the Bluetooth receiver. Keep the Android app visible and
   screen on when testing Petoi names: Android may pause unfiltered name discovery
   while the screen is off. Remote ID and CyberDog retain their filtered scan.
4. Put your own test robot in the documented Wi-Fi/Bluetooth mode. Tap a matching
   observation for its transport, signal strength and pattern limitations. A match
   does not supply distance, bearing, model authentication or robot coordinates.
5. To contribute an area, separately enable **Share approximate robot signal
   areas** and provide a fresh phone location or desktop station location. Share
   your app version, robot/firmware version, radio used and whether the documented
   name was visible when reporting a test. Do not send account tokens.

## Patterns included

| Pattern | Transport | Required broadcast |
| --- | --- | --- |
| CyberDog software v1 | Bluetooth LE | Name `铁蛋` + 1–20 printable ASCII suffix characters, C420 service UUID, company `0xffff` bytes `00 01 02 03 04`; one trailing LF allowed |
| Unitree Go1 | Wi-Fi | `Unitree_Go1` + six ASCII letters/digits |
| Petoi Bittle setup module | Wi-Fi | Exact `Bittle-AP` |
| Petoi Bittle BiBoard firmware | Bluetooth LE | `Bittle` + two uppercase hexadecimal characters + `_BLE` |
| Petoi Nybble BiBoard firmware | Bluetooth LE | `Nybble` + two uppercase hexadecimal characters + `_BLE` |
| Petoi Cub firmware target | Bluetooth LE | `Cub` + two uppercase hexadecimal characters + `_BLE` |
| DJI RoboMaster S1 | Wi-Fi | `RMS1-` + six uppercase letters/digits |
| DJI RoboMaster EP | Wi-Fi | `RMEP-` + six uppercase letters/digits |

Nybble is a robot cat; Cub is a firmware target, not a claim about a particular
commercial product. Bittle-AP belongs to an optional ESP8266 setup controller and
can exist without a robot attached. Petoi BLE rules use the published default name;
the reviewed firmware does not explicitly add its UART service to advertising.
Changing a name, using client mode or different firmware can prevent a match.
Generic UART/FFE0 advertisements never identify a robot on their own.

## Offline trips, uploads and privacy

Android **Saved wardrives** records without internet and can upload later with the
original observation time. A fresh location fix is required to save a robot area
report. **DRONEmapper JSON** carries Wi-Fi and Bluetooth robot area reports.
**WiGLE CSV** carries Wi-Fi observations, including these Wi-Fi robot names; it does
not carry Bluetooth robot reports. CSV contains local network identifiers and
receiver coordinates, so review it before sharing with another service.

The website also extracts supported Wi-Fi robot patterns from old WiGLE CSV files.
These become ground-robot candidates under **Possible signals**, or **Ghosts** when
older than two weeks. They never become drone flight tracks. Unrelated rows are not
published as robot sightings. External tools must support the chosen export format;
adding a token alone does not establish compatibility.

Optional live sharing uses a 0.01° receiver cell and a node-specific pseudonym.
Radio addresses and advertised names are excluded from public robot area reports.
No manufacturer, exact model or exact robot position is asserted. Manually uploading
a saved trip is a separate sharing action. For desktop CLI use
`dronemapper-node configure --share-robots --location LAT LON`; use
`--no-share-robots` to disable sharing and remove queued robot reports.

## Device references and reception limits

The Device Library and both scanners include 25 additional researched robot
references, including Unitree variants, Petoi variants, DEEP Robotics LYNX M20,
LimX W1, PuppyPi, PiDog, Mini Pupper and CHiP. A reference entry is not a decoder.
Models without a supported pattern remain references; the app does not identify
them from a generic MAC vendor, MQTT/DDS port, frequency or cloud hostname.

Linux uses BlueZ passive monitors. Windows uses passive Bleak discovery. macOS uses
CoreBluetooth discovery, which may request scan responses; older macOS versions
can impose extra discovery restrictions. Passive receivers can miss a name present
only in a scan response. Missing required fields means no match. Scanning does not
pair, connect to GATT, issue robot commands or query private fleet services.

Automated tests cover strict matches and non-matches, cross-platform catalog parity,
transport binding, separate consent, coarse coordinates, offline persistence, CSV
history and server validation. **Physical reception for these patterns has not yet
been validated by this project.** Test results should identify the exact firmware
and receiver combination.

## Primary evidence

### CyberDog-style BLE

Matches this CyberDog software version only; name, service UUID and manufacturer bytes all required.

- [Manufacturer documentation / source 1](https://github.com/MiRoboticsLab/cyberdog_ros2/blob/9a8674e5009f0ea7c0736168dfbd8d501900a4cb/cyberdog_interaction/cyberdog_wireless/bluetooth/bluetooth/gattserver.py)

### Unitree Go1-style Wi-Fi

Default Go1 access-point name only. Renamed networks, client mode and other Unitree models do not match.

- [Manufacturer documentation / source 1](https://www.unitree.com/mobile/download/go1/)

### Petoi Bittle setup Wi-Fi

Optional ESP8266 controller setup access point; a module may be detached from a robot.

- [Manufacturer documentation / source 1](https://github.com/PetoiCamp/OpenCat/blob/24563ca2e0218150f6299d013cd3a20c45433467/ModuleTests/ESP8266WiFiController/ESP8266WiFiController.ino)

### Petoi Bittle-style BLE

Default BiBoard firmware name only; two hexadecimal suffix characters. Custom names and other boards may not match. No service is required because this firmware does not explicitly advertise one.

- [Manufacturer documentation / source 1](https://github.com/PetoiCamp/OpenCatEsp32/blob/f5aba6b9cb7e4f2062f77365fbcd0c388acf32ef/src/configConstants.h)
- [Manufacturer documentation / source 2](https://github.com/PetoiCamp/OpenCatEsp32/blob/f5aba6b9cb7e4f2062f77365fbcd0c388acf32ef/src/bleUart.h)

### Petoi Nybble-style BLE

Default BiBoard firmware name only; two hexadecimal suffix characters. Custom names and other boards may not match. No service is required because this firmware does not explicitly advertise one.

- [Manufacturer documentation / source 1](https://github.com/PetoiCamp/OpenCatEsp32/blob/f5aba6b9cb7e4f2062f77365fbcd0c388acf32ef/src/configConstants.h)
- [Manufacturer documentation / source 2](https://github.com/PetoiCamp/OpenCatEsp32/blob/f5aba6b9cb7e4f2062f77365fbcd0c388acf32ef/src/bleUart.h)

### Petoi Cub-style BLE

Default BiBoard firmware name only; two hexadecimal suffix characters. Custom names and other boards may not match. No service is required because this firmware does not explicitly advertise one.

- [Manufacturer documentation / source 1](https://github.com/PetoiCamp/OpenCatEsp32/blob/f5aba6b9cb7e4f2062f77365fbcd0c388acf32ef/src/configConstants.h)
- [Manufacturer documentation / source 2](https://github.com/PetoiCamp/OpenCatEsp32/blob/f5aba6b9cb7e4f2062f77365fbcd0c388acf32ef/src/bleUart.h)

### RoboMaster S1-style Wi-Fi

Manufacturer-documented direct Wi-Fi naming pattern. Router mode, renamed access points and other models are not covered.

- [Manufacturer documentation / source 1](https://dl.djicdn.com/downloads/robomaster-s1/20191122/RoboMaster_S1_User_Manual_v1.6_EN.pdf)

### RoboMaster EP-style Wi-Fi

Manufacturer-documented direct Wi-Fi naming pattern. Router mode, renamed access points and other models are not covered.

- [Manufacturer documentation / source 1](https://dl.djicdn.com/downloads/ROBOMASTER_EP/20220429UM/RoboMaster_EP_User_Manual_v1.2_EN_1.pdf)
