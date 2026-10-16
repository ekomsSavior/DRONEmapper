# DRONEmapper Node

Free, open-source Android scanner by **[Church of Malware](https://churchofmalware.org/)** and **[saviorSEC](https://churchofmalware.org/work/), the Church’s research branch**.

Android 8+. No root or Bluetooth dongle.

1. Install the APK from [Android nodes](https://dronemapper.churchofmalware.org/nodes.html). Allow installation from your browser when Android asks.
2. Enable Bluetooth, Wi-Fi and Location. Tap **Start listening** and grant radio permissions.
3. Nearby Remote ID broadcasts and matching Wi-Fi camera / Tello-style signals appear with their radio address.
4. To contribute, tap **Connect to DRONEmapper** → **Continue in browser**. Create an account, verify your email, sign in and approve the matching phone code. Return to **Sharing choices**, enable the reports you want to share and tap **Save**.
5. Choose a display name or remain **Anonymous**. Public names are optional; email stays private. **Open world map** takes you straight to the website.

Expand or collapse the live list and radar. The **Signals** view puts glowing dots inside the circle; glow size follows measured signal strength, and the dot layout is not a location. **Positions** plots fresh broadcast coordinates relative to the phone. Optional radar GPS stays on the phone. Tap a dot for type, MAC, strength and age. Their direction and distance are unknown. Tap **What we scan** for supported signals. Offline OUI lookup shows the radio registrant, not proof of a device type.

Sharing starts off each session. Raw MACs and network names stay on your phone. A Wi-Fi name match is not proof of a drone; changing addresses may create separate profiles.

Optional USB: the bundled driver supports **RTL8187L (0bda:8187), 2.4 GHz channels 1–11**. Other chipsets need their own driver.

Build from the repository root with JDK 17 and Android SDK 35:

```sh
cd android-node
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

**Data credit:** [OUI Master Database](https://github.com/Ringmast4r/OUI-Master-Database) by **Ringmast4r**, using IEEE Registration Authority entries, powers the app’s offline MAC-prefix/radio-vendor lookup. A vendor allocation does not establish a device’s type or owner.

[Setup](../docs/android-node-setup.md) · [Radio support](../docs/node-radio-research.md) · [GPL v2](LICENSE) · [Credits](NOTICE.txt)
