# No-Bypass Read-Only Store Connectors

GPU Hunter does not bypass CAPTCHA, human-verification, queue, access-denied, or bot-management pages.

The safe connector path is:

1. Read `robots.txt` for the target URL.
2. Fetch one configured product URL at a time with the watcher user agent.
3. Parse public `application/ld+json`, Open Graph/meta tags, canonical URL, price, image, and visible availability text.
4. Never post forms, add to cart, purchase, solve challenges, rotate identities, or flood retries.
5. If a store blocks or challenges the request, keep last-known real listings and show the blocked status.

For eBay, exact item URLs in `stores[].urls` are checked before search/category pages. Set `productOnly: true` for eBay if you want the connector to avoid search/category pages completely.

For ASUS, configured product URLs use the same read-only parser as search pages, with JSON-LD and meta fallback support for title, price, image, SKU, and availability.

Example eBay product-only config:

```json
{
  "id": "ebay",
  "enabled": true,
  "strategy": "public_page",
  "productOnly": true,
  "pollIntervalMs": 900000,
  "maxUrlsPerCheck": 4,
  "urls": [
    "https://www.ebay.com/itm/409040904090"
  ]
}
```

If eBay or ASUS returns a challenge page, GPU Hunter reports that state instead of bypassing it.
