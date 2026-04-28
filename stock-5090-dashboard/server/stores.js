function commonHeaders() {
  return {
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache'
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
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

async function fetchBestBuy(config = {}) {
  const url = 'https://www.bestbuy.com/site/searchpage.jsp?st=rtx+5090';
  const res = await fetchWithTimeout(url, { headers: commonHeaders() }, config.storeTimeoutMs || 15000);
  if (!res.ok) throw new Error(`bestbuy_http_${res.status}`);
  const text = await res.text();
  const matches = [...text.matchAll(/"linkContent":"(.*?)"[\s\S]*?"currentPrice":(\d+(?:\.\d+)?)[\s\S]*?"linkTo":"(\/site\/.*?)"[\s\S]*?"thumbnailImage":"(.*?)"/g)];
  return matches.slice(0, 15).map(match => ({
    title: decodeEscapes(match[1]),
    price: Number(match[2]),
    url: `https://www.bestbuy.com${decodeEscapes(match[3])}`,
    imageUrl: decodeEscapes(match[4]),
    inStock: !/sold out|coming soon|unavailable/i.test(match[0])
  }));
}

async function fetchNewegg(config = {}) {
  const url = 'https://www.newegg.com/p/pl?d=rtx+5090';
  const res = await fetchWithTimeout(url, { headers: commonHeaders() }, config.storeTimeoutMs || 15000);
  if (!res.ok) throw new Error(`newegg_http_${res.status}`);
  const text = await res.text();
  const matches = [...text.matchAll(/<a[^>]+class="item-title"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<li class="price-current">[\s\S]*?<strong>(\d+)<\/strong><sup>(\.\d+)<\/sup>/g)];
  return matches.slice(0, 15).map(match => ({
    title: decodeEscapes(match[2].replace(/<[^>]+>/g, '').trim()),
    price: Number(`${match[4]}${match[5]}`),
    url: match[1],
    imageUrl: match[3],
    inStock: !/out of stock/i.test(match[0])
  }));
}

async function fetchBHPhoto(config = {}) {
  const url = 'https://www.bhphotovideo.com/c/search?q=rtx%205090&sts=ma';
  const res = await fetchWithTimeout(url, { headers: commonHeaders() }, config.storeTimeoutMs || 15000);
  if (!res.ok) throw new Error(`bhphoto_http_${res.status}`);
  const text = await res.text();
  const matches = [...text.matchAll(/"name":"(.*?)"[\s\S]*?"url":"(https:\/\/www\.bhphotovideo\.com[^"]+)"[\s\S]*?"image":"(https:\/\/[^\"]+)"[\s\S]*?"price":"(\d+(?:\.\d+)?)"/g)];
  return matches.slice(0, 15).map(match => ({
    title: decodeEscapes(match[1]),
    price: Number(match[4]),
    url: decodeEscapes(match[2]),
    imageUrl: decodeEscapes(match[3]),
    inStock: !/temporarily unavailable|more on the way/i.test(text)
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
  const start = text.indexOf('"itemStacks":');
  if (start === -1) return [];
  const slice = text.slice(start, start + 400000);
  const matches = [...slice.matchAll(/"canonicalUrl":"(\/ip\/.*?)"[\s\S]*?"name":"(.*?)"[\s\S]*?"image":"(https:\/\/[^\"]+)"[\s\S]*?"price":(\d+(?:\.\d+)?)[\s\S]*?"isOutOfStock":(true|false)/g)];
  return matches.slice(0, 20).map(match => ({
    title: decodeEscapes(match[2]),
    price: Number(match[4]),
    url: `https://www.walmart.com${decodeEscapes(match[1])}`,
    imageUrl: decodeEscapes(match[3]),
    inStock: match[5] === 'false'
  }));
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
