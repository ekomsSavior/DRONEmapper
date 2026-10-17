# Android USB radio source

This tree builds with `../../../../build-usb.py` via Gradle. Source provenance and
licenses are in `android-node/NOTICE.txt` and each upstream file. libusb's license
is `libusb/COPYING`; adapter firmware and its redistribution license are in assets.

`uwifi/android-jni.c` accepts only the fd that Android's USB permission flow opened.
It exposes receive, channel selection, counts and close; no packet transmission API.
The Java registry enables MT7610U / MT7612U IDs. Other upstream driver objects are
present as dependencies but are not exposed as supported devices in this build.

Android port changes live in the JNI file, `android-host.h`, kcompat header routing,
USB fd wrapping and runtime idle handling, plus the mt76x0 USB suspend signature.
The runtime ticker sleeps while the radio is closed; USB event handling is stopped.
A single Java executor serializes all opens / closes across service restarts.

Manual regression: adapter attach, permission denial / grant, firmware failure,
channel tuning, real beacon / NAN reception, unplug during initialization / capture,
Stop / Start, direct OTG versus a powered dock. A native-library smoke test is in
`src/androidTest`; it does not claim physical radio reception.
