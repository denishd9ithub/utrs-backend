/**
 * Roibos API Connector
 */
import { BaseConnector } from './baseConnector.js';
import { config } from '../config/index.js';

const cfg = config.roibos;

export class RoibosConnector extends BaseConnector {
  constructor() {
    super({
      baseUrl: cfg.apiUrl,
      name: 'roibos',
    });
    this.client.defaults.headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    this.client.defaults.headers['X-API-Key'] = cfg.apiKey;
  }

  normalizeVilla(raw) {
    return {
      externalId: String(raw.id ?? raw.property_id),
      name: raw.name || raw.title,
      nameNormalized: (raw.name || '').toLowerCase().replace(/\s+/g, ' ').trim(),
      latitude: raw.latitude ?? raw.lat,
      longitude: raw.longitude ?? raw.lng,
      location: raw.location || raw.city,
      region: raw.region,
      country: raw.country || 'India',
      maxGuests: raw.max_guests ?? raw.capacity ?? 1,
      bedrooms: raw.bedrooms,
      bathrooms: raw.bathrooms,
      amenities: raw.amenities || [],
      images: raw.images || raw.photos || [],
      description: raw.description,
      rawData: raw,
    };
  }

  async fetchInventory({ checkIn, checkOut, location } = {}) {
    if (!cfg.apiKey) {
      console.warn('[Roibos] API key not configured');
      return [];
    }
    // TODO: Implement actual Roibos API call per their docs
    // const data = await this.get('/properties', { checkIn, checkOut, location });
    // return (data.data || []).map((r) => this.normalizeVilla(r));
    return [];
  }
}
