# Aircraft references

Church of Malware / saviorSEC · reviewed October 25, 2026.

The map, Android Device reference, and desktop Device references share 29 General Atomics family, model, configuration and development references. Each has an official model link; published dimensions and performance are included where reviewed for that specific configuration. The canonical catalog is `integration/aircraft-references.json`; run `python3 scripts/sync-aircraft-references.py` after reviewing changes.

Coverage includes Predator, Gray Eagle, MQ-9A/B, Avenger, Mojave, Gambit 1–6, YFQ/FQ-42A, XQ-67A, Eaglet, PELE, Sparrowhawk and LongShot. This is a reviewed public catalog, not an exhaustive inventory of every historical or undisclosed variant. Development references do not establish operational deployment.

## Reception

- Public ADS-B data already recognizes Q1 and Q9 as broad General Atomics families. Exact variants remain unknown unless the source explicitly identifies one.
- Desktop ADS-B reception uses a compatible receiver and readsb at 1090 MHz. If the receiver's aircraft database supplies Q1/Q9, the local details gain a family reference. That database field is not a decoded model claim. Only an explicit broadcast UAS category B6 qualifies for the existing drone-upload path; family metadata alone does not change that rule.
- Android HackRF reception provides spectrum. This catalog adds no Android ADS-B, proprietary control-link or satellite decoder.
- Published LOS, SATCOM, VHF/UHF, TCDL or Link 16 capability is not a public telemetry feed. Carrier energy cannot identify an aircraft or locate it. ADS-B in a detect-and-avoid suite does not prove ADS-B Out; a maritime AIS receiver is not a drone AIS transmitter.
- Wi-Fi and Bluetooth Remote ID reception remains available for compatible broadcasts. Do not assume every GA aircraft broadcasts Remote ID.

Primary references: [GA-ASI product catalog](https://www.ga-asi.com/products-services), [Gray Eagle](https://www.ga-asi.com/remotely-piloted-aircraft/gray-eagle), [MQ-9A](https://www.ga-asi.com/remotely-piloted-aircraft/mq-9a), [small aircraft](https://www.ga-asi.com/remotely-piloted-aircraft/small-uas-and-launched-effects). Exact model pages and datasheets are retained in each catalog entry. Specifications are reference facts, not measured reception ranges.
