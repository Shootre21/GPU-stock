const { listingKey } = require('./utils');

function detectNewInStockAlerts(previousListings = [], nextListings = [], now = new Date()) {
  const previousInStockKeys = new Set(previousListings.filter(item => item.inStock).map(listingKey));
  return nextListings
    .filter(item => item.inStock && !previousInStockKeys.has(listingKey(item)))
    .map(listing => ({
      at: now.toISOString(),
      type: 'new_in_stock',
      listing,
      sound: listing.msrpHit ? 'fahhhh' : 'notify'
    }));
}

function detectNewListingAlerts(previousListings = [], nextListings = [], now = new Date()) {
  const previousKeys = new Set(previousListings.map(listingKey));
  return nextListings
    .filter(item => !previousKeys.has(listingKey(item)))
    .map(listing => ({
      at: now.toISOString(),
      type: 'new_listing',
      listing,
      sound: listing.msrpHit ? 'fahhhh' : 'notify'
    }));
}

module.exports = {
  detectNewInStockAlerts,
  detectNewListingAlerts
};
