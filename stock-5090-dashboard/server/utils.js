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

function extractModel(title = '') {
  const text = normalizeText(title);
  const models = ['3090', '4080', '4090', '5080', '5090'];
  return models.find(model => text.includes(model)) || null;
}

function withinTargetCap(listing, targetCaps = {}) {
  const model = extractModel(listing && listing.title);
  if (!model) return true;
  const cap = Number(targetCaps[model]);
  if (!Number.isFinite(cap)) return true;
  return Number(listing.price) <= cap;
}

function listingKey(listing) {
  return `${listing.store}:${listing.title}:${listing.price}:${listing.url}`;
}

module.exports = { normalizeText, matchesKeywords, inPriceRange, extractModel, withinTargetCap, listingKey };
