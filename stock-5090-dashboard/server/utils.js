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

function isStandaloneGpuProduct(title = '') {
  const text = normalizeText(title);
  const hasTargetModel = /\b(3090|4080|4090|5090)\b/.test(text);
  const hasGpuLanguage = /\b(graphics card|graphic card|video card|gpu|geforce rtx|nvidia geforce rtx)\b/.test(text);
  const systemLanguage = /\b(prebuilt|gaming desktop|desktop pc|laptop|notebook|workstation|server|mini pc|computer)\b/.test(text);
  const componentBundleLanguage = /\b(ryzen|intel core|core ultra|ddr5 ram|ddr4 ram|\bram\b|nvme|ssd|windows 11|keyboard|mouse|rj45|wifi 7|wi fi 7|z890|x870|b850|motherboard|mainboard)\b/.test(text);
  const externalLanguage = /\b(external gpu|egpu|ai box)\b/.test(text);
  const accessoryBundle = /\b(bundle with|bundled with|bundle pack|dockstation|backpack|water block|gpu block|backplate|thermal pad|kryosheet)\b/.test(text);
  return hasTargetModel && hasGpuLanguage && !systemLanguage && !componentBundleLanguage && !externalLanguage && !accessoryBundle;
}

function isNewRetailCondition(title = '') {
  const text = normalizeText(title);
  return !/\b(refurbished|renewed|used|open box|openbox|pre owned|preowned)\b/.test(text);
}

function extractModel(title = '') {
  const text = normalizeText(title);
  const models = ['3090', '4080', '4090', '5090'];
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

function tidyTitle(value = '') {
  return String(value)
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;:])/g, '$1')
    .trim();
}

function compactGpuTitle(title = '') {
  const cleaned = tidyTitle(title)
    .replace(/\bNVIDIA\s+GeForce\s+RTX\b/gi, 'GeForce RTX')
    .replace(/\bGraphics\s+Cards\b/gi, 'Graphics Card')
    .replace(/\bGraphic\s+Card\b/gi, 'Graphics Card');

  const hardStops = [
    /\s+-\s+Powered by\b/i,
    /\s+-\s+Compatible\b/i,
    /\s+-\s+AI\b/i,
    /\s+-\s+DLSS\b/i,
    /\s+-\s+HDMI\b/i,
    /\s+-\s+DisplayPort\b/i,
    /\s+Bundle with\b/i,
    /\s+Bundled with\b/i,
    /\s+with GPU holder\b/i,
    /\s+with support bracket\b/i
  ];
  let base = cleaned;
  for (const stop of hardStops) {
    const match = base.search(stop);
    if (match > 0) base = base.slice(0, match).trim();
  }

  const commaParts = base.split(',').map(part => tidyTitle(part)).filter(Boolean);
  if (commaParts.length > 1) {
    const keep = [commaParts[0]];
    for (const part of commaParts.slice(1)) {
      if (/\b(\d{2,3}\s*GB|GDDR\d|DDR\d|GDDR|PCI[-\s]?E|PCI\s*Express|\d{3,4}\s*bit|\d{3,5}\s*MHz|Graphics Card)\b/i.test(part)) {
        keep.push(part);
      }
    }
    base = keep.slice(0, 6).join(', ');
  }

  const words = base.split(/\s+/);
  if (words.length <= 22) return base;
  const modelIndex = words.findIndex(word => /\b(?:3090|4080|4090|5090)\b/i.test(word));
  const limit = modelIndex >= 0 ? Math.max(18, modelIndex + 10) : 18;
  return words.slice(0, limit).join(' ');
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

function isMsrpHit(listing = {}, msrpTargets = {}) {
  const model = listing.model || extractModel(listing.title);
  const target = Number(msrpTargets[model]);
  if (!model || !Number.isFinite(target)) return false;
  const price = Number(listing.price);
  if (!Number.isFinite(price)) return false;
  const tolerance = Math.max(Number(msrpTargets.tolerance || 0), 0);
  return Math.abs(price - target) <= tolerance;
}

function enrichListing(listing = {}) {
  const title = String(listing.title || 'Unknown GPU');
  const model = listing.model || extractModel(title);
  const brand = listing.brand || extractBrand(title);
  const edition = listing.edition || extractEdition(title);
  const memory = listing.memory || extractMemory(title);
  const price = Number(listing.price);
  const displayTitle = compactGpuTitle(title);
  const msrpHit = Boolean(listing.msrpHit);
  return {
    ...listing,
    title,
    displayTitle,
    feedLabel: `${listing.store || 'store'} - ${displayTitle}`,
    price,
    model,
    brand,
    edition,
    memory,
    msrpHit,
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
  isStandaloneGpuProduct,
  isNewRetailCondition,
  extractModel,
  extractBrand,
  extractEdition,
  extractMemory,
  compactGpuTitle,
  createListingId,
  enrichListing,
  withinTargetCap,
  isMsrpHit,
  listingKey
};
