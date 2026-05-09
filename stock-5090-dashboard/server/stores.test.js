const assert = require('assert');
const { storeAdapters, clearRobotsCache } = require('./stores');
const { detectNewInStockAlerts } = require('./alerting');
const { isStandaloneGpuProduct, isNewRetailCondition } = require('./utils');

function response({ status = 200, text = '' }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() { return text; }
  };
}

async function withFetch(mockFetch, fn) {
  const originalFetch = global.fetch;
  global.fetch = mockFetch;
  try {
    await fn();
  } finally {
    global.fetch = originalFetch;
  }
}

async function testBestBuyPageFixture() {
  const html = `"skuId":"12345","names":{"title":"NVIDIA GeForce RTX 5090 32GB"},"currentPrice":2199.99,"url":"/site/nvidia-rtx-5090/12345.p","image":"https://pisces.bbystatic.com/image2/bb.jpg","buttonState":"ADD_TO_CART"`;
  await withFetch(async () => response({ text: html }), async () => {
    const result = await storeAdapters.bestbuy({ id: 'bestbuy', strategy: 'public_page', query: 'rtx 5090' }, { storeTimeoutMs: 100 });
    assert.equal(result.status.source, 'bestbuy_public_page');
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'bestbuy-sku-12345');
  });
}

async function testBestBuyApolloFixture() {
  const apollo = {
    rehydrate: {
      productData: {
        data: {
          product: {
            __typename: 'Product',
            skuId: '4090001',
            name: { short: 'NVIDIA GeForce RTX 4090 24GB Graphics Card' },
            url: { skuSpecificUrl: 'https://www.bestbuy.com/product/nvidia-rtx-4090/sku/4090001' },
            primaryImage: { href: 'https://pisces.bbystatic.com/image2/4090.jpg' },
            price: { customerPrice: 1599.99 }
          },
          shipping: {
            __typename: 'FulfillmentShippingDetail',
            sku: '4090001',
            shippingAvailability: [{ condition: 'NEW', shippingEligible: true }]
          }
        }
      }
    }
  };
  const html = `<script>(window[Symbol.for("ApolloSSRDataTransport")] ??= []).push(${JSON.stringify(apollo)})</script>`;
  await withFetch(async () => response({ text: html }), async () => {
    const result = await storeAdapters.bestbuy({ id: 'bestbuy', strategy: 'public_page', query: 'rtx 4090' }, { storeTimeoutMs: 100 });
    assert.equal(result.status.source, 'bestbuy_public_apollo');
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'bestbuy-sku-4090001');
    assert.equal(result.listings[0].inStock, true);
  });
}

async function testWalmartNextDataFixture() {
  const data = {
    props: {
      pageProps: {
        products: [{
          usItemId: '777',
          name: 'ASUS RTX 5090 GPU',
          canonicalUrl: '/ip/asus-rtx-5090/777',
          imageInfo: { thumbnailUrl: 'https://i5.walmartimages.com/gpu.jpg' },
          priceInfo: { currentPrice: { price: 2299 } },
          isOutOfStock: false
        }]
      }
    }
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
  await withFetch(async () => response({ text: html }), async () => {
    const result = await storeAdapters.walmart({ id: 'walmart', strategy: 'public_page', query: 'rtx 5090' }, { storeTimeoutMs: 100 });
    assert.equal(result.status.source, 'walmart_public_next_data');
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'walmart-777');
    assert.equal(result.listings[0].inStock, true);
  });
}

async function testNeweggJsonLdFixture() {
  const jsonLd = {
    itemListElement: [{
      item: {
        name: 'MSI GeForce RTX 5090',
        sku: 'N82E16814100000',
        url: 'https://www.newegg.com/p/N82E16814100000',
        image: 'https://c1.neweggimages.com/gpu.jpg',
        offers: { price: '2399.99', availability: 'https://schema.org/InStock' }
      }
    }]
  };
  const html = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
  await withFetch(async () => response({ text: html }), async () => {
    const result = await storeAdapters.newegg({ id: 'newegg', strategy: 'public_page', query: 'rtx 5090' }, { storeTimeoutMs: 100 });
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'newegg-N82E16814100000');
  });
}

