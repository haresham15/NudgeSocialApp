// ============================================================================
// Yelp Fusion API Client
// ============================================================================
// Fetches nearby venues for a given lat/lng using the Yelp Fusion Business
// Search endpoint. Returns a curated, structured list of venues suitable
// for feeding into the Claude Sonnet prompt as context.
//
// The client respects the PRD's real-time context requirement by fetching
// venues that are currently open and sorting by distance.
//
// Yelp Fusion v3 docs: https://docs.developer.yelp.com/reference/v3_business_search
// ============================================================================

import { config } from '../config.js';

const YELP_BASE_URL = 'https://api.yelp.com/v3';

/**
 * @typedef {object} NearbyVenue
 * @property {string}  id         — Yelp business ID
 * @property {string}  name       — Business name
 * @property {string}  category   — Primary category (e.g. "Coffee Shop")
 * @property {number}  rating     — Yelp rating (1-5)
 * @property {string}  priceLevel — Price level ($, $$, $$$, $$$$)
 * @property {number}  distanceM  — Distance from search point in meters
 * @property {string}  address    — Display address
 * @property {string}  imageUrl   — Main photo URL
 * @property {boolean} isOpen     — Whether currently open
 * @property {string}  url        — Yelp URL
 * @property {string}  phone      — Phone number
 */

/**
 * Searches for nearby venues using the Yelp Fusion API.
 *
 * @param {number} lat — Latitude
 * @param {number} lng — Longitude
 * @param {object} [options]
 * @param {number} [options.radius]   — Search radius in meters (default from config)
 * @param {number} [options.limit]    — Max results (default from config)
 * @param {string} [options.term]     — Search term (e.g. "coffee", "restaurants")
 * @param {string} [options.sortBy]   — Sort order: "best_match" | "rating" | "distance"
 * @returns {Promise<NearbyVenue[]>}
 */
export async function searchNearbyVenues(lat, lng, options = {}) {
  if (!config.YELP_FUSION_API_KEY) {
    console.warn('[Yelp] API key not configured — returning empty venues');
    return [];
  }

  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lng.toString(),
    radius: (options.radius || config.YELP_SEARCH_RADIUS).toString(),
    limit: (options.limit || config.YELP_SEARCH_LIMIT).toString(),
    sort_by: options.sortBy || 'distance',
    open_now: 'true',
  });

  if (options.term) {
    params.set('term', options.term);
  }

  const url = `${YELP_BASE_URL}/businesses/search?${params}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.YELP_FUSION_API_KEY}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(3000), // 3s timeout
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Yelp] API error ${response.status}: ${errorBody}`);
      return [];
    }

    const data = await response.json();

    return (data.businesses || []).map((biz) => ({
      id: biz.id,
      name: biz.name,
      category: biz.categories?.[0]?.title || 'Unknown',
      rating: biz.rating || 0,
      priceLevel: biz.price || '$',
      distanceM: Math.round(biz.distance || 0),
      address: biz.location?.display_address?.join(', ') || '',
      imageUrl: biz.image_url || '',
      isOpen: !biz.is_closed,
      url: biz.url || '',
      phone: biz.display_phone || '',
    }));
  } catch (err) {
    // Timeout or network error — return empty rather than failing the pipeline
    console.error('[Yelp] Request failed:', err.message);
    return [];
  }
}

/**
 * Fetches curated venue categories for a proximity match.
 * Runs multiple searches in parallel for diverse suggestions.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{restaurants: NearbyVenue[], cafes: NearbyVenue[], activities: NearbyVenue[]}>}
 */
export async function fetchVenueContext(lat, lng) {
  const [restaurants, cafes, activities] = await Promise.allSettled([
    searchNearbyVenues(lat, lng, { term: 'restaurants', limit: 3 }),
    searchNearbyVenues(lat, lng, { term: 'coffee tea', limit: 3 }),
    searchNearbyVenues(lat, lng, { term: 'fun activities entertainment', limit: 3 }),
  ]);

  return {
    restaurants: restaurants.status === 'fulfilled' ? restaurants.value : [],
    cafes: cafes.status === 'fulfilled' ? cafes.value : [],
    activities: activities.status === 'fulfilled' ? activities.value : [],
  };
}
