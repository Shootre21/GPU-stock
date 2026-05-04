# GPU Hunter Dashboard

GPU stock tracker focused on cleaner signal, stronger deduping, and a better dashboard experience.

## What changed

- Track products by a stable GPU/product identifier instead of raw product URL
- Deduplicate listings by `store + productId`
- Enrich listings with parsed model / brand / edition / memory metadata
- Surface better status cards and clearer store diagnostics
- Refresh the UI to feel more like modern public tracker sites
- Improve Best Buy / Newegg / Walmart extraction so parsers are less brittle

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

## API

- `GET /api/state` — current normalized listings, alerts, summary, and store diagnostics
- `POST /api/scan` — trigger a scan immediately
- `GET /api/health` — lightweight health / scan status endpoint
- `POST /api/watchlist` — add or replace a manual tracked GPU target by `productId`

### Watchlist payload

```json
{
  "title": "ASUS TUF RTX 5090",
  "productId": "asus-rtx5090-tuf-32gb",
  "price": 2299.99,
  "url": "https://example.com/product-page"
}
```

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