async function testNeweggCurrentCardFixture() {
  const html = `<div class="item-cell"><div class="item-container"><a href="https://www.newegg.com/gigabyte-geforce-rtx-5090/p/N82E16814932761" class="item-img"><img src="https://c1.neweggimages.com/productimage/14-932-761.jpg" alt="GIGABYTE Gaming GeForce RTX 5090 32GB Graphics Card"></a><div class="item-info"><a href="https://www.newegg.com/gigabyte-geforce-rtx-5090/p/N82E16814932761" class="item-title" title="View Details">GIGABYTE Gaming GeForce RTX 5090 32GB GDDR7 PCI Express 5.0 ATX Graphics Card</a></div><div class="item-action"><ul class="price"><li class="price-current">$<strong>3,799</strong><sup>.99</sup></li></ul><button>Add to cart</button></div></div></div>`;
  await withFetch(async () => response({ text: html }), async () => {
    const result = await storeAdapters.newegg({ id: 'newegg', strategy: 'public_page', query: 'rtx 5090' }, { storeTimeoutMs: 100 });
    assert.equal(result.status.source, 'newegg_public_page');
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'newegg-N82E16814932761');
    assert.equal(result.listings[0].price, 3799.99);
    assert.equal(result.listings[0].inStock, true);
  });
}

async function testAmdConfiguredPageFixture() {
  const jsonLd = {
    '@type': 'Product',
    name: 'AMD Radeon RX 9070 XT',
    sku: 'rx-9070-xt',
    url: 'https://www.amd.com/en/direct-buy/rx-9070-xt',
    image: 'https://www.amd.com/gpu.jpg',
    offers: { price: '599.00', availability: 'https://schema.org/InStock' }
  };
  const html = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
  await withFetch(async () => response({ text: html }), async () => {
    const result = await storeAdapters.amd({ id: 'amd', strategy: 'public_page', urls: ['https://www.amd.com/en/direct-buy/rx-9070-xt'] }, { storeTimeoutMs: 100 });
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'amd-rx-9070-xt');
  });
}

async function testBhPhotoProductFixture() {
  const jsonLd = {
    '@type': 'Product',
    name: 'PNY NVIDIA GeForce RTX 5090 ARGB EPIC-X RGB OC Graphics Card',
    sku: 'PN5090A32OTF',
    url: 'https://www.bhphotovideo.com/c/product/1874648-REG/pny_vcg509032tfxxpb1_o_nvidia_geforce_rtx_5090.html',
    image: 'https://static.bhphoto.com/images/pny-5090.jpg',
    offers: { price: '2499.99', availability: 'https://schema.org/InStock' }
  };
  const html = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
  clearRobotsCache();
  await withFetch(async url => String(url).endsWith('/robots.txt') ? response({ text: 'User-agent: *\nAllow: /' }) : response({ text: html }), async () => {
    const result = await storeAdapters.bhphoto({ id: 'bhphoto', strategy: 'public_page', urls: ['https://www.bhphotovideo.com/c/product/1874648-REG/pny.html'] }, { storeTimeoutMs: 100 });
    assert.equal(result.status.source, 'bhphoto_public_page');
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'bhphoto-PN5090A32OTF');
    assert.equal(result.listings[0].inStock, true);
  });
}

async function testEbayPublicFixture() {
  const html = `<li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/1234567890"><div class="s-item__title">NVIDIA RTX 5090 GPU Buy It Now</div></a><span class="s-item__price">$2,399.99</span><img src="https://i.ebayimg.com/gpu.jpg"></li>`;
  await withFetch(async () => response({ text: html }), async () => {
    const result = await storeAdapters.ebay({ id: 'ebay', strategy: 'public_page', query: 'rtx 5090 gpu' }, { storeTimeoutMs: 100 });
    assert.equal(result.status.source, 'ebay_public_search');
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'ebay-1234567890');
  });
}

