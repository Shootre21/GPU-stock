function commonHeaders() {
  return {
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    accept: 'text/html,application/json;q=0.9,*/*;q=0.8'
  };
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

function decodeEscapes(value = '') {
  return String(value)
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripTags(value = '') {
  return decodeEscapes(String(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
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
            break;
          }
        }
      }
    }
    if (markerIndex === start) break;
  }
  return blocks;
}

function dedupeListings(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.url}|${item.title}|${item.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function fetchBestBuy(config = {}) {
  const url = 'https://www.bestbuy.com/site/searchpage.jsp?st=rtx+5090';
  const res = await fetchWithTimeout(url, { headers: commonHeaders() }, config.storeTimeoutMs || 15000);
  if (!res.ok) throw new Error(`bestbuy_http_${res.status}`);
  const text = await res.text();
  const items = [];

  const jsonBlocks = extractJsonBlocks(text, 'shop-specifications');
  for (const block of jsonBlocks) {
    try {
      const data = JSON.parse(block);
      const candidates = [
        ...(Array.isArray(data?.searchResults?.products) ? data.searchResults.products : []),
        ...(Array.isArray(data?.products) ? data.products : [])
      ];
      for (const product of candidates) {
        const title = stripTags(product?.names?.title || product?.name || '');
        const path = product?.url || product?.relativeUrl || product?.links?.web?.href;
        const price = Number(product?.prices?.current || product?.price?.currentPrice || product?.price?.customerPrice);
        const imageUrl = product?.images?.standard || product?.images?.primary || product?.image;
        const productId = product?.skuId || product?.sku || product?.id;
        if (!title || !path || !Number.isFinite(price)) continue;
        items.push({
          title,
          price,
          url: String(path).startsWith('http') ? String(path) : `https://www.bestbuy.com${path}`,
          imageUrl: decodeEscapes(imageUrl || ''),
          inStock: !/sold out|coming soon|unavailable/i.test(JSON.stringify(product)),
          productId: productId ? `bestbuy-sku-${productId}` : undefined
        });
      }
    } catch {}
  }

  if (!items.length) {
    const matches = [...text.matchAll(/"skuId":"?(\d+)"?[\s\S]*?"names":\{"title":"(.*?)"\}[\s\S]*?"currentPrice":(\d+(?:\.\d+)?)[\s\S]*?"url":"(\/site\/.*?)"[\s\S]*?"image":"(.*?)"/g)];
    for (const match of matches.slice(0, 24)) {
      items.push({
        title: decodeEscapes(match[2]),
        price: Number(match[3]),
        url: `https://www.bestbuy.com${decodeEscapes(match[4])}`,
        imageUrl: decodeEscapes(match[5]),
        inStock: !/sold out|coming soon|unavailable/i.test(match[0]),
        productId: `bestbuy-sku-${match[1]}`
      });
    }
  }

  return dedupeListings(items).slice(0, 20);
}

async function fetchNewegg(config = {}) {
  const url = 'https://www.newegg.com/p/pl?d=rtx+5090';
  const res = await fetchWithTimeout(url, { headers: commonHeaders() }, config.storeTimeoutMs || 15000);
  if (!res.ok) throw new Error(`newegg_http_${res.status}`);
  const text = await res.text();
  const items = [];

  const jsonLdMatches = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const match of jsonLdMatches) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed?.itemListElement) ? parsed.itemListElement.map(entry => entry.item).filter(Boolean) : [];
      for (const product of candidates) {
        const title = stripTags(product?.name || '');
        const price = Number(product?.offers?.price);
        const urlValue = product?.url;
        const imageUrl = Array.isArray(product?.image) ? product.image[0] : product?.image;
        const productId = product?.sku || product?.mpn || product?.productID;
        if (!title || !urlValue || !Number.isFinite(price)) continue;
        items.push({
          title,
          price,
          url: decodeEscapes(urlValue),
          imageUrl: decodeEscapes(imageUrl || ''),
          inStock: !/outofstock/i.test(String(product?.offers?.availability || '')),
          productId: productId ? `newegg-${productId}` : undefined
        });
      }
    } catch {}
  }

  if (!items.length) {
    const matches = [...text.matchAll(/<a[^>]+class="item-title"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<li class="price-current">[\s\S]*?<strong>(\d+)<\/strong>(?:<sup>(\.\d+)<\/sup>)?/g)];
    for (const match of matches.slice(0, 24)) {
      const urlValue = decodeEscapes(match[1]);
      const productId = (urlValue.match(/\/p\/(N82E168[0-9A-Z]+)/i) || [])[1];
      items.push({
        title: stripTags(match[2]),
        price: Number(`${match[4]}${match[5] || ''}`),
        url: urlValue,
        imageUrl: decodeEscapes(match[3]),
        inStock: !/out of stock/i.test(match[0]),
        productId: productId ? `newegg-${productId}` : undefined
      });
    }
  }

  return dedupeListings(items).slice(0, 20);
}

