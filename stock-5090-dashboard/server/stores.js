function commonHeaders() {
  return {
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache'
  };
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

async function fetchBestBuy() {
  const url = 'https://www.bestbuy.com/site/searchpage.jsp?st=rtx+5090';
  const res = await fetch(url, { headers: commonHeaders() });
  if (!res.ok) throw new Error(`bestbuy_http_${res.status}`);
  const text = await res.text();
  const matches = [...text.matchAll(/"skuItemName":"(.*?)"[\s\S]*?"currentPrice":(\d+(?:\.\d+)?)[\s\S]*?"url":"(\/site\/.*?)"[\s\S]*?"thumbnailImage":"(.*?)"/g)];
  return matches.slice(0, 15).map(match => ({
    title: decodeEscapes(match[1]),
    price: Number(match[2]),
    url: `https://www.bestbuy.com${decodeEscapes(match[3])}`,
    imageUrl: decodeEscapes(match[4]),
    inStock: !/sold out|coming soon|unavailable/i.test(match[0])
  }));
}

async function fetchNewegg() {
  const url = 'https://www.newegg.com/p/pl?d=rtx+5090';
  const res = await fetch(url, { headers: commonHeaders() });
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

async function fetchBHPhoto() {
  const url = 'https://www.bhphotovideo.com/c/search?q=rtx%205090&sts=ma';
  const res = await fetch(url, { headers: commonHeaders() });
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

const storeFetchers = {
  bestbuy: fetchBestBuy,
  newegg: fetchNewegg,
  bhphoto: fetchBHPhoto,
  microcenter: fetchMicroCenter,
  amazon: fetchAmazon,
};

module.exports = { storeFetchers, commonHeaders };
