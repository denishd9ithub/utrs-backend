/**
 * HyperGuest API Connector
 * Uses Bearer token auth and search API
 */
import { BaseConnector } from './baseConnector.js';
import * as hyperguestService from '../services/hyperguestService.js';
import { config } from '../config/index.js';

const cfg = config.hyperguest;

export class HyperGuestConnector extends BaseConnector {
  constructor() {
    super({
      baseUrl: cfg?.searchUrl || cfg?.apiUrl,
      name: 'hyperguest',
    });
  }

  normalizeVilla(raw, netRate = 0, pricing = null) {
    const prop = raw.propertyInfo || raw;
    const rawData = { ...raw, netRate };
    if (pricing && Object.keys(pricing).length) rawData.pricing = pricing;
    return {
      externalId: String(raw.propertyId ?? prop?.id ?? ''),
      name: prop?.name || raw.name || 'Unknown',
      nameNormalized: (prop?.name || '').toLowerCase().replace(/\s+/g, ' ').trim(),
      latitude: prop?.latitude ?? raw.latitude,
      longitude: prop?.longitude ?? raw.longitude,
      location: prop?.cityName || prop?.location || raw.city,
      region: prop?.regionName || raw.region,
      country: prop?.countryName || raw.country || 'India',
      maxGuests: 1,
      rawData,
    };
  }

  /** Build per-date pricing from total netRate (split evenly across nights) */
  buildPricingFromTotal(checkIn, nights, netRate) {
    const pricing = {};
    const ratePerNight = nights > 0 ? Number((netRate / nights).toFixed(2)) : netRate;
    const start = new Date(checkIn);
    for (let i = 0; i < nights; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      pricing[d.toISOString().slice(0, 10)] = ratePerNight;
    }
    return pricing;
  }

  async fetchInventory({ checkIn, checkOut, location } = {}) {
    if (!cfg?.authToken) {
      console.warn('[HyperGuest] Auth token not configured');
      return [];
    }
    const start = checkIn || new Date().toISOString().slice(0, 10);
    const end = checkOut || start;
    const nights = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000));

    const data = await hyperguestService.search({
      checkIn: start,
      nights,
      guests: 1,
      hotelIds: cfg.testPropertyId || '19912',
    });

    const results = data?.results || [];
    const items = [];
    for (const r of results) {
      const room = r.rooms?.[0];
      const ratePlan = room?.ratePlans?.[0];
      const prices = ratePlan?.prices;
      const netRate = prices?.net?.price ?? prices?.bar?.price ?? 0;
      const pricing = this.buildPricingFromTotal(start, nights, netRate);
      items.push(this.normalizeVilla(r, netRate, pricing));
    }
    return items;
  }
}
