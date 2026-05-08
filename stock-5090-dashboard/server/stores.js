function nowIso() {
  return new Date().toISOString();
}

const robotsCache = new Map();

function commonHeaders(config = {}) {
  const configuredAgent = config?.goodBot?.userAgent || config?.userAgent;
  return {
    'user-agent': configuredAgent || 'GPUHunterWatcher/1.0 (+local personal stock alert; no purchase automation)',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
}

function storeQuery(storeConfig = {}, fallback = 'rtx 5090') {
  return String(storeConfig.query || fallback).trim();
}

function storeQueries(storeConfig = {}, fallback = 'rtx 5090') {
  const values = Array.isArray(storeConfig.queries) && storeConfig.queries.length
    ? storeConfig.queries
    : [storeConfig.query || fallback];
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean))).slice(0, 8);
}

function combineStatuses(storeConfig, statuses = [], listings = [], source = 'public_page') {
  const blocked = statuses.filter(status => status && status.ok === false);
  const okStatuses = statuses.filter(status => status && status.ok !== false);
  const diagnosis = listings.length
    ? 'public_live_listings_found'
    : blocked.length
      ? blocked.map(status => status.diagnosis).join('; ')
      : 'parser_no_match_or_no_results';
  return makeStatus(storeConfig, {
    ok: listings.length > 0 || (okStatuses.length > 0 && blocked.length === 0),
    source,
    seen: statuses.reduce((sum, status) => sum + Number(status?.seen || 0), 0),
    listingCount: listings.length,
    inStock: listings.filter(item => item.inStock).length,
    diagnosis,
    error: blocked.map(status => status.error).filter(Boolean).join('; ') || null,
    url: statuses.map(status => status.url).filter(Boolean).join(', ')
  });
}