async function testEbayProductPageFixture() {
  const html = [
    '<html><head>',
    '<meta property="og:title" content="NVIDIA GeForce RTX 4090 24GB Graphics Card">',
    '<meta property="og:url" content="https://www.ebay.com/itm/409040904090">',
    '<meta property="og:image" content="https://i.ebayimg.com/4090.jpg">',
    '<meta property="product:price:amount" content="1800.00">',
    '<meta property="product:availability" content="in stock">',
    '</head><body>Buy It Now</body></html>'
  ].join('');
  clearRobotsCache();
  await withFetch(async url => String(url).endsWith('/robots.txt') ? response({ text: 'User-agent: *\nAllow: /itm/' }) : response({ text: html }), async () => {
    const result = await storeAdapters.ebay({
      id: 'ebay',
      strategy: 'public_page',
      urls: ['https://www.ebay.com/itm/409040904090'],
      productOnly: true
    }, { storeTimeoutMs: 100 });
    assert.equal(result.status.source, 'ebay_public_product_page');
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'ebay-409040904090');
    assert.equal(result.listings[0].inStock, true);
  });
}

async function testAsusProductMetaFixture() {
  const html = [
    '<html><head>',
    '<title>ASUS ROG Astral GeForce RTX 5090 OC Edition Graphics Card</title>',
    '<link rel="canonical" href="https://shop.asus.com/us/rog-astral-rtx5090-o32g-gaming.html">',
    '<meta property="og:image" content="https://shop.asus.com/media/5090.jpg">',
    '<meta property="product:price:amount" content="1999.99">',
    '<meta name="sku" content="ROG-ASTRAL-RTX5090-O32G-GAMING">',
    '</head><body><button>Add to Cart</button></body></html>'
  ].join('');
  clearRobotsCache();
  await withFetch(async url => String(url).endsWith('/robots.txt') ? response({ text: 'User-agent: *\nAllow: /us/' }) : response({ text: html }), async () => {
    const result = await storeAdapters.asus({
      id: 'asus',
      strategy: 'public_page',
      urls: ['https://shop.asus.com/us/rog-astral-rtx5090-o32g-gaming.html']
    }, { storeTimeoutMs: 100 });
    assert.equal(result.status.source, 'asus_public_page');
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'asus-ROG-ASTRAL-RTX5090-O32G-GAMING');
    assert.equal(result.listings[0].inStock, true);
  });
}

async function testAmazonPublicFixture() {
  const html = `<div data-asin="B0ABCDEFGH"><h2><span class="a-text-normal">ASUS RTX 5090 GPU</span></h2><a class="a-link-normal" href="/dp/B0ABCDEFGH"><span class="a-price-whole">2,499</span><span class="a-price-fraction">99</span></a><img data-image-src="https://m.media-amazon.com/images/gpu.jpg">In Stock</div>`;
  await withFetch(async () => response({ text: html }), async () => {
    const result = await storeAdapters.amazon({ id: 'amazon', strategy: 'public_page', query: 'rtx 5090 gpu' }, { storeTimeoutMs: 100 });
    assert.equal(result.status.source, 'amazon_public_search');
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].productId, 'amazon-B0ABCDEFGH');
    assert.equal(result.listings[0].inStock, true);
  });
}

async function testPublicBlockStatus() {
  await withFetch(async () => response({ status: 429, text: 'too many requests' }), async () => {
    const result = await storeAdapters.amazon({ id: 'amazon', strategy: 'public_page', query: 'rtx 5090 gpu' }, { storeTimeoutMs: 100 });
    assert.equal(result.status.diagnosis, 'rate_or_bot_limited_by_amazon');
  });
}

async function testRobotsDisallowStatus() {
  clearRobotsCache();
  let calls = 0;
  await withFetch(async url => {
    calls += 1;
    if (String(url).endsWith('/robots.txt')) return response({ text: 'User-agent: *\nDisallow: /s' });
    return response({ text: '<div data-asin="B0ABCDEFGH">Should not fetch</div>' });
  }, async () => {
    const result = await storeAdapters.amazon({ id: 'amazon', strategy: 'public_page', query: 'rtx 4090 gpu' }, { storeTimeoutMs: 100 });
    assert.equal(result.status.diagnosis, 'robots_txt_disallowed');
    assert.equal(result.listings.length, 0);
    assert.equal(calls, 1);
  });
}

