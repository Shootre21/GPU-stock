const KEYWORDS = ['5090', 'rtx 5090', 'geforce rtx 5090'];

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value = '') {
  return normalizeText(value).replace(/\s+/g, '-');
}

function matchesKeywords(title, keywords = KEYWORDS) {
  const text = normalizeText(title);
  return keywords.some(keyword => text.includes(normalizeText(keyword)));
}

function inPriceRange(price, minPrice, maxPrice) {
  const n = Number(price);
  if (!Number.isFinite(n)) return false;
  if (Number.isFinite(Number(minPrice)) && n < Number(minPrice)) return false;
  if (Number.isFinite(Number(maxPrice)) && n > Number(maxPrice)) return false;
  return true;
}

function extractModel(title = '') {
  const text = normalizeText(title);
  const models = ['3090', '4080', '4090', '5080', '5090'];
  return models.find(model => text.includes(model)) || null;
}

function extractBrand(title = '') {
  const text = normalizeText(title);
  const brands = ['nvidia', 'asus', 'msi', 'gigabyte', 'zotac', 'pny', 'sapphire', 'xfx', 'powercolor', 'evga', 'galax', 'inno3d'];
  return brands.find(brand => text.includes(brand)) || 'unknown';
}

function extractEdition(title = '') {
  const text = normalizeText(title);
  const editions = [
    'founders edition',
    'gaming trio',
    'ventus',
    'suprim',
    'tuf gaming',
    'rog astral',
    'rog strix',
    'prime',
    'aero',
    'windforce',
    'gaming oc',
    'amp extreme',
    'solid',
    'trinity',
    'vanguard'
  ];
  return editions.find(edition => text.includes(edition)) || 'standard';
}

function extractMemory(title = '') {
  const text = normalizeText(title);
  const match = text.match(/(\d{2,3})\s*gb/);
  return match ? `${match[1]}gb` : null;
}

function createListingId(listing = {}) {
  if (listing.productId) return String(listing.productId);
  const model = listing.model || extractModel(listing.title) || 'gpu';
  const brand = listing.brand || extractBrand(listing.title);
  const edition = listing.edition || extractEdition(listing.title);
  const memory = listing.memory || extractMemory(listing.title) || 'na';
  return [listing.store || 'unknown', model, brand, edition, memory]
    .map(part => slugify(part || 'na'))
    .filter(Boolean)
    .join(':');
}

function withinTargetCap(listing, targetCaps = {}) {
  const model = listing.model || extractModel(listing && listing.title);
  if (!model) return true;
  const cap = Number(targetCaps[model]);
  if (!Number.isFinite(cap)) return true;
  return Number(listing.price) <= cap;
}

function enrichListing(listing = {}) {
  const title = String(listing.title || 'Unknown GPU');
  const model = listing.model || extractModel(title);
  const brand = listing.brand || extractBrand(title);
  const edition = listing.edition || extractEdition(title);
  const memory = listing.memory || extractMemory(title);
  const price = Number(listing.price);
  return {
    ...listing,
    title,
    price,
    model,
    brand,
    edition,
    memory,
    productId: createListingId({ ...listing, title, model, brand, edition, memory })
  };
}

function listingKey(listing) {
  const enriched = enrichListing(listing);
  return `${enriched.store}:${enriched.productId}`;
}

module.exports = {
  normalizeText,
  slugify,
  matchesKeywords,
  inPriceRange,
  extractModel,
  extractBrand,
  extractEdition,
  extractMemory,
  createListingId,
  enrichListing,
  withinTargetCap,
  listingKey
};
