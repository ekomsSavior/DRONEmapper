# Manufacturer and model link review — 21 October 2026

Church of Malware / saviorSEC checked the manufacturer and model groups in a
4,939-record public map snapshot: **495 manufacturer groups and 688 model groups**.
Groups are names in the feed, not a count of individual autonomous devices.

This update adds **223 model references and 19 company references**, and corrects
the Ukrainian Armor manufacturer link to the company that builds Protector.
The shared browser directory now contains **504 company references and 528 model
references**. In the reviewed snapshot, **488 of 495 manufacturer groups and
511 of 688 model groups** have a matching link.

The review covered missing groups through official manufacturer pages, product
directories, sitemaps, manuals, research institutions, and company announcements.
Links may lead to a product-family overview or an original announcement when an
individual product page is unavailable. A company reference can be an official
partner announcement or research-institute page when the old company site no
longer provides a usable reference. These links do not change a record's identity,
coordinates, dates, or reception confidence.

Exact manufacturer/model matching remains in place. Unbranded historical names
also require the device kind. Similar names, a successor model, an unrelated
redirect, or an unsupported ownership inference do not create a match. Public
product pages with browser-only delivery or bot protection were also checked
against their indexed primary-source content; availability can change.

**177 model groups remain unresolved**: unknown or withheld models, mixed-model
descriptions, broad fleet labels without a suitable product reference, and older
products whose usable official pages could not be established. Seven manufacturer
names remain unresolved: CAIG, CASUN Intelligent Equipment, Ukrainian Armed
Forces, A-Lab Factory, Embodied, Refraction AI, and Chowbotics Sally. The armed
forces name is an organization label supplied by a source, not a verified maker.
Missing links are left blank rather than guessed.

The checked URLs and evidence are in [device-links.json](device-links.json).
The [snapshot audit](device-link-audit.json) records unresolved groups without
retaining coordinates, radio addresses, node identifiers, or account data.

To audit a new public feed snapshot from the repository root:

```sh
curl -fsSL https://dronemapper.churchofmalware.org/feed -o /tmp/dronemapper-feed.json
node scripts/audit_device_links.mjs /tmp/dronemapper-feed.json /tmp/dronemapper-link-audit.json
```

Edit `docs/device-links.json`, run `python3 scripts/build_device_links.py`, then
run `node --test tests/device-links.test.mjs`. The generated browser directory is
shared by all map records; Android and desktop versions do not change for a link-only update.