async function fetchBHPhoto(config = {}) {
  const url = 'https://www.bhphotovideo.com/c/search?q=rtx%205090&sts=ma';
  const res = await fetchWithTimeout(url, { headers: commonHeaders() }, config.storeTimeoutMs || 15000);
  if (!res.ok) throw new Error(`bhphoto_http_${res.status}`);
  const text = await res.text();
  const matches = [...text.matchAll(/"name":"(.*?)"[\s\S]*?"url":"(https:\/\/www\.bhphotovideo\.com[^"]+)"[\s\S]*?"image":"(https:\/\/[^"]+)"[\s\S]*?"price":"(\d+(?:\.\d+)?)"/g)];
  return matches.slice(0, 20).map(match => ({
    title: decodeEscapes(match[1]),
    price: Number(match[4]),
    url: decodeEscapes(match[2]),
    imageUrl: decodeEscapes(match[3]),
    inStock: !/temporarily unavailable|more on the way/i.test(text),
    productId: (() => {
      const id = decodeEscapes(match[2]).match(/\/c\/product\/(\d+)-REG/i);
      return id ? `bhphoto-${id[1]}` : undefined;
    })()
  }));
}

async function fetchMicroCenter() {
  return [];
}

async function fetchAmazon() {
  return [];
}

async function fetchWalmart(config = {}) {
  const url = 'https://www.walmart.com/search?q=rtx+5090';
  const res = await fetchWithTimeout(url, { headers: commonHeaders() }, config.storeTimeoutMs || 15000);
  if (!res.ok) throw new Error(`walmart_http_${res.status}`);
  const text = await res.text();
  const items = [];

  const matches = [...text.matchAll(/"canonicalUrl":"(\/ip\/.*?)"[\s\S]*?"name":"(.*?)"[\s\S]*?"image":"(https:\/\/[^"]+)"[\s\S]*?"price":(\d+(?:\.\d+)?)[\s\S]*?"isOutOfStock":(true|false)[\s\S]*?"usItemId":"?(\d+)"?/g)];
  for (const match of matches.slice(0, 24)) {
    items.push({
      title: decodeEscapes(match[2]),
      price: Number(match[4]),
      url: `https://www.walmart.com${decodeEscapes(match[1])}`,
      imageUrl: decodeEscapes(match[3]),
      inStock: match[5] === 'false',
      productId: `walmart-${match[6]}`
    });
  }

  return dedupeListings(items).slice(0, 20);
}

const storeFetchers = {
  bestbuy: fetchBestBuy,
  newegg: fetchNewegg,
  bhphoto: fetchBHPhoto,
  microcenter: fetchMicroCenter,
  amazon: fetchAmazon,
  walmart: fetchWalmart,
};

module.exports = { storeFetchers, commonHeaders, fetchWithTimeout };
