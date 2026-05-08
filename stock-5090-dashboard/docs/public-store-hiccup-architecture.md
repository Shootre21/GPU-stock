# Public Store Hiccup Architecture

GPU Hunter is a watcher, not a buyer. When a retailer challenges, rate-limits, or blocks public parsing, the app must show that state clearly and back off instead of bypassing protections.

## Safe Source Ladder

```text
checkStore(store):
  if store interval has not elapsed:
    reuse last real listings
    show WAITING with nextCheckAt
    return

  if robots.txt disallows the path:
    show CHECKING / robots_txt_disallowed
    schedule the next interval
    return

  fetch one configured public search/category/product URL with watcher user-agent

  if HTTP 403, 412, 429, captcha, DataDome, Cloudflare, or human-verification page:
    show CHECKING / blocked_or_human_verification
    do not retry in a tight loop
    schedule a longer interval
    return

  parse in this order:
    1. JSON-LD Product / ItemList data
    2. Next.js or embedded bootstrap product JSON
    3. visible product card HTML

  filter:
    must include RTX 3090, 4080, 4090, or 5090
    must be a standalone GPU
    must not be a prebuilt PC, laptop, RAM/SSD bundle, eGPU dock, or accessory bundle

  emit:
    store - compact product title/specs
    price
    direct product URL
    source parser
    checkedAt
    inStock / outOfStock / unknown
```

## Store-Specific Notes

- eBay: public search/category pages are currently returning challenge/block pages from this environment. The connector tries fixed-price search first, then category fallback, then reports `blocked_by_ebay` or `human_verification_required_ebay`.
- Antonline: public search and sitemap URLs are currently Cloudflare-blocked from this environment. The connector is installed and reports `blocked_by_antonline` until a public page is reachable.
- ASUS Store US: public shop search is currently DataDome-protected from this environment. The connector is installed and reports `blocked_by_asus` without attempting to solve the challenge.
- B&H Photo: configured public product/category URLs are parsed when accessible. If category pages block but product JSON-LD pages work, keep adding real B&H product/category URLs to the config source list.

## Non-Disruptive Behavior

```text
intervalPolicy:
  bestbuy: 5 minutes
  newegg: 5 minutes
  amazon: 7 minutes
  bhphoto: 15 minutes
  ebay: 15 minutes
  walmart: 15 minutes
  antonline: 15 minutes
  asus: 15 minutes
  amd: 30 minutes

onBlocked(store):
  record diagnosis
  keep previous real listings if any
  show CHECKING rather than fake items
  wait for the store interval before trying again
```

## Alert Logic

```text
detectAlert(previous, current):
  for each current listing:
    previousMatch = previous by store + productId
    if current.inStock is true and previousMatch was missing or not in stock:
      create drop alert with direct URL and red price
```

This keeps the dashboard useful while staying polite: real links when public pages return parseable products, and clear diagnostics when the store says no.
