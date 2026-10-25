export const cloudSurfaces = {
  "schema_version": 1,
  "reviewed_on": "2026-10-25",
  "scope": "Public documentation; not live observations",
  "services": [
    {
      "id": "skydio",
      "vendor": "Skydio",
      "name": "Skydio Cloud",
      "category": "Drones",
      "path": [
        "Aircraft / controller",
        "Skydio Cloud",
        "Authorized application"
      ],
      "protocols": [
        "REST API",
        "WebSocket streaming",
        "Webhooks"
      ],
      "data": "Flight records, streaming telemetry and video APIs; availability depends on permissions and licensing.",
      "access": "Organization administrator issues scoped API credentials.",
      "source": "https://apidocs.skydio.com/docs/exploring-the-skydio-cloud-api",
      "gap": "Cloud account membership and aircraft identity cannot be established from a domain lookup.",
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "fusus",
      "vendor": "Axon / Fusus",
      "name": "Skydio \u2192 FususONE",
      "category": "Drones",
      "path": [
        "Skydio X10 / X2 / R10",
        "Skydio Cloud",
        "FususONE"
      ],
      "protocols": [
        "RTSP streaming",
        "Live telemetry",
        "Webhooks"
      ],
      "data": "Video, flight-state alerts and live tracking in an agency integration.",
      "access": "Skydio streaming license, integration token and selected device groups.",
      "source": "https://www.axon.com/help/axon-air/robotics-and-drones/axon-air/livestreaming-skydio.htm",
      "gap": "A documented integration is not a public flight feed or proof it is enabled at a particular department.",
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "axon-air",
      "vendor": "Axon",
      "name": "Axon Air / Respond",
      "category": "Drones",
      "path": [
        "Skydio drone",
        "Skydio Cloud",
        "Axon Respond"
      ],
      "protocols": [
        "Cloud integration"
      ],
      "data": "Drone video alongside body-camera streams for authorized responders.",
      "access": "Configured customer integration.",
      "source": "https://www.axon.com/blog/skydio-autonomous-drones-now-integrate-with-axon-respond-for-public-safety",
      "gap": "Current tenant endpoints and live flight records are not published by this source.",
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "dedrone",
      "vendor": "Axon / Dedrone",
      "name": "DedroneBeyond",
      "category": "Airspace sensors",
      "path": [
        "ADS-B / radar / cameras",
        "DedroneBeyond",
        "Remote pilot / operations center"
      ],
      "protocols": [
        "Sensor fusion; transport unspecified"
      ],
      "data": "Airspace awareness combining cooperative aircraft reports, radar and cameras.",
      "access": "Operator system; no public telemetry access verified.",
      "source": "https://www.dedrone.com/solutions/dedrone-beyond",
      "gap": "This publication does not establish MQTT endpoints, RF fingerprints or a public track API.",
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "carbyne",
      "vendor": "Carbyne",
      "name": "Axon 911 Core / integrations",
      "category": "Emergency communications",
      "path": [
        "Emergency communications",
        "Carbyne platform",
        "Partner applications"
      ],
      "protocols": [
        "Integration transport not specified by this source"
      ],
      "data": "Emergency communications and partner integration context.",
      "access": "Customer platform; no public drone telemetry verified.",
      "source": "https://carbyne.com/cloud-advantage/carbyne-integrations/",
      "gap": "No specific aircraft, robot or drone location can be inferred from the cloud platform or its public website.",
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "dji",
      "vendor": "DJI",
      "name": "DJI Cloud API",
      "category": "Drones",
      "path": [
        "Enterprise aircraft",
        "Pilot 2 / DJI Dock gateway",
        "Customer cloud platform"
      ],
      "protocols": [
        "MQTT",
        "HTTPS",
        "WebSocket"
      ],
      "data": "Gateway-reported aircraft and payload capabilities, device state and cloud integration messages.",
      "access": "Gateway registered with the customer platform and its configured authentication.",
      "source": "https://developer.dji.com/doc/cloud-api-tutorial/en/overview/product-architecture.html",
      "gap": "Enterprise product support varies. MQTT traffic alone does not identify a drone; the aircraft does not connect directly to this cloud interface.",
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "orbit",
      "vendor": "Boston Dynamics",
      "name": "Orbit / Spot",
      "category": "Robot dogs",
      "path": [
        "Spot robot",
        "Orbit instance",
        "Authorized application"
      ],
      "protocols": [
        "HTTPS REST API",
        "Bearer token"
      ],
      "data": "Fleet robots, inspection runs and related resources; endpoint coverage depends on Orbit version.",
      "access": "Instance administrator grants a scoped API token.",
      "source": "https://dev.bostondynamics.com/docs/concepts/orbit/orbit_api.html",
      "gap": "An Orbit instance may be privately hosted. A fleet record does not guarantee public GPS or current movement.",
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "lattice",
      "vendor": "Anduril",
      "name": "Lattice",
      "category": "Autonomous systems",
      "path": [
        "Connected platforms / sensors",
        "Lattice",
        "Authorized application"
      ],
      "protocols": [
        "REST API",
        "SDK"
      ],
      "data": "Entity, object, task and video interfaces in the documented platform.",
      "access": "Authorized deployment integration; no public operational feed verified.",
      "source": "https://developer.anduril.com/reference/overview/overview",
      "gap": "Platform API documentation does not reveal deployed units, device radio signatures or public locations.",
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "mir",
      "vendor": "Mobile Industrial Robots",
      "name": "MiR Fleet",
      "category": "Autonomous ground vehicles",
      "path": [
        "Autonomous mobile robots",
        "MiR Fleet",
        "Enterprise applications"
      ],
      "protocols": [
        "REST API"
      ],
      "data": "Fleet status and integration with logistics systems, including ERP, MES and WMS.",
      "access": "Customer fleet deployment and its configured access permissions.",
      "source": "https://mobile-industrial-robots.com/products/software/mir-fleet",
      "gap": "Fleet management can be local. Published APIs do not establish internet exposure, GPS positions or a public fleet feed.",
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    }
  ]
};
