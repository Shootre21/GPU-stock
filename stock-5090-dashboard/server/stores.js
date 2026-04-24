function commonHeaders() {
  return {
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache'
  };
}

async function fetchBestBuy() {
  const url = 'https://www.bestbuy.com/site/searchpage.jsp?st=rtx+5090';
  const res = await fetch(url, { headers: commonHeaders() });
  if (!res.ok) throw new Error(`bestbuy_http_${res.status}`);
  const text = await res.text();
  const matches = [...text.matchAll(/"skuItemName":"(.*?)".*?"currentPrice":(\d+(?:\.\d+)?).*?"url":"(\/site\/.*?)"/g)];
  return matches.slice(0, 15).map(match => ({
    title: match[1].replace(/\\u002F/g, '/').replace(/\\"/g, '"'),
    price: Number(match[2]),
    url: `https://www.bestbuy.com${match[3].replace(/\\u002F/g, '/')}`,
    inStock: /add to cart|pickup today|shipping/i.test(text)
  }));
}

async function fetchNewegg() {
  const url = 'https://www.newegg.com/p/pl?d=rtx+5090';
  const res = await fetch(url, { headers: commonHeaders() });
  if (!res.ok) throw new Error(`newegg_http_${res.status}`);
  const text = await res.text();
  const matches = [...text.matchAll(/<a[^>]+class="item-title"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<li class="price-current">[\s\S]*?<strong>(\d+)<\/strong><sup>(\.\d+)<\/sup>/g)];
  return matches.slice(0, 15).map(match => ({
    title: match[2].replace(/<[^>]+>/g, '').trim(),
    price: Number(`${match[3]}${match[4]}`),
    url: match[1],
    inStock: !/out of stock/i.test(match[0])
  }));
}

async function fetchBHPhoto() {
  const url = 'https://www.bhphotovideo.com/c/search?q=rtx%205090&sts=ma';
  const res = await fetch(url, { headers: commonHeaders() });
  if (!res.ok) throw new Error(`bhphoto_http_${res.status}`);
  const text = await res.text();
  const matches = [...text.matchAll(/"name":"(.*?)"[\s\S]*?"url":"(https:\/\/www\.bhphotovideo\.com[^"]+)"[\s\S]*?"price":"(\d+(?:\.\d+)?)"/g)];
  return matches.slice(0, 15).map(match => ({
    title: match[1],
    price: Number(match[3]),
    url: match[2].replace(/\\\//g, '/'),
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
