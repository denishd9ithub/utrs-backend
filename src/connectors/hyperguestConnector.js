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

  /** Max nights per HyperGuest search (API validation limit) */
  static MAX_NIGHTS_PER_REQUEST = 30;

  async fetchInventory({ checkIn, checkOut, location } = {}) {
    if (!cfg?.authToken) {
      console.warn('[HyperGuest] Auth token not configured');
      return [];
    }
    const start = checkIn || new Date().toISOString().slice(0, 10);
    const end = checkOut || start;
    const totalNights = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000));

    const chunkSize = HyperGuestConnector.MAX_NIGHTS_PER_REQUEST;
    const mergedByExternalId = new Map();

    for (let offset = 0; offset < totalNights; offset += chunkSize) {
      const chunkNights = Math.min(chunkSize, totalNights - offset);
      const chunkStart = new Date(start);
      chunkStart.setDate(chunkStart.getDate() + offset);
      const chunkStartStr = chunkStart.toISOString().slice(0, 10);

      const data = await hyperguestService.search({
        checkIn: chunkStartStr,
        nights: chunkNights,
        guests: 1,
        hotelIds: cfg.testPropertyId || '19912',
      });

      const results = data?.results || [];
      for (const r of results) {
        const room = r.rooms?.[0];
        const ratePlan = room?.ratePlans?.[0];
        const prices = ratePlan?.prices;
        const netRate = prices?.net?.price ?? prices?.bar?.price ?? 0;
        const pricing = this.buildPricingFromTotal(chunkStartStr, chunkNights, netRate);
        const normalized = this.normalizeVilla(r, netRate, pricing);
        const extId = normalized.externalId;

        if (mergedByExternalId.has(extId)) {
          const existing = mergedByExternalId.get(extId);
          existing.rawData.pricing = { ...existing.rawData.pricing, ...pricing };
        } else {
          mergedByExternalId.set(extId, normalized);
        }
      }
    }

    return Array.from(mergedByExternalId.values());
  }
}
