# Advanced setup

The normal local setup is just `python3 server.py`. It uses Python's standard library, saves its cache in `.data/`, and serves only the website's public files. Keep the terminal open for collection; press Ctrl+C to stop.

## Options

```sh
python3 server.py --port 8781 --data-dir /path/to/cache
```

For devices on your own network, add `--host 0.0.0.0` and open your computer's LAN address on port 8780. For public hosting, use HTTPS through a suitable reverse proxy or deploy the Cloudflare Worker below. Do not put the cache inside `public/`.

The first collection may take a moment. Upstream outages and rate limits appear as a partial update; retained positions keep their original timestamps. Collection needs internet access, and the basemap loads OpenStreetMap tiles.

## Cloudflare

Optional: Node.js 22+ and a Cloudflare account. The default configuration is standalone and has no Church account, domain or service dependency.

```sh
npm ci
npm run build
npx wrangler login
npm run deploy
```

This serves the browser app, stores records in a SQLite Durable Object and schedules collection every five minutes. Cron changes can take up to 15 minutes to activate. Cached reads can recover overdue collection. Check `/health` for provider status.

`deploy/church.jsonc` is the Church's production configuration. Only Church maintainers should use it; its service binding and routes also insert the homepage promotion and saviorSEC card. See [deployment notes](deployment.txt).

## Development

```sh
python3 -m unittest discover -s tests -v
node --test tests/worker.test.mjs
python3 build_review.py
```

The source archive is rebuilt automatically at local startup. Its explicit allowlist excludes caches, credentials, dependencies and downloaded datasets. Test fixtures never populate the map.
