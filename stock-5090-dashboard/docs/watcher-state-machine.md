# GPU Stock Watcher State Machine

This file documents the public-page watcher logic. It is for understanding stock alerts and anti-bot diagnostics, not for buying automation, captcha solving, queue bypassing, proxy rotation, or evading retailer controls.

## Goal

Detect when a GPU becomes newly available for sale from public store pages, then alert once per real in-stock transition.

The watcher answers four questions:

1. Did the public page load?
2. Did the page expose parseable product data?
3. Did any product match the configured GPU keywords and price range?
4. Did that product transition from not-in-stock to in-stock since the previous scan?

## State Machine

```text
IDLE
  -> SCAN_REQUESTED

SCAN_REQUESTED
  -> CHECK_ROBOTS_TXT(store)

CHECK_ROBOTS_TXT(store)
  -> FETCH_PUBLIC_PAGE(store)  when allowed or robots.txt is unavailable
  -> STORE_DEGRADED           when explicitly disallowed

FETCH_PUBLIC_PAGE(store)
  -> CLASSIFY_RESPONSE(store, status, body)

CLASSIFY_RESPONSE
  -> PARSE_PRODUCTS            when page is normal and parseable
  -> STORE_DEGRADED            when blocked, queued, captcha, rate-limited, or template changed
  -> STORE_EMPTY               when page loads but no products are present

PARSE_PRODUCTS
  -> NORMALIZE_LISTINGS

NORMALIZE_LISTINGS
  -> FILTER_BY_GPU_KEYWORDS
  -> FILTER_BY_PRICE_RANGE
  -> DEDUPE_BY_STORE_PRODUCT_ID

DEDUPE_BY_STORE_PRODUCT_ID
  -> COMPARE_WITH_PREVIOUS_SCAN

COMPARE_WITH_PREVIOUS_SCAN
  -> ALERT_NEW_IN_STOCK        when current.inStock == true and previous.inStock != true
  -> SAVE_STATE                otherwise

STORE_DEGRADED
  -> RECORD_DIAGNOSIS
  -> APPLY_COOLDOWN_IF_REPEATED
  -> SAVE_STATE

STORE_EMPTY
  -> SAVE_STATE
```

## Public Response Classifier

```pseudo
function classify_public_response(store, http_status, body, elapsed_ms):
    if robots_txt_explicitly_disallows(store.url):
        return "robots_txt_disallowed"

    if elapsed_ms > configured_timeout:
        return "timeout"

    if http_status in [401, 403]:
        return "blocked_by_store"

    if http_status in [409, 412, 429]:
        return "rate_or_bot_limited_by_store"

    if http_status in [503, 504]:
        return "store_temporarily_unavailable"

    lower_body = lowercase(body)

    if contains_any(lower_body, [
        "captcha",
        "verify you are human",
        "robot check",
        "access denied"
    ]) and not contains_expected_product_shape(store, body):
        return "human_verification_required"

    if contains_any(lower_body, [
        "queue-it",
        "waiting room"
    ]):
        return "retailer_queue_active"

    if not contains_expected_product_shape(store, body):
        return "parser_no_match_or_template_changed"

    return "parseable_public_page"
```

## Store-Specific Product Shape Checks

```pseudo
function contains_expected_product_shape(store, body):
    if store == "bestbuy":
        return body contains sku/product JSON or product URL plus current price

    if store == "walmart":
        return body contains __NEXT_DATA__ product nodes or item stack fields

    if store == "amd":
        return body contains product structured data, price, and product URL

    if store == "newegg":
        return body contains JSON-LD product offers or item-title cards

    if store == "ebay":
        return body contains s-item result cards with title, price, item URL

    if store == "amazon":
        return body contains search result cards with ASIN, title, price

    return false
```

## Alert Logic

```pseudo
function should_alert(previous_state, current_listing):
    key = current_listing.store + ":" + current_listing.productId

    previous = previous_state.listings_by_key[key]

    if current_listing.inStock != true:
        return false

    if previous is missing:
        return true

    if previous.inStock != true and current_listing.inStock == true:
        return true

    return false
```

Important rule: unknown stock is not treated as in-stock. A public search result with a price is useful, but it only becomes alert-worthy when the page text or structured data provides a positive availability signal such as `In Stock`, `Add to Cart`, `Buy It Now`, `shipping available`, or equivalent retailer wording.

## Anti-Bot Diagnostics Policy

The watcher is designed as a good bot:

- it uses an identifiable watcher user agent
- it checks `robots.txt` before fetching public product/search pages
- it scans stores serially instead of in parallel
- it waits between store requests
- it records blocks, queues, verification pages, and rate limits as degraded statuses
- it backs off instead of retrying aggressively

This matches the good-bot pattern described by Radware: transparent purpose, respect for `robots.txt`, and request pacing to reduce server load. It does not use bad-bot patterns such as proxy rotation, detection bypass, challenge solving, fake user actions, or purchase automation.

```pseudo
function handle_diagnosis(store, diagnosis):
    if diagnosis in [
        "human_verification_required",
        "retailer_queue_active",
        "rate_or_bot_limited_by_store",
        "blocked_by_store"
    ]:
        mark_store_degraded(store, diagnosis)
        do_not_retry_immediately(store)
        increase_cooldown(store)
        show_dashboard_message(store, diagnosis)
        return []

    if diagnosis == "parser_no_match_or_template_changed":
        mark_store_degraded(store, diagnosis)
        save_status_for_parser_review(store)
        return []

    if diagnosis == "parseable_public_page":
        return parse_products(store)
```

This watcher does not:

- solve captchas
- bypass queues
- rotate identities
- automate checkout
- reserve carts
- purchase items

It only reads public pages at a controlled rate, records what happened, and alerts on visible stock transitions.

## Cooldown Logic

```pseudo
function next_cooldown_ms(consecutive_failures):
    if consecutive_failures <= 1:
        return 0
    if consecutive_failures == 2:
        return 2 minutes
    if consecutive_failures == 3:
        return 5 minutes
    return 15 minutes
```

## Minimal Scan Loop

```pseudo
function scan_all_stores(config, previous_state):
    current_listings = []
    store_statuses = []
    alerts = []

    for store in config.enabled_stores:
        if store.cooldown_active:
            store_statuses.push(status(store, "cooldown_active"))
            continue

        if robots_txt_explicitly_disallows(store.url):
            store_statuses.push(status(store, "robots_txt_disallowed"))
            continue

        sleep(config.polite_store_request_delay_ms)
        response = fetch_public_page_once(store)
        diagnosis = classify_public_response(store, response.status, response.body, response.elapsed_ms)

        if diagnosis != "parseable_public_page":
            store_statuses.push(status(store, diagnosis))
            continue

        parsed = parse_store_products(store, response.body)
        normalized = normalize_and_filter(parsed, config)
        current_listings.extend(normalized)
        store_statuses.push(status(store, "ok", normalized))

    deduped = dedupe_by_store_product_id(current_listings)

    for listing in deduped:
        if should_alert(previous_state, listing):
            alerts.push(new_in_stock_alert(listing))

    save_state(deduped, store_statuses, alerts)
```