async function testEbayAllowedSearchPattern() {
  clearRobotsCache();
  let fetchedSearch = false;
  await withFetch(async url => {
    const value = String(url);
    if (value.endsWith('/robots.txt')) {
      return response({ text: 'User-agent: *\nAllow: /sch/i.html?*&mkcid=2\nDisallow: /sch/i.html?_nkw=\nDisallow: /sch/i.html?*_nkw=*&\nDisallow: /sch/' });
    }
    fetchedSearch = true;
    assert.match(value, /LH_BIN=1&mkcid=2&_nkw=/);
    return response({ text: '<li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/1234567890"><div class="s-item__title">NVIDIA RTX 5090 GPU Buy It Now</div></a><span class="s-item__price">$2,399.99</span><img src="https://i.ebayimg.com/gpu.jpg"></li>' });
  }, async () => {
    const result = await storeAdapters.ebay({ id: 'ebay', strategy: 'public_page', query: 'rtx 5090 gpu' }, { storeTimeoutMs: 100 });
    assert.equal(fetchedSearch, true);
    assert.equal(result.listings.length, 1);
  });
}

async function testEbaySearchFallbackChallenge() {
  clearRobotsCache();
  const calls = [];
  await withFetch(async url => {
    const value = String(url);
    calls.push(value);
    if (value.endsWith('/robots.txt')) return response({ text: 'User-agent: *\nAllow: /sch/i.html?*&mkcid=2\nAllow: /b/\nDisallow: /sch/' });
    if (value.includes('/sch/i.html')) return response({ status: 403, text: 'Access Denied' });
    return response({ text: '<html><title>Pardon Our Interruption...</title><body>Checking your browser before you access eBay.</body></html>' });
  }, async () => {
    const result = await storeAdapters.ebay({
      id: 'ebay',
      strategy: 'public_page',
      query: 'rtx 5090 gpu',
      categoryUrls: ['https://www.ebay.com/b/Graphics-Video-Cards/27386/bn_661796?mkcid=2']
    }, { storeTimeoutMs: 100 });
    assert.equal(result.listings.length, 0);
    assert.match(result.status.diagnosis, /blocked_by_ebay/);
    assert.match(result.status.diagnosis, /human_verification_required_ebay/);
    assert(calls.some(call => call.includes('/b/Graphics-Video-Cards')));
  });
}

async function testAlertTransitionUses4090SampleCards() {
  const current = [
    { store: 'bestbuy', productId: 'bestbuy-sku-4090', title: 'NVIDIA GeForce RTX 4090 24GB', price: 1599.99, url: 'https://www.bestbuy.com/site/4090.p', inStock: true },
    { store: 'walmart', productId: 'walmart-4090', title: 'ASUS RTX 4090 GPU', price: 1699, url: 'https://www.walmart.com/ip/4090', inStock: true },
    { store: 'newegg', productId: 'newegg-N82E16814904090', title: 'MSI GeForce RTX 4090', price: 1749.99, url: 'https://www.newegg.com/p/N82E16814904090', inStock: true },
    { store: 'ebay', productId: 'ebay-409040904090', title: 'NVIDIA RTX 4090 GPU Buy It Now', price: 1800, url: 'https://www.ebay.com/itm/409040904090', inStock: true },
    { store: 'amazon', productId: 'amazon-B0ABCDEFGH', title: 'ASUS RTX 4090 GPU', price: 1799.99, url: 'https://www.amazon.com/dp/B0ABCDEFGH', inStock: true }
  ];
  const alerts = detectNewInStockAlerts([], current, new Date('2026-05-07T12:00:00.000Z'));
  assert.equal(alerts.length, current.length);
  assert(alerts.every(alert => alert.type === 'new_in_stock'));

  const repeated = detectNewInStockAlerts(current, current, new Date('2026-05-07T12:01:00.000Z'));
  assert.equal(repeated.length, 0);
}

