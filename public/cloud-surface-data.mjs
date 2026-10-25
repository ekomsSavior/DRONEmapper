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
      "reviewed_on": "2026-10-25",
      "hosting": "Cloud",
      "useful": "Fleet owners can examine permitted flight-history exports and distinguish stored flights from streaming telemetry.",
      "related": []
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
      "reviewed_on": "2026-10-25",
      "hosting": "Cloud",
      "useful": "Agency operators can check the official integration prerequisites and device groups; this catalog does not connect to their account.",
      "related": []
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
      "reviewed_on": "2026-10-25",
      "hosting": "Cloud",
      "useful": "Check which agency integration is actually enabled before attributing a drone stream to Respond.",
      "related": []
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
      "reviewed_on": "2026-10-25",
      "hosting": "Deployment dependent",
      "useful": "Useful context for identifying sensor inputs; this source does not provide an importable public track feed.",
      "related": []
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
      "reviewed_on": "2026-10-25",
      "hosting": "Cloud",
      "useful": "Use as emergency-platform context; a dispatch or caller location is not a drone location.",
      "related": []
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
      "reviewed_on": "2026-10-25",
      "hosting": "Cloud + edge",
      "useful": "Operators can evaluate gateway telemetry from their own configured platform. A generic MQTT log needs DJI-specific schema validation.",
      "related": []
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
      "reviewed_on": "2026-10-25",
      "hosting": "Deployment dependent",
      "useful": "Spot fleet operators can inspect permitted robot and run records; local site coordinates require a verified georeference before mapping.",
      "related": []
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
      "reviewed_on": "2026-10-25",
      "hosting": "Deployment dependent",
      "useful": "Integrator reference for documented entity schemas; no operational records are supplied by this catalog.",
      "related": []
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
      "reviewed_on": "2026-10-25",
      "hosting": "Deployment dependent",
      "useful": "Fleet operators can assess timestamped status exports. Indoor map coordinates must be transformed using a verified site reference.",
      "related": []
    },
    {
      "id": "inorbit",
      "vendor": "InOrbit",
      "name": "InOrbit RobOps",
      "category": "Robot fleet platforms",
      "path": [
        "Robot / edge SDK",
        "InOrbit cloud",
        "Fleet application"
      ],
      "protocols": [
        "MQTT",
        "REST API",
        "Streaming API"
      ],
      "data": "Online and historical robot data, attributes, maps and mission status.",
      "access": "Account API key associated with a role-controlled service user.",
      "source": "https://developer.inorbit.ai/docs",
      "gap": "Robot localization may use site coordinates rather than latitude/longitude. MQTT alone is not a vendor fingerprint.",
      "hosting": "Cloud",
      "useful": "Fleet owners can evaluate a read-only export of timestamped status and localization; preserve the coordinate frame.",
      "related": [
        {
          "name": "MQTT connectivity explained",
          "url": "https://www.inorbit.ai/faq"
        }
      ],
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "formant",
      "vendor": "Formant",
      "name": "Formant telemetry",
      "category": "Robot fleet platforms",
      "path": [
        "Robot agent / Cloud SDK",
        "Formant cloud",
        "Telemetry application"
      ],
      "protocols": [
        "API",
        "Cloud SDK"
      ],
      "data": "Text, numerical, navigation and perception streams; historical data and device configuration via APIs.",
      "access": "Organization-authorized API access.",
      "source": "https://docs.formant.io/reference/api-sdk-overview",
      "gap": "Stream content and collection rates depend on customer configuration. No public fleet feed verified.",
      "hosting": "Cloud",
      "useful": "Operators can review historical navigation streams and timestamps before proposing a data import.",
      "related": [
        {
          "name": "Telemetry stream behavior",
          "url": "https://docs.formant.io/en_US/docs/how-telemetry-streams-work"
        },
        {
          "name": "API visualization access",
          "url": "https://docs.formant.io/docs/custom-web-views"
        }
      ],
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "viam",
      "vendor": "Viam",
      "name": "Viam data management",
      "category": "Robot fleet platforms",
      "path": [
        "Configured machine sensors",
        "Local buffer / cloud sync",
        "Data client / export"
      ],
      "protocols": [
        "gRPC",
        "Protocol buffers",
        "SDK"
      ],
      "data": "Configured sensor readings and binary data; cloud queries and exports. Offline capture can sync after connectivity returns.",
      "access": "Authorized machine and cloud credentials with appropriate permissions.",
      "source": "https://docs.viam.com/data-ai/",
      "gap": "Data exists only for configured capture sources. Sync time is different from observation time.",
      "hosting": "Cloud + edge",
      "useful": "Useful for delayed contributions: retain original capture time, units and location source instead of treating upload time as a new sighting.",
      "related": [
        {
          "name": "Client APIs",
          "url": "https://docs.viam.com/reference/apis/"
        },
        {
          "name": "Cloud connection",
          "url": "https://docs.viam.com/build-apps/tasks/connect-to-cloud/"
        }
      ],
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "flytbase",
      "vendor": "FlytBase",
      "name": "FlytBase Flinks",
      "category": "Drones",
      "path": [
        "Drone operations",
        "FlytBase",
        "Partner workflows"
      ],
      "protocols": [
        "Partner integrations",
        "API access"
      ],
      "data": "Workflow connections to alarms, video management, airspace services and data platforms.",
      "access": "Customer integration credentials; access and lifecycle controls depend on the configured integration.",
      "source": "https://flytbase.com/flinks",
      "gap": "A listed partner does not establish a live deployment or publicly available flight data.",
      "hosting": "Cloud",
      "useful": "Operators can identify which configured Flink holds their flight output and verify export availability with that provider.",
      "related": [
        {
          "name": "API access controls",
          "url": "https://docs.flytbase.com/en/pre-flight-modules/platform-settings/enhanced-api-access"
        }
      ],
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "dronedeploy",
      "vendor": "DroneDeploy",
      "name": "DroneDeploy processing APIs",
      "category": "Drones",
      "path": [
        "Drone imagery / capture",
        "DroneDeploy processing",
        "Maps / application"
      ],
      "protocols": [
        "REST API"
      ],
      "data": "Published API guides cover map processing and uploads of photo, video and panorama plans.",
      "access": "Customer API access and supported subscription features.",
      "source": "https://help.dronedeploy.com/hc/en-us/sections/1500000794002-API",
      "gap": "A processed map is an imagery product, not a current drone position. Capture footprints must not be displayed as live flights.",
      "hosting": "Cloud",
      "useful": "Useful historical evidence requires capture dates and a verified footprint, with permission to redistribute the metadata.",
      "related": [],
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "parrot",
      "vendor": "Parrot",
      "name": "Olympe / Air SDK",
      "category": "Drones",
      "path": [
        "Supported ANAFI aircraft",
        "Local controller / onboard mission",
        "Developer application"
      ],
      "protocols": [
        "Olympe SDK",
        "Air SDK telemetry"
      ],
      "data": "Controller events and onboard telemetry sections, depending on aircraft and SDK version.",
      "access": "Access to a supported aircraft/controller or onboard mission environment.",
      "source": "https://developer.parrot.com/docs/olympe/index.html",
      "gap": "This is a local development interface, not a universal cloud API or an SDR decoder.",
      "hosting": "Local / onboard",
      "useful": "Owners can inspect supported telemetry and logs for their exact model before building a receiver bridge.",
      "related": [
        {
          "name": "Air SDK telemetry",
          "url": "https://developer.parrot.com/docs/airsdk/telemetry/index.html"
        }
      ],
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "px4",
      "vendor": "PX4 project",
      "name": "PX4 MAVLink telemetry",
      "category": "Autopilot ecosystems",
      "path": [
        "PX4 flight controller",
        "Configured telemetry link",
        "Ground station / companion"
      ],
      "protocols": [
        "MAVLink"
      ],
      "data": "Configured telemetry and status streams to ground stations or companion systems.",
      "access": "An operator-provided telemetry link and its configured transport.",
      "source": "https://docs.px4.io/main/en/mavlink/",
      "gap": "MAVLink is used by multiple systems; its presence does not identify a manufacturer or imply Internet/cloud connectivity.",
      "hosting": "Local / onboard",
      "useful": "Node builders can evaluate their own telemetry output; a bridge needs message validation, timestamp handling and vehicle identity checks.",
      "related": [],
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "anybotics",
      "vendor": "ANYbotics",
      "name": "ANYmal API / Workforce",
      "category": "Robot dogs",
      "path": [
        "ANYmal / ANYmal X",
        "ANYmal API / Workforce",
        "Asset management / digital twin"
      ],
      "data": "Fleet and mission integration with transfer of inspection data.",
      "source": "https://www.anybotics.com/resources/whitepapers-and-ebooks/api-whitepaper/",
      "protocols": [
        "Published API integration; transport not established here"
      ],
      "access": "Customer deployment and its authorized integrations.",
      "gap": "No public live location feed verified. Indoor coordinates require a verified geographic reference.",
      "hosting": "Deployment dependent",
      "useful": "Operators can evaluate timestamped exports from their own deployment; a dedicated importer is required.",
      "related": [],
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    },
    {
      "id": "locus",
      "vendor": "Locus Robotics",
      "name": "LocusONE / LocusHub",
      "category": "Autonomous ground vehicles",
      "path": [
        "Origin / Vector / Array robots",
        "LocusONE",
        "Warehouse systems / LocusHub"
      ],
      "data": "Mixed-fleet orchestration, operational analytics and warehouse-system integration.",
      "source": "https://locusrobotics.com/platform/locusone/",
      "protocols": [
        "Published API integration; transport not established here"
      ],
      "access": "Customer deployment and its authorized integrations.",
      "gap": "No public live location feed verified. Indoor coordinates require a verified geographic reference.",
      "hosting": "Deployment dependent",
      "useful": "Operators can evaluate timestamped exports from their own deployment; a dedicated importer is required.",
      "related": [],
      "evidence": "Published documentation",
      "connector": "Reference only \u2014 no vendor telemetry connector enabled",
      "reviewed_on": "2026-10-25"
    }
  ]
};
