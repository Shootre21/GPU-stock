# ASUS, AMD, Walmart Good-Bot Architecture

This project must not solve CAPTCHAs, evade bot defenses, overload stores, or automate buying. The watcher can identify protection pages, explain them, back off, and use public product data only when the site allows access.

## Challenge-Aware Source Tool

Run:

```bash
node tools/source-diagnostics.js asus amd walmart
```

The tool checks robots.txt, fetches sequentially with the watcher user-agent, classifies protection pages, and reports whether parseable product signals are present. It does not click, solve, replay tokens, use proxy rotation, or attempt to bypass CAPTCHA systems.

## Shared State Machine

```text
inspectSource(url):
  robots = fetch(origin + "/robots.txt")
  if robots disallows url.path:
    return { diagnosis: "robots_txt_disallowed", action: "do_not_fetch_path" }

  response, html = fetchOnce(url, timeout, watcherUserAgent)

  if html contains DataDome, Cloudflare challenge, CAPTCHA, "verify human", "just a moment":
    return {
      diagnosis: "human_verification_required",
      action: "back_off_and_report_status",
      listings: []
    }

  if status is 429, 412, 409:
    return { diagnosis: "rate_or_bot_limited", action: "increase_interval" }

  productData = parseStructuredData(html)
  if productData is empty:
    return { diagnosis: "parser_no_match_or_no_results" }

  return normalizeListings(productData)
```

## ASUS Store US

Observed behavior: ASUS Store US currently returns DataDome/human-verification pages from this environment.

```text
asusAdapter():
  for configured ASUS search/product URL:
    result = inspectSource(url)
    if result.diagnosis == "human_verification_required":
      show ASUS column as CHECKING / human_verification_required_asus
      keep previous real ASUS listings if any
      wait for ASUS interval
      continue

    parse JSON-LD Product first
    parse Magento product grid JSON or visible product cards second
    require title contains RTX/GeForce and model 3090/4080/4090/5090
```

Architecture path if ASUS remains protected:

```text
allowedASUSPath():
  prefer official ASUS product detail URLs that return JSON-LD
  otherwise use ASUS sitemap/product feed only if robots allows it
  otherwise show protected-store status
  do not automate CAPTCHA solving
```

## AMD

AMD pages are public but often informational rather than priced store pages. The watcher should treat "no priced product data" as an honest result.

```text
amdAdapter():
  for configured AMD graphics/shop URL:
    fetch public page
    if queue/waiting-room/challenge:
      return queue_or_blocked

    parse JSON-LD Product
    parse AMD product cards
    require price and URL before emitting a listing

  if no priced products:
    return no_priced_products_found
```

Architecture path:

```text
improveAMD():
  maintain a small allowlist of real AMD shop/product URLs
  parse structured data only
  never guess unpublished product IDs
  use longer intervals because AMD pages change slowly
```

## Walmart

Observed behavior: Walmart search is blocked by robots.txt, but direct `/ip/...` product pages are reachable and contain structured Next.js product data.

```text
walmartAdapter():
  do not fetch /search paths when robots disallows them
  for configured /ip/<itemId> URLs:
    fetch product page
    parse __NEXT_DATA__.props.pageProps.initialData.data.product
    read:
      title = product.name or SEO title
      price = conditionOffers[0].price.price
      availability = conditionOffers[0].availabilityStatus.value
      productId = itemId/usItemId/productId
      url = canonicalURL

    if title is standalone RTX GPU:
      emit listing
```

Architecture path:

```text
improveWalmart():
  add only real /ip product URLs to config
  cap max product URLs per interval
  use body-read timeout because Walmart pages are large
  never fall back to robots-disallowed search scraping
```

## Alert Logic

```text
alertOnRestock(previousListings, currentListings):
  for listing in currentListings:
    key = store + productId
    if listing.inStock and previous[key] was missing or out of stock:
      play alert sound
      add drop-history link

    if listing.model == "5090" and abs(listing.price - 1999) <= 1 and listing.inStock:
      slow-flash row
      play MSRP alert sound once
```

The right failure mode for a good bot is visible honesty: "protected", "robots disallowed", "no priced product data", or "parser failed", never fake listings.
