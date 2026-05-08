# GPU Hunter Dashboard

GPU stock tracker focused on cleaner signal, stronger deduping, and a better dashboard experience.

## What changed

- Track products by a stable GPU/product identifier instead of raw product URL
- Deduplicate listings by `store + productId`
- Enrich listings with parsed model / brand / edition / memory metadata
- Surface better status cards and clearer store diagnostics
- Refresh the UI to feel more like modern public tracker sites
- Improve Best Buy / Newegg / Walmart extraction so parsers are less brittle
- Run automatic-only collection from enabled store adapters. Manual product input is disabled.
- Explain anti-bot and blocking states as diagnostics with cooldown/backoff, not bypass logic.
- Use public page parsing only. No store APIs, API keys, OAuth, PA-API, or credentialed stock endpoints.
- Run as a polite watcher: identifiable user agent, robots.txt checks, serial store scans, request delay, and cooldowns.

## Competitive notes

After comparing a few public GPU trackers, the best ideas worth borrowing were:

- **GPU Sniper**: simple value framing, fast “deal signal” communication, visible freshness
- **GPUDrip**: clean stats-forward hero section and live summary feel
- **StockMaid**: focus on alerting and restock utility rather than clutter

This dashboard now leans harder into:

- top-level summary metrics
- visible signal quality
- compact cards for listings
- stable product identity to reduce false positives

## Sound files

Place your custom sounds in:

- `sounds/bruh.mp3`
- `sounds/fahhhh.mp3`

Sound paths are configured in `config.json`.

## Local Dashboard Endpoints

- `GET /api/state` — current normalized listings, alerts, summary, and store diagnostics
- `POST /api/scan` — trigger a scan immediately
- `GET /api/health` — lightweight health / scan status endpoint
- `POST /api/watchlist` — disabled with `410 manual_watchlist_disabled`
- `DELETE /api/watchlist/:productId` — disabled with `410 manual_watchlist_disabled`

## Automatic collection

Change enabled stores, queries, and timeouts in `config.json`. The app does not accept manual GPU listings in the UI; all listings must come from public store pages parsed by enabled adapters.

Automatic polling is enabled at a conservative 5-minute interval. Scans run serially, keep the per-store delay, and skip overlapping runs if a previous scan is still active.

## Watcher logic

See `docs/watcher-state-machine.md` for the public-page watcher state machine, alert logic, and anti-bot diagnostics policy. The watcher records blocks, queues, captcha pages, rate limits, and parser changes, then backs off instead of bypassing protections.

## Docker

Build and run directly:

```bash
docker build -t stock-5090-dashboard .
docker run --rm -p 4388:4388 -v $(pwd)/data:/app/data stock-5090-dashboard
```

Or use compose:

```bash
docker compose up --build
```
