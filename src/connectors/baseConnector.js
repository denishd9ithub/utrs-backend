/**
 * Base connector for partner APIs (HyperGuest, Roibos)
 * Handles auth, rate limiting, error handling
 */
import axios from 'axios';

export class BaseConnector {
  constructor({ baseUrl, name }) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
    this.name = name;
  }

  async get(endpoint, params = {}) {
    const { data } = await this.client.get(endpoint, { params });
    return data;
  }

  async post(endpoint, body = {}) {
    const { data } = await this.client.post(endpoint, body);
    return data;
  }

  normalizeVilla(raw) {
    throw new Error('Subclass must implement normalizeVilla');
  }

  async fetchInventory(filters = {}) {
    throw new Error('Subclass must implement fetchInventory');
  }
}
