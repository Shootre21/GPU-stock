# GPU Hunter Fetching Report

GPU Hunter is a read-only stock watcher. It fetches public store pages for observability, never purchases products, never solves CAPTCHA, never rotates identities, and never tries to bypass human-verification systems.

## Scheduler

- Automatic polling wakes every 30 seconds.
- Automatic mode contacts at most one due store per scheduler tick.
- Each store has its own safe interval:
  - Best Buy and Newegg: 5 minutes
  - Amazon: 7 minutes
  - Walmart, B&H Photo, eBay, Antonline, ASUS Store US, MSI Store: 15 minutes
  - AMD: 30 minutes
- Store requests run serially with a minimum 3 second delay.
- Manual `Scan now` checks all enabled sources, still serially and rate-limited.
- If a store is not due yet, the app reuses prior real listings and marks the store as waiting.

## Fetch Policy

```text
for each enabled store:
  if automatic mode and store interval has not elapsed:
    keep previous real listings
    show nextCheckAt
    do not fetch

  check robots.txt for the target path
  if robots disallows the path:
    record robots_txt_disallowed
    do not fetch

  fetch one allowed public URL with:
    user-agent: GPUHunterWatcher/1.0 (+local personal stock alert; no purchase automation)
    timeout
    body-read timeout

  if response is CAPTCHA, DataDome, Cloudflare, "Robot or human?", or human-verification:
    record human_verification_required_<store>
    keep previous real listings if any
    back off until the next interval

  parse structured product data
  filter to standalone RTX 3090 / 4080 / 4090 / 5090 GPUs
  write only real listings and honest store statuses
```

## Store Sources

- Best Buy: public search pages, Apollo/bootstrap product data, no API.
- Newegg: public search pages, JSON-LD first, product-card HTML fallback.
- Amazon: public search pages, search result cards only, no PA-API.
- B&H Photo: configured public product/category URLs, JSON-LD first.
- Walmart: direct `/ip/...` product pages only. Search is not used when robots.txt disallows it.
- eBay: public fixed-price search/category pages when reachable; challenge pages are reported.
- Antonline: configured public product URLs; Cloudflare/human verification is reported.
- ASUS Store US: configured public search URLs; DataDome/human verification is reported.
- MSI Store: public store search/category URLs, generic product-card parser with RTX/GeForce title filter.
- AMD: configured public Radeon pages; emits listings only when priced product data exists.

## Data Normalization

Each listing is normalized to:

```json
{
  "store": "bestbuy",
  "title": "Full retailer title",
  "displayTitle": "Compact GPU title/specs",
  "feedLabel": "bestbuy - Compact GPU title/specs",
  "price": 1999,
  "url": "https://store.example/product",
  "imageUrl": "https://store.example/image.jpg",
  "inStock": true,
  "productId": "store-sku",
  "source": "public parser name",
  "checkedAt": "ISO timestamp",
  "rawAvailability": "retailer availability text",
  "model": "5090",
  "brand": "nvidia",
  "edition": "founders edition",
  "memory": "32gb",
  "msrpHit": true
}
```

## UI Signals

- The stock wall shows store columns and compact `store - title/specs` rows.
- Each GPU row shows its own last updated time.
- Out-of-stock GPUs show flashing `OUT of STOCK`.
- Stores show a spinner while waiting/rechecking.
- From 10 to 5 seconds before a store's scheduled check, the column shows `***Updating***`.
- RTX 5090 listings at `$1,999 ± $1` slow-flash and trigger the alert sound once when newly seen in stock.
- Any newly discovered real GPU listing creates a `new_listing` alert and plays the normal notification sound.
- If a local `sounds/fahhhh.mp3` file is present, MSRP 5090 alerts play it. If the file is missing or blocked by browser autoplay policy, the browser falls back to a local synthesized/spoken `FAAAAHHHH` cue. The app does not download audio from YouTube.

## Diagnostics Tool

Run:

```bash
node tools/source-diagnostics.js asus amd walmart
```

The tool checks robots.txt, fetches politely, classifies challenges, and reports structured-data signals. It is for observability and parser planning only; it does not solve or bypass CAPTCHA.
