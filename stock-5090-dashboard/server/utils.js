const KEYWORDS = ['5090', 'rtx 5090', 'geforce rtx 5090'];

function normalizeText(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchesKeywords(title, keywords = KEYWORDS) {
  const text = normalizeText(title);
  return keywords.some(keyword => text.includes(normalizeText(keyword)));
}

function inPriceRange(price, minPrice, maxPrice) {
  const n = Number(price);
  return Number.isFinite(n) && n >= minPrice && n <= maxPrice;
}

function listingKey(listing) {
  return `${listing.store}:${listing.title}:${listing.price}:${listing.url}`;
}

module.exports = { normalizeText, matchesKeywords, inPriceRange, listingKey };