function testStandaloneGpuFilter() {
  assert.equal(isStandaloneGpuProduct('ASUS ROG Astral GeForce RTX 5090 OC Edition Graphics Card 32GB GDDR7'), true);
  assert.equal(isStandaloneGpuProduct('Panorama XL RTX 5090 AMD Ryzen 7 7800X3D 32GB DDR5 RAM 2TB NVMe Windows 11 Prebuilt Gaming Desktop PC'), false);
  assert.equal(isStandaloneGpuProduct('GIGABYTE AORUS RTX 5090 AI Box Graphics Card - External GPU'), false);
  assert.equal(isNewRetailCondition('ASUS GeForce RTX 4090 Graphics Card'), true);
  assert.equal(isNewRetailCondition('ASUS Refurbished Excellent GeForce RTX 4090 Graphics Card'), false);
}

async function test4090PublicConnectorFixtures() {
  const fixtures = {
    bestbuy: `"skuId":"4090","names":{"title":"NVIDIA GeForce RTX 4090 24GB"},"currentPrice":1599.99,"url":"/site/nvidia-rtx-4090/4090.p","image":"https://pisces.bbystatic.com/image2/4090.jpg","buttonState":"ADD_TO_CART"`,
    walmart: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { products: [{ usItemId: '4090', name: 'ASUS RTX 4090 GPU', canonicalUrl: '/ip/asus-rtx-4090/4090', imageInfo: { thumbnailUrl: 'https://i5.walmartimages.com/4090.jpg' }, priceInfo: { currentPrice: { price: 1699 } }, isOutOfStock: false }] } } })}</script>`,
    newegg: `<script type="application/ld+json">${JSON.stringify({ itemListElement: [{ item: { name: 'MSI GeForce RTX 4090', sku: 'N82E16814904090', url: 'https://www.newegg.com/p/N82E16814904090', image: 'https://c1.neweggimages.com/4090.jpg', offers: { price: '1749.99', availability: 'https://schema.org/InStock' } } }] })}</script>`,
    ebay: `<li class="s-item"><a class="s-item__link" href="https://www.ebay.com/itm/409040904090"><div class="s-item__title">NVIDIA RTX 4090 GPU Buy It Now</div></a><span class="s-item__price">$1,800.00</span><img src="https://i.ebayimg.com/4090.jpg"></li>`,
    amazon: `<div data-asin="B0ABCDEFGH"><h2><span class="a-text-normal">ASUS RTX 4090 GPU</span></h2><a class="a-link-normal" href="/dp/B0ABCDEFGH"><span class="a-price-whole">1,799</span><span class="a-price-fraction">99</span></a><img data-image-src="https://m.media-amazon.com/images/4090.jpg">In Stock</div>`
  };

  for (const [store, html] of Object.entries(fixtures)) {
    clearRobotsCache();
    await withFetch(async url => String(url).endsWith('/robots.txt') ? response({ text: 'User-agent: *\nAllow: /' }) : response({ text: html }), async () => {
      const result = await storeAdapters[store]({ id: store, strategy: 'public_page', query: 'rtx 4090 gpu' }, { storeTimeoutMs: 100 });
      assert.equal(result.listings.length, 1, `${store} should parse one 4090 fixture`);
      assert.match(result.listings[0].title, /4090/);
      assert.equal(result.listings[0].inStock, true, `${store} fixture should be in stock`);
    });
  }
}

async function run() {
  await testBestBuyPageFixture();
  await testBestBuyApolloFixture();
  await testWalmartNextDataFixture();
  await testNeweggJsonLdFixture();
  await testNeweggCurrentCardFixture();
  await testAmdConfiguredPageFixture();
  await testBhPhotoProductFixture();
  await testEbayPublicFixture();
  await testEbayProductPageFixture();
  await testAsusProductMetaFixture();
  await testAmazonPublicFixture();
  await testPublicBlockStatus();
  await testRobotsDisallowStatus();
  await testEbayAllowedSearchPattern();
  await testEbaySearchFallbackChallenge();
  await test4090PublicConnectorFixtures();
  await testAlertTransitionUses4090SampleCards();
  testStandaloneGpuFilter();
  console.log('public store parser tests ok');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