async function politeQueryDelay(storeConfig = {}, config = {}) {
  const delayMs = Number(storeConfig.queryDelayMs || config.queryDelayMs || 750);
  if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 10000)));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function responseTextWithTimeout(response, timeoutMs = 15000) {
  let timer;
  try {
    return await Promise.race([
      response.text(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('body_read_timeout')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function decodeEscapes(value = '') {
  return String(value)
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(value = '') {
  return decodeEscapes(String(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (!value) return NaN;
  const match = String(value).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : NaN;
}

function absoluteUrl(base, maybePath) {
  if (!maybePath) return '';
  const value = decodeEscapes(maybePath);
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, base).toString();
}

function cleanImage(value) {
  if (Array.isArray(value)) return cleanImage(value[0]);
  return decodeEscapes(value || '');
}

function availabilityFromText(value = '') {
  const text = String(value).toLowerCase();
  if (/out\s*of\s*stock|sold\s*out|unavailable|coming\s*soon|currently unavailable|item ended|listing ended/.test(text)) return false;
  if (/in\s*stock|add[_\s-]*to[_\s-]*cart|available\s*now|pickup|shipping available|buy it now/.test(text)) return true;
  return null;
}

function availabilityLabel(inStock) {
  if (inStock === true) return 'in_stock';
  if (inStock === false) return 'out_of_stock';
  return 'unknown';
}

function publicBlockDiagnosis(storeId, response, body = '') {
  const text = String(body).toLowerCase();
  const hasProductShape = /"skuid"|__next_data__|s-item__title|data-asin=|application\/ld\+json|item-title/.test(text);
  if (!hasProductShape && /captcha|verify you are human|robot check|checking your browser|pardon our interruption|datadome|cloudflare|sorry, you have been blocked|just a moment|please enable js/.test(text)) return `human_verification_required_${storeId}`;
  if ([401, 403].includes(response.status)) return `blocked_by_${storeId}`;
  if ([409, 412, 429].includes(response.status)) return `rate_or_bot_limited_by_${storeId}`;
  if ([503, 504].includes(response.status)) return `temporarily_unavailable_${storeId}`;
  if (!hasProductShape && /access denied/.test(text)) return `human_verification_required_${storeId}`;
  if (/queue-it|waiting room/.test(text)) return `queue_or_blocked`;
  return null;
}

function robotsGroups(text = '') {
  const groups = [];
  let current = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const split = line.indexOf(':');
    if (split === -1) continue;
    const key = line.slice(0, split).trim().toLowerCase();
    const value = line.slice(split + 1).trim();
    if (key === 'user-agent') {
      current = { agents: [value.toLowerCase()], rules: [] };
      groups.push(current);
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.rules.push({ type: key, path: value });
    }
  }
  return groups;
}

function robotsRuleRegex(pattern = '') {
  const escaped = pattern
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}`);
}

function robotsAllows(text = '', userAgent = '*', targetPath = '/') {
  const groups = robotsGroups(text);
  const agent = String(userAgent).toLowerCase();
  const applicable = groups.filter(group => group.agents.some(entry => entry === '*' || agent.includes(entry)));
  if (!applicable.length) return true;
  let winner = null;
  for (const group of applicable) {
    for (const rule of group.rules) {
      if (!rule.path) continue;
      const path = rule.path.trim();
      if (!robotsRuleRegex(path).test(targetPath)) continue;
      const score = path.replace(/\*/g, '').length;
      if (!winner || score > winner.score || (score === winner.score && rule.type === 'allow')) {
        winner = { ...rule, path, score };
      }
    }
  }
  return !winner || winner.type !== 'disallow';
}

async function checkRobotsAllowed(url, storeConfig = {}, config = {}) {
  if (storeConfig.respectRobotsTxt === false || config.respectRobotsTxt === false) return { allowed: true, checked: false };
  const parsed = new URL(url);
  const robotsUrl = `${parsed.origin}/robots.txt`;
  const userAgent = commonHeaders(config)['user-agent'];
  let entry = robotsCache.get(robotsUrl);
  if (!entry) {
    try {
      const res = await fetchWithTimeout(robotsUrl, { headers: commonHeaders(config) }, Math.min(storeConfig.timeoutMs || config.storeTimeoutMs || 15000, 5000));
      const text = res.ok ? await res.text() : '';
      entry = { ok: res.ok, text, checkedAt: nowIso() };
    } catch (error) {
      entry = { ok: false, text: '', error: String(error), checkedAt: nowIso() };
    }
    robotsCache.set(robotsUrl, entry);
  }
  if (!entry.ok) return { allowed: true, checked: true, unavailable: true, url: robotsUrl };
  return {
    allowed: robotsAllows(entry.text, userAgent, `${parsed.pathname}${parsed.search}`),
    checked: true,
    url: robotsUrl
  };
}

function makeListing(storeConfig, item) {
  return {
    store: storeConfig.id,
    title: stripTags(item.title || item.name || ''),
    price: parseMoney(item.price),
    url: decodeEscapes(item.url || ''),
    imageUrl: cleanImage(item.imageUrl || item.image || ''),
    inStock: item.inStock === true,
    productId: item.productId ? String(item.productId) : undefined,
    source: item.source || storeConfig.strategy || 'public_page',
    checkedAt: item.checkedAt || nowIso(),
    rawAvailability: item.rawAvailability || availabilityLabel(item.inStock)
  };
}

function makeStatus(storeConfig, overrides = {}) {
  return {
    store: storeConfig.id,
    ok: Boolean(overrides.ok),
    source: overrides.source || storeConfig.strategy || 'public_page',
    strategy: storeConfig.strategy || overrides.source || 'public_page',
    seen: overrides.seen || 0,
    listingCount: overrides.listingCount || 0,
    inStock: overrides.inStock || 0,
    diagnosis: overrides.diagnosis || (overrides.ok ? 'ok' : 'unavailable'),
    checkedAt: overrides.checkedAt || nowIso(),
    error: overrides.error || null,
    url: overrides.url || null
  };
}

function dedupeListings(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.productId || `${item.url}|${item.title}|${item.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function adapterResult(storeConfig, listings, statusOverrides = {}) {
  const clean = listings
    .map(item => makeListing(storeConfig, item))
    .filter(item => item.title && item.url && Number.isFinite(item.price));
  const status = makeStatus(storeConfig, {
    ok: statusOverrides.ok ?? true,
    seen: statusOverrides.seen ?? listings.length,
    listingCount: clean.length,
    inStock: clean.filter(item => item.inStock).length,
    diagnosis: clean.length ? 'public_live_listings_found' : 'parser_no_match_or_no_results',
    ...statusOverrides
  });
  return { listings: dedupeListings(clean), status };
}

function extractJsonBlocks(text = '', marker) {
  const blocks = [];
  let start = 0;
  while (true) {
    const markerIndex = text.indexOf(marker, start);
    if (markerIndex === -1) break;
    const openIndex = text.indexOf('{', markerIndex);
    if (openIndex === -1) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let closed = false;
    for (let i = openIndex; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else {
        if (ch === '"') inString = true;
        else if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            blocks.push(text.slice(openIndex, i + 1));
            start = i + 1;
            closed = true;
            break;
          }
        }
      }
    }
    if (!closed) break;
  }
  return blocks;
}

function parseNextData(text = '') {
  const match = text.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(decodeEscapes(match[1]));
  } catch {
    return null;
  }
}

function walkJson(value, visit, depth = 0, seen = new Set()) {
  if (depth > 28 || value == null) return;
  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value)) visit(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    walkJson(child, visit, depth + 1, seen);
  }
}

function parseBestBuyApolloItems(text = '') {
  const bySku = new Map();
  const ensure = sku => {
    if (!sku) return null;
    const key = String(sku);
    if (!bySku.has(key)) bySku.set(key, { productId: `bestbuy-sku-${key}`, source: 'bestbuy_public_apollo' });
    return bySku.get(key);
  };

  for (const block of extractJsonBlocks(text, 'ApolloSSRDataTransport')) {
    let parsed;
    try {
      parsed = JSON.parse(block.replace(/:undefined/g, ':null'));
    } catch {
      continue;
    }
    walkJson(parsed, value => {
      const sku = value.skuId || value.sku;
      const item = ensure(sku);
      if (!item) return;

      const title = value.name?.short || value.name?.title || value.title;
      if (title) item.title = title;

      const url = value.url?.skuSpecificUrl || value.url?.pdp || value.pdpUrl || value.buyingOptions?.[0]?.pdpUrl;
      if (url) item.url = absoluteUrl('https://www.bestbuy.com', url);

      const image = value.primaryImage?.href || value.primaryImage?.piscesHref || value.image?.href;
      if (image) item.imageUrl = image;

      const price = value.price?.customerPrice ||
        value.price?.displayableCustomerPrice ||
        value.customerPrice ||
        value.displayableCustomerPrice;
      if (Number.isFinite(parseMoney(price))) item.price = price;

      const shipping = Array.isArray(value.shippingAvailability) ? value.shippingAvailability : [];
      const pickup = Array.isArray(value.ispuAvailability) ? value.ispuAvailability : [];
      if (shipping.some(entry => entry.shippingEligible === true || entry.preorderable === true)) {
        item.inStock = true;
        item.rawAvailability = 'shipping_available';
      }
      if (pickup.some(entry => entry.pickupEligible === true || entry.instoreInventoryAvailable === true || entry.quantity > 0)) {
        item.inStock = true;
        item.rawAvailability = 'pickup_available';
      }

      const textAvailability = availabilityFromText(JSON.stringify(value).slice(0, 5000));
      if (item.inStock !== true && textAvailability != null) {
        item.inStock = textAvailability;
        item.rawAvailability = availabilityLabel(textAvailability);
      }
    });
  }

  return Array.from(bySku.values())
    .filter(item => item.title && item.url && Number.isFinite(parseMoney(item.price)))
    .map(item => ({
      ...item,
      inStock: item.inStock === true,
      rawAvailability: item.rawAvailability || 'availability_unknown'
    }));
}

function publicHtmlChunks(text, splitPattern, endPattern) {
  return text.split(splitPattern).slice(1).map(chunk => {
    const end = chunk.search(endPattern);
    return end === -1 ? chunk : chunk.slice(0, end);
  });
}

async function fetchPublicHtml(storeConfig, config, url) {
  const timeoutMs = storeConfig.timeoutMs || config.storeTimeoutMs || 15000;
  const robots = await checkRobotsAllowed(url, storeConfig, config);
  if (!robots.allowed) {
    return {
      blocked: true,
      text: '',
      status: makeStatus(storeConfig, {
        ok: false,
        source: storeConfig.strategy || 'public_page',
        diagnosis: 'robots_txt_disallowed',
        error: `robots.txt disallows ${storeConfig.id} path`,
        url
      })
    };
  }
  const res = await fetchWithTimeout(url, { headers: commonHeaders(config) }, timeoutMs);
  let text = '';
  try {
    text = await responseTextWithTimeout(res, timeoutMs);
  } catch (error) {
    return {
      blocked: true,
      text: '',
      status: makeStatus(storeConfig, {
        ok: false,
        source: storeConfig.strategy || 'public_page',
        diagnosis: 'body_read_timeout',
        error: `${storeConfig.id}_${String(error.message || error)}`,
        url
      })
    };
  }
  const diagnosis = publicBlockDiagnosis(storeConfig.id, res, text);
  if (diagnosis) {
    return {
      blocked: true,
      text,
      status: makeStatus(storeConfig, {
        ok: false,
        source: storeConfig.strategy || 'public_page',
        diagnosis,
        error: `${storeConfig.id}_http_${res.status}`,
        url
      })
    };
  }
  if (!res.ok) throw new Error(`${storeConfig.id}_http_${res.status}`);
  return { blocked: false, text };
}

function statusForUrlResult(storeConfig, items, source, url) {
  return makeStatus(storeConfig, {
    ok: true,
    source,
    seen: items.length,
    listingCount: items.length,
    inStock: items.filter(item => item.inStock).length,
    diagnosis: items.length ? 'public_live_listings_found' : 'parser_no_match_or_no_results',
    url
  });
}

async function fetchBestBuy(storeConfig = {}, config = {}) {
  const queries = storeQueries(storeConfig);
  if (!storeConfig._singleQuery && queries.length > 1) {
    const listings = [];
    const statuses = [];
    for (const query of queries) {
      if (statuses.length) await politeQueryDelay(storeConfig, config);
      const result = await fetchBestBuy({ ...storeConfig, query, _singleQuery: true }, config);
      listings.push(...result.listings);
      statuses.push(result.status);
    }
    const deduped = dedupeListings(listings);
    return { listings: deduped, status: combineStatuses(storeConfig, statuses, deduped, 'bestbuy_public_page') };
  }
  const params = new URLSearchParams({ st: storeQuery(storeConfig) });
  const url = `https://www.bestbuy.com/site/searchpage.jsp?${params.toString()}`;
  const fetched = await fetchPublicHtml(storeConfig, config, url);
  if (fetched.blocked) return { listings: [], status: fetched.status };
  const text = fetched.text;
  const items = [];

  items.push(...parseBestBuyApolloItems(text));

  for (const block of extractJsonBlocks(text, 'shop-specifications')) {
    try {
      const data = JSON.parse(block);
      const candidates = [
        ...(Array.isArray(data?.searchResults?.products) ? data.searchResults.products : []),
        ...(Array.isArray(data?.products) ? data.products : [])
      ];
      for (const product of candidates) {
        const title = product?.names?.title || product?.name;
        const path = product?.url || product?.relativeUrl || product?.links?.web?.href;
        const price = product?.prices?.current || product?.price?.currentPrice || product?.price?.customerPrice;
        const imageUrl = product?.images?.standard || product?.images?.primary || product?.image;
        const productId = product?.skuId || product?.sku || product?.id;
        const availability = availabilityFromText(JSON.stringify(product));
        if (!title || !path || !Number.isFinite(parseMoney(price))) continue;
        items.push({
          title,
          price,
          url: absoluteUrl('https://www.bestbuy.com', path),
          imageUrl,
          inStock: availability === true,
          productId: productId ? `bestbuy-sku-${productId}` : undefined,
          source: 'bestbuy_public_page',
          rawAvailability: availabilityLabel(availability)
        });
      }
    } catch {}
  }

  if (!items.length) {
    const matches = [...text.matchAll(/"skuId":"?(\d+)"?[\s\S]*?"names":\{"title":"(.*?)"\}[\s\S]*?"currentPrice":(\d+(?:\.\d+)?)[\s\S]*?"url":"(\/site\/.*?)"[\s\S]*?"image":"(.*?)"/g)];
    for (const match of matches.slice(0, 24)) {
      const availability = availabilityFromText(text.slice(match.index || 0, (match.index || 0) + 3000));
      items.push({
        title: decodeEscapes(match[2]),
        price: Number(match[3]),
        url: `https://www.bestbuy.com${decodeEscapes(match[4])}`,
        imageUrl: decodeEscapes(match[5]),
        inStock: availability === true,
        productId: `bestbuy-sku-${match[1]}`,
        source: 'bestbuy_public_page',
        rawAvailability: availabilityLabel(availability)
      });
    }
  }

  return adapterResult(storeConfig, items, {
    source: items.some(item => item.source === 'bestbuy_public_apollo') ? 'bestbuy_public_apollo' : 'bestbuy_public_page',
    seen: items.length,
    diagnosis: items.length ? 'public_live_listings_found' : 'parser_no_match_or_no_results',
    ok: true,
    url
  });
}

async function fetchNewegg(storeConfig = {}, config = {}) {
  const queries = storeQueries(storeConfig);
  if (!storeConfig._singleQuery && queries.length > 1) {
    const listings = [];
    const statuses = [];
    for (const query of queries) {
      if (statuses.length) await politeQueryDelay(storeConfig, config);
      const result = await fetchNewegg({ ...storeConfig, query, _singleQuery: true }, config);
      listings.push(...result.listings);
      statuses.push(result.status);
    }
    const deduped = dedupeListings(listings);
    return { listings: deduped, status: combineStatuses(storeConfig, statuses, deduped, 'newegg_public_page') };
  }
  const params = new URLSearchParams({ d: storeQuery(storeConfig) });
  const url = `https://www.newegg.com/p/pl?${params.toString()}`;
  const fetched = await fetchPublicHtml(storeConfig, config, url);
  if (fetched.blocked) return { listings: [], status: fetched.status };
  const text = fetched.text;
  const items = [];

  const jsonLdMatches = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed?.itemListElement) ? parsed.itemListElement.map(entry => entry.item).filter(Boolean) : [];
      for (const product of candidates) {
        const availability = availabilityFromText(product?.offers?.availability || '');
        items.push({
          title: product?.name,
          price: product?.offers?.price,
          url: product?.url,
          imageUrl: product?.image,
          inStock: availability === true,
          productId: product?.sku || product?.mpn || product?.productID ? `newegg-${product.sku || product.mpn || product.productID}` : undefined,
          source: 'newegg_public_jsonld',
          rawAvailability: product?.offers?.availability || availabilityLabel(availability)
        });
      }
    } catch {}
  }

  if (!items.length) {
    const chunks = publicHtmlChunks(text, /<div[^>]+class="[^"]*item-cell[^"]*"[^>]*>/i, /(?=<div[^>]+class="[^"]*item-cell[^"]*"|<div class="list-tools-bar"|$)/i);
    for (const chunk of chunks.slice(0, 32)) {
      const titleMatch = chunk.match(/<a[^>]+class="[^"]*item-title[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
        chunk.match(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*item-title[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const priceMatch = chunk.match(/<li[^>]+class="[^"]*price-current[^"]*"[^>]*>[\s\S]*?\$[\s\S]*?<strong>([\d,]+)<\/strong>(?:<sup>(\.\d+)<\/sup>)?/i);
      if (!titleMatch || !priceMatch) continue;
      const urlValue = decodeEscapes(titleMatch[1]);
      const productId = (urlValue.match(/\/p\/([A-Z0-9]+)/i) || [])[1];
      const availability = availabilityFromText(chunk);
      const outOfStock = /out of stock|auto notify|sold out/i.test(chunk);
      const imageUrl = (chunk.match(/<img[^>]+(?:src|data-src)="([^"]+)"/i) || [])[1];
      items.push({
        title: stripTags(titleMatch[2]),
        price: Number(`${priceMatch[1].replace(/,/g, '')}${priceMatch[2] || ''}`),
        url: urlValue,
        imageUrl: decodeEscapes(imageUrl || ''),
        inStock: outOfStock ? false : availability !== false,
        productId: productId ? `newegg-${productId}` : undefined,
        source: 'newegg_public_page',
        rawAvailability: outOfStock ? 'out_of_stock' : availabilityLabel(availability)
      });
    }
  }

  return adapterResult(storeConfig, items, {
    source: items.some(item => item.source === 'newegg_public_jsonld') ? 'newegg_public_jsonld' : 'newegg_public_page',
    seen: items.length,
    diagnosis: items.length ? 'public_live_listings_found' : 'parser_no_match_or_no_results',
    url
  });
}

function walmartPrice(product) {
  return parseMoney(
    product?.priceInfo?.currentPrice?.price ||
    product?.priceInfo?.linePrice ||
    product?.priceInfo?.priceDisplay ||
    product?.price ||
    product?.priceString ||
    product?.salePrice
  );
}

function walmartImage(product) {
  return product?.imageInfo?.thumbnailUrl || product?.imageInfo?.allImages?.[0]?.url || product?.image || product?.thumbnailUrl || '';
}

function parseWalmartProductsFromHtml(text = '', url = 'https://www.walmart.com') {
  const items = [];
  const nextData = parseNextData(text);

  if (nextData) {
    const pageProps = nextData?.props?.pageProps || {};
    const root = pageProps?.initialData?.data || {};
    const seo = root.seoItemMetaData || {};
    const candidates = [
      root.product,
      ...(Array.isArray(pageProps.products) ? pageProps.products : [])
    ].filter(Boolean);
    for (const product of candidates) {
      const conditionOffer = Array.isArray(product.conditionOffers) ? product.conditionOffers[0] : null;
      const title = product.name || product.title || product.productName || seo.metaTitle || seo.onPageElements?.title;
      const canonicalUrl = product.canonicalUrl || product.productPageUrl || product.productUrl || seo.canonicalURL;
      const productUrl = canonicalUrl ? absoluteUrl('https://www.walmart.com', canonicalUrl) : url;
      const price = parseMoney(
        walmartPrice(product) ||
        product.priceInfo?.currentPrice?.price ||
        conditionOffer?.price?.price ||
        conditionOffer?.price?.priceString ||
        product.primaryOffer?.offerPrice?.price ||
        product.primaryOffer?.offerPrice?.priceString
      );
      if (!title || !Number.isFinite(price)) continue;
      const fulfillmentSummary = Array.isArray(product.fulfillmentSummary) ? product.fulfillmentSummary.map(entry => entry.fulfillment).join(' ') : '';
      const availabilityValue = conditionOffer?.availabilityStatus?.value ||
        conditionOffer?.availabilityStatus?.display ||
        product.availabilityStatus ||
        product.fulfillmentBadge ||
        product.fulfillmentTitle ||
        fulfillmentSummary ||
        '';
      const outOfStock = typeof product.isOutOfStock === 'boolean' ? product.isOutOfStock : null;
      const availability = availabilityFromText(availabilityValue);
      const inStock = outOfStock == null ? availability === true : !outOfStock;
      const productId = product.usItemId || product.itemId || product.productId || product.primaryUsItemId || (String(productUrl).match(/\/(\d+)(?:[?#].*)?$/) || [])[1];
      items.push({
        title: String(title).replace(/\s+-\s*Walmart\.com$/i, ''),
        price,
        url: productUrl,
        imageUrl: walmartImage(product),
        inStock,
        productId: productId ? `walmart-${productId}` : undefined,
        source: 'walmart_public_next_data',
        rawAvailability: availabilityValue || (outOfStock == null ? availabilityLabel(availability) : availabilityLabel(inStock))
      });
    }
  }

  return dedupeListings(items);

  if (!items.length) {
    const jsonLdMatches = [...text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of jsonLdMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        const roots = Array.isArray(parsed) ? parsed : [parsed];
        for (const root of roots) {
          walkJson(root, value => {
            const type = Array.isArray(value['@type']) ? value['@type'].join(' ') : value['@type'];
            if (!/product/i.test(String(type || ''))) return;
            const offer = Array.isArray(value.offers) ? value.offers[0] : value.offers;
            const price = parseMoney(offer?.price || value.price);
            if (!value.name || !Number.isFinite(price)) return;
            const productUrl = absoluteUrl(url, value.url || offer?.url || url);
            const availability = availabilityFromText(`${offer?.availability || ''} ${offer?.availabilityStatus || ''}`);
            const productId = value.sku || value.mpn || (String(productUrl).match(/\/(\d+)(?:[?#].*)?$/) || [])[1];
            items.push({
              title: value.name,
              price,
              url: productUrl,
              imageUrl: value.image,
              inStock: availability === true,
              productId: productId ? `walmart-${productId}` : undefined,
              source: 'walmart_public_jsonld',
              rawAvailability: offer?.availability || availabilityLabel(availability)
            });
          });
        }
      } catch {}
    }
  }

  if (!items.length) {
    const matches = [...text.matchAll(/"canonicalUrl":"(\/ip\/.*?)"[\s\S]*?"name":"(.*?)"[\s\S]*?"image":"(https:\/\/[^"]+)"[\s\S]*?"price":(\d+(?:\.\d+)?)[\s\S]*?"isOutOfStock":(true|false)[\s\S]*?"usItemId":"?(\d+)"?/g)];
    for (const match of matches.slice(0, 24)) {
      const inStock = match[5] === 'false';
      items.push({
        title: decodeEscapes(match[2]),
        price: Number(match[4]),
        url: `https://www.walmart.com${decodeEscapes(match[1])}`,
        imageUrl: decodeEscapes(match[3]),
        inStock,
        productId: `walmart-${match[6]}`,
        source: 'walmart_public_page',
        rawAvailability: availabilityLabel(inStock)
      });
    }
  }

  return dedupeListings(items);
}

async function fetchWalmartPublicUrl(storeConfig = {}, config = {}, url, source = 'walmart_public_page') {
  if (process.env.DEBUG_WALMART) console.error('walmart fetch start', url);
  const fetched = await fetchPublicHtml(storeConfig, config, url);
  if (process.env.DEBUG_WALMART) console.error('walmart fetch done', url, fetched.blocked, fetched.text.length, fetched.status?.diagnosis);
  if (fetched.blocked) return { listings: [], status: { ...fetched.status, source } };
  if (process.env.DEBUG_WALMART) console.error('walmart parse start', url);
  const items = parseWalmartProductsFromHtml(fetched.text, url);
  if (process.env.DEBUG_WALMART) console.error('walmart parse done', url, items.length);
  return adapterResult(storeConfig, items, {
    source: items.some(item => item.source === 'walmart_public_next_data') ? 'walmart_public_next_data' : source,
    seen: items.length,
    diagnosis: items.length ? 'public_live_listings_found' : 'parser_no_match_or_no_results',
    url
  });
}

async function fetchWalmart(storeConfig = {}, config = {}) {
  const urls = Array.isArray(storeConfig.urls) ? storeConfig.urls : [];
  if (!storeConfig._singleQuery && !storeConfig._singleUrl && urls.length) {
    const listings = [];
    const statuses = [];
    const maxUrls = Math.min(Math.max(Number(storeConfig.maxUrlsPerCheck || 6), 1), 12);
    for (const url of urls.slice(0, maxUrls)) {
      if (statuses.length) await politeQueryDelay(storeConfig, config);
      const result = await fetchWalmart({ ...storeConfig, _singleUrl: true, url }, config);
      listings.push(...result.listings);
      statuses.push(result.status);
    }
    const deduped = dedupeListings(listings);
    if (deduped.length || storeConfig.urlsOnly) {
      return { listings: deduped, status: combineStatuses(storeConfig, statuses, deduped, 'walmart_public_product_page') };
    }
  }
  if (storeConfig._singleUrl && storeConfig.url) {
    return fetchWalmartPublicUrl(storeConfig, config, storeConfig.url, 'walmart_public_product_page');
  }

  const queries = storeQueries(storeConfig);
  if (!storeConfig._singleQuery && queries.length > 1) {
    const listings = [];
    const statuses = [];
    for (const query of queries) {
      if (statuses.length) await politeQueryDelay(storeConfig, config);
      const result = await fetchWalmart({ ...storeConfig, query, _singleQuery: true }, config);
      listings.push(...result.listings);
      statuses.push(result.status);
    }
    const deduped = dedupeListings(listings);
    return { listings: deduped, status: combineStatuses(storeConfig, statuses, deduped, 'walmart_public_page') };
  }
  const params = new URLSearchParams({ q: storeQuery(storeConfig) });
  const url = `https://www.walmart.com/search?${params.toString()}`;
  return fetchWalmartPublicUrl(storeConfig, config, url, 'walmart_public_search');
}

async function fetchAmd(storeConfig = {}, config = {}) {
  const urls = Array.isArray(storeConfig.urls) ? storeConfig.urls : [];
  if (!urls.length) {
    return { listings: [], status: makeStatus(storeConfig, { ok: false, source: 'amd_public_page', diagnosis: 'missing_configured_urls' }) };
  }
  const items = [];
  const checkedUrls = [];

  for (const url of urls) {
    checkedUrls.push(url);
    const fetched = await fetchPublicHtml(storeConfig, config, url);
    if (fetched.blocked) return { listings: [], status: fetched.status };
    const text = fetched.text;
    const jsonLdMatches = [...text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)];
    for (const match of jsonLdMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        const values = Array.isArray(parsed) ? parsed : [parsed];
        for (const value of values) {
          walkJson(value, product => {
            const type = Array.isArray(product['@type']) ? product['@type'].join(' ') : product['@type'];
            if (!/product/i.test(String(type || ''))) return;
            const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
            const price = parseMoney(offer?.price || product.price);
            const productUrl = product.url || offer?.url || url;
            if (!product.name || !Number.isFinite(price)) return;
            const availability = availabilityFromText(offer?.availability || '');
            items.push({
              title: product.name,
              price,
              url: absoluteUrl(url, productUrl),
              imageUrl: product.image,
              inStock: availability === true,
              productId: product.sku ? `amd-${product.sku}` : `amd-${absoluteUrl(url, productUrl).split('/').filter(Boolean).pop()}`,
              source: 'amd_public_jsonld',
              rawAvailability: offer?.availability || availabilityLabel(availability)
            });
          });
        }
      } catch {}
    }
  }

  return adapterResult(storeConfig, items, {
    source: 'amd_public_page',
    seen: items.length,
    diagnosis: items.length ? 'public_live_listings_found' : 'no_priced_products_found',
    ok: true,
    url: checkedUrls.join(', ')
  });
}

async function fetchEbay(storeConfig = {}, config = {}) {
  const queries = storeQueries(storeConfig);
  if (!storeConfig._singleQuery && queries.length > 1) {
    const listings = [];
    const statuses = [];
    for (const query of queries) {
      if (statuses.length) await politeQueryDelay(storeConfig, config);
      const result = await fetchEbay({ ...storeConfig, query, _singleQuery: true }, config);
      listings.push(...result.listings);
      statuses.push(result.status);
    }
    const deduped = dedupeListings(listings);
    return { listings: deduped, status: combineStatuses(storeConfig, statuses, deduped, 'ebay_public_search') };
  }
  const params = new URLSearchParams({ LH_BIN: '1', mkcid: '2', _nkw: storeQuery(storeConfig) });
  const url = `https://www.ebay.com/sch/i.html?${params.toString()}`;
  const first = await fetchEbayPublicUrl(storeConfig, config, url, 'ebay_public_search');
  if (!first.status || first.status.ok !== false || first.listings.length) return first;

  const fallbackUrls = Array.isArray(storeConfig.categoryUrls) ? storeConfig.categoryUrls : [];
  if (!fallbackUrls.length) return first;
  const listings = [...first.listings];
  const statuses = [first.status];
  for (const fallbackUrl of fallbackUrls.slice(0, 4)) {
    await politeQueryDelay(storeConfig, config);
    const result = await fetchEbayPublicUrl(storeConfig, config, fallbackUrl, 'ebay_public_category');
    listings.push(...result.listings);
    statuses.push(result.status);
    if (result.listings.length) break;
  }
  const deduped = dedupeListings(listings);
  return { listings: deduped, status: combineStatuses(storeConfig, statuses, deduped, 'ebay_public_search') };
}

async function fetchEbayPublicUrl(storeConfig = {}, config = {}, url, source) {
  const fetched = await fetchPublicHtml(storeConfig, config, url);
  if (fetched.blocked) return { listings: [], status: { ...fetched.status, source } };
  const items = [];
  const chunks = publicHtmlChunks(fetched.text, /<li[^>]+class="[^"]*s-item[^"]*"[^>]*>/i, /<\/li>/i);

  if (!chunks.length) {
    chunks.push(...publicHtmlChunks(fetched.text, /<div[^>]+class="[^"]*(?:s-item|brwrvr__item|b-list__item)[^"]*"[^>]*>/i, /(?=<div[^>]+class="[^"]*(?:s-item|brwrvr__item|b-list__item)[^"]*"|$)/i));
  }

  for (const chunk of chunks.slice(0, 40)) {
    const href = (
      chunk.match(/<a[^>]+class="[^"]*(?:s-item__link|b-tile|brwrvr__item-card)[^"]*"[^>]+href="([^"]*\/itm\/[^"]+)"/i) ||
      chunk.match(/<a[^>]+href="([^"]*\/itm\/[^"]+)"[^>]+class="[^"]*(?:s-item__link|b-tile|brwrvr__item-card)[^"]*"/i) ||
      chunk.match(/<a[^>]+href="([^"]*\/itm\/[^"]+)"/i) ||
      []
    )[1];
    const title = stripTags(
      (chunk.match(/<div[^>]+class="[^"]*s-item__title[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] ||
      (chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || [])[1] ||
      (chunk.match(/<img[^>]+alt="([^"]+)"/i) || [])[1] ||
      ''
    );
    const priceText = stripTags(
      (chunk.match(/<span[^>]+class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] ||
      (chunk.match(/<span[^>]+class="[^"]*(?:price|bold)[^"]*"[^>]*>([\s\S]*?\$[\s\S]*?)<\/span>/i) || [])[1] ||
      ''
    );
    const imageUrl = (chunk.match(/<img[^>]+(?:src|data-src)="([^"]+)"/i) || [])[1];
    const itemId = (decodeEscapes(href || '').match(/\/itm\/(?:[^/]+\/)?(\d+)/i) || [])[1];
    if (!href || !title || !priceText || /shop on ebay/i.test(title)) continue;
    items.push({
      title,
      price: priceText,
      url: decodeEscapes(href),
      imageUrl,
      inStock: !/sold|ended|out of stock/i.test(chunk),
      productId: itemId ? `ebay-${itemId}` : undefined,
      source,
      rawAvailability: 'fixed_price_public_listing'
    });
  }

  return adapterResult(storeConfig, items, {
    source,
    seen: items.length,
    diagnosis: items.length ? 'public_live_listings_found' : 'parser_no_match_or_no_results',
    url
  });
}

async function fetchAmazon(storeConfig = {}, config = {}) {
  const queries = storeQueries(storeConfig);
  if (!storeConfig._singleQuery && queries.length > 1) {
    const listings = [];
    const statuses = [];
    for (const query of queries) {
      if (statuses.length) await politeQueryDelay(storeConfig, config);
      const result = await fetchAmazon({ ...storeConfig, query, _singleQuery: true }, config);
      listings.push(...result.listings);
      statuses.push(result.status);
    }
    const deduped = dedupeListings(listings);
    return { listings: deduped, status: combineStatuses(storeConfig, statuses, deduped, 'amazon_public_search') };
  }
  const params = new URLSearchParams({ k: storeQuery(storeConfig) });
  const url = `https://www.amazon.com/s?${params.toString()}`;
  const fetched = await fetchPublicHtml(storeConfig, config, url);
  if (fetched.blocked) return { listings: [], status: fetched.status };
  const items = [];
  const chunks = [...fetched.text.matchAll(/<div[^>]+data-asin="([A-Z0-9]{10})"[^>]*>([\s\S]*?)(?=<div[^>]+data-asin="[A-Z0-9]{10}"|$)/gi)]
    .map(match => ({ asin: match[1], html: match[2] }));

  for (const { asin, html: chunk } of chunks.slice(0, 30)) {
    const title = stripTags((chunk.match(/<h2[\s\S]*?<\/h2>/i) || [])[0] || (chunk.match(/<span[^>]+class="[^"]*a-text-normal[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
    const whole = stripTags((chunk.match(/<span[^>]+class="[^"]*a-price-whole[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
    const fraction = stripTags((chunk.match(/<span[^>]+class="[^"]*a-price-fraction[^"]*"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '00');
    const imageUrl = (chunk.match(/data-image-src="([^"]+)"/i) || chunk.match(/<img[^>]+src="([^"]+)"/i) || [])[1];
    const productPath = (chunk.match(/<a[^>]+class="[^"]*a-link-normal[^"]*"[^>]+href="([^"]*\/dp\/[^"]+)"/i) || [])[1];
    const availability = availabilityFromText(chunk);
    if (!asin || !title || !whole) continue;
    items.push({
      title,
      price: `${whole}.${fraction}`,
      url: productPath ? absoluteUrl('https://www.amazon.com', productPath) : `https://www.amazon.com/dp/${asin}`,
      imageUrl,
      inStock: availability === true,
      productId: `amazon-${asin}`,
      source: 'amazon_public_search',
      rawAvailability: availability === null ? 'search_result_availability_unknown' : availabilityLabel(availability)
    });
  }

  return adapterResult(storeConfig, items, {
    source: 'amazon_public_search',
    seen: items.length,
    diagnosis: items.length ? 'public_live_listings_found' : 'parser_no_match_or_no_results',
    url
  });
}

async function fetchBhPhoto(storeConfig = {}, config = {}) {
  const urls = Array.isArray(storeConfig.urls) ? storeConfig.urls : [];
  if (!urls.length) {
    return { listings: [], status: makeStatus(storeConfig, { ok: false, source: 'bhphoto_public_page', diagnosis: 'missing_configured_urls' }) };
  }

  const listings = [];
  const statuses = [];
  const maxUrls = Math.min(Math.max(Number(storeConfig.maxUrlsPerCheck || 6), 1), 12);
  for (const url of urls.slice(0, maxUrls)) {
    if (statuses.length) await politeQueryDelay(storeConfig, config);
    const fetched = await fetchPublicHtml(storeConfig, config, url);
    if (fetched.blocked) {
      statuses.push(fetched.status);
      continue;
    }

    const items = [];
    const jsonLdMatches = [...fetched.text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of jsonLdMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        const roots = Array.isArray(parsed) ? parsed : [parsed];
        for (const root of roots) {
          walkJson(root, value => {
            const type = Array.isArray(value['@type']) ? value['@type'].join(' ') : value['@type'];
            if (!/product/i.test(String(type || ''))) return;
            const offer = Array.isArray(value.offers) ? value.offers[0] : value.offers;
            const price = parseMoney(offer?.price || value.price);
            const title = value.name || value.headline;
            const productUrl = value.url || offer?.url || url;
            if (!title || !Number.isFinite(price)) return;
            const availability = availabilityFromText(`${offer?.availability || ''} ${offer?.availabilityStarts || ''}`);
            const sku = value.sku || value.mpn || (String(productUrl).match(/\/c\/product\/(\d+)/) || [])[1];
            items.push({
              title,
              price,
              url: absoluteUrl(url, productUrl),
              imageUrl: value.image,
              inStock: availability === true,
              productId: sku ? `bhphoto-${sku}` : undefined,
              source: 'bhphoto_public_jsonld',
              rawAvailability: offer?.availability || availabilityLabel(availability)
            });
          });
        }
      } catch {}
    }

    if (!items.length) {
      const matches = [...fetched.text.matchAll(/<a[^>]+href="([^"]*\/c\/product\/[^"]+)"[^>]*>([\s\S]{0,300}?(?:RTX|GeForce)[\s\S]{0,300}?Graphics Card[\s\S]{0,300}?)<\/a>[\s\S]{0,2500}?(\$\s*[\d,]+(?:\.\d{2})?)/gi)];
      for (const match of matches.slice(0, 24)) {
        const chunk = match[0];
        const availability = availabilityFromText(chunk);
        items.push({
          title: stripTags(match[2]),
          price: match[3],
          url: absoluteUrl('https://www.bhphotovideo.com', match[1]),
          imageUrl: '',
          inStock: availability === true,
          productId: (match[1].match(/\/c\/product\/(\d+)/) || [])[1] ? `bhphoto-${(match[1].match(/\/c\/product\/(\d+)/) || [])[1]}` : undefined,
          source: 'bhphoto_public_page',
          rawAvailability: availabilityLabel(availability)
        });
      }
    }

    listings.push(...items);
    statuses.push(makeStatus(storeConfig, {
      ok: true,
      source: items.some(item => item.source === 'bhphoto_public_jsonld') ? 'bhphoto_public_jsonld' : 'bhphoto_public_page',
      seen: items.length,
      listingCount: items.length,
      inStock: items.filter(item => item.inStock).length,
      diagnosis: items.length ? 'public_live_listings_found' : 'parser_no_match_or_no_results',
      url
    }));
  }

  const deduped = dedupeListings(listings);
  return { listings: deduped, status: combineStatuses(storeConfig, statuses, deduped, 'bhphoto_public_page') };
}

function parseGenericPublicProducts(storeConfig = {}, text = '', baseUrl = '') {
  const items = [];
  const jsonLdMatches = [...text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      const roots = Array.isArray(parsed) ? parsed : [parsed];
      for (const root of roots) {
        walkJson(root, value => {
          const type = Array.isArray(value['@type']) ? value['@type'].join(' ') : value['@type'];
          if (!/product/i.test(String(type || ''))) return;
          const offer = Array.isArray(value.offers) ? value.offers[0] : value.offers;
          const price = parseMoney(offer?.price || value.price);
          const title = value.name || value.headline;
          const productUrl = value.url || offer?.url || baseUrl;
          if (!title || !Number.isFinite(price)) return;
          const availability = availabilityFromText(`${offer?.availability || ''} ${offer?.availabilityStatus || ''}`);
          items.push({
            title,
            price,
            url: absoluteUrl(baseUrl, productUrl),
            imageUrl: value.image,
            inStock: availability === true,
            productId: value.sku || value.mpn ? `${storeConfig.id}-${value.sku || value.mpn}` : undefined,
            source: `${storeConfig.id}_public_jsonld`,
            rawAvailability: offer?.availability || availabilityLabel(availability)
          });
        });
      }
    } catch {}
  }

  if (!items.length) {
    const cardChunks = publicHtmlChunks(
      text,
      /<(?:li|div|article)[^>]+class="[^"]*(?:product|item|card|tile)[^"]*"[^>]*>/i,
      /(?=<(?:li|div|article)[^>]+class="[^"]*(?:product|item|card|tile)[^"]*"|$)/i
    );
    for (const chunk of cardChunks.slice(0, 32)) {
      if (!/\b(?:RTX|GeForce)\b/i.test(chunk)) continue;
      const href = (
        chunk.match(/<a[^>]+href="([^"]+)"[^>]*>/i) ||
        []
      )[1];
      const title = stripTags(
        (chunk.match(/<a[^>]+class="[^"]*(?:product|item|title|name)[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || [])[1] ||
        (chunk.match(/<(?:h2|h3|h4)[^>]*>([\s\S]*?)<\/(?:h2|h3|h4)>/i) || [])[1] ||
        (chunk.match(/<img[^>]+alt="([^"]+)"/i) || [])[1] ||
        ''
      );
      if (!/\b(?:RTX|GeForce)\b/i.test(title)) continue;
      const priceText = stripTags(
        (chunk.match(/<(?:span|div)[^>]+class="[^"]*(?:price|amount|final-price)[^"]*"[^>]*>([\s\S]*?\$[\s\S]*?)<\/(?:span|div)>/i) || [])[1] ||
        (chunk.match(/(\$\s*[\d,]+(?:\.\d{2})?)/i) || [])[1] ||
        ''
      );
      const imageUrl = (chunk.match(/<img[^>]+(?:src|data-src)="([^"]+)"/i) || [])[1];
      if (!href || !title || !priceText) continue;
      const availability = availabilityFromText(chunk);
      items.push({
        title,
        price: priceText,
        url: absoluteUrl(baseUrl, href),
        imageUrl,
        inStock: availability === true,
        productId: `${storeConfig.id}-${absoluteUrl(baseUrl, href).split('/').filter(Boolean).pop()}`,
        source: `${storeConfig.id}_public_page`,
        rawAvailability: availabilityLabel(availability)
      });
    }
  }

  return items;
}

async function fetchConfiguredPublicStore(storeConfig = {}, config = {}, source = `${storeConfig.id}_public_page`) {
  const urls = Array.isArray(storeConfig.urls) ? storeConfig.urls : [];
  if (!urls.length) {
    return { listings: [], status: makeStatus(storeConfig, { ok: false, source, diagnosis: 'missing_configured_urls' }) };
  }

  const listings = [];
  const statuses = [];
  const maxUrls = Math.min(Math.max(Number(storeConfig.maxUrlsPerCheck || 6), 1), 12);
  for (const url of urls.slice(0, maxUrls)) {
    if (statuses.length) await politeQueryDelay(storeConfig, config);
    const fetched = await fetchPublicHtml(storeConfig, config, url);
    if (fetched.blocked) {
      statuses.push({ ...fetched.status, source });
      continue;
    }
    const items = parseGenericPublicProducts(storeConfig, fetched.text, url);
    listings.push(...items);
    statuses.push(makeStatus(storeConfig, {
      ok: true,
      source: items.some(item => /jsonld$/.test(item.source)) ? `${storeConfig.id}_public_jsonld` : source,
      seen: items.length,
      listingCount: items.length,
      inStock: items.filter(item => item.inStock).length,
      diagnosis: items.length ? 'public_live_listings_found' : 'parser_no_match_or_no_results',
      url
    }));
  }

  const deduped = dedupeListings(listings);
  return { listings: deduped, status: combineStatuses(storeConfig, statuses, deduped, source) };
}

async function fetchAntonline(storeConfig = {}, config = {}) {
  return fetchConfiguredPublicStore(storeConfig, config, 'antonline_public_page');
}

async function fetchAsus(storeConfig = {}, config = {}) {
  return fetchConfiguredPublicStore(storeConfig, config, 'asus_public_page');
}

async function fetchMsi(storeConfig = {}, config = {}) {
  return fetchConfiguredPublicStore(storeConfig, config, 'msi_public_page');
}

const storeAdapters = {
  bestbuy: fetchBestBuy,
  walmart: fetchWalmart,
  amd: fetchAmd,
  newegg: fetchNewegg,
  ebay: fetchEbay,
  amazon: fetchAmazon,
  bhphoto: fetchBhPhoto,
  antonline: fetchAntonline,
  asus: fetchAsus,
  msi: fetchMsi
};

const storeFetchers = Object.fromEntries(Object.entries(storeAdapters).map(([id, adapter]) => [
  id,
  async config => {
    const result = await adapter({ id, strategy: 'public_page' }, config || {});
    return result.listings;
  }
]));

module.exports = {
  storeAdapters,
  storeFetchers,
  commonHeaders,
  fetchWithTimeout,
  makeStatus,
  adapterResult,
  parseWalmartProductsFromHtml,
  clearRobotsCache: () => robotsCache.clear()
};
