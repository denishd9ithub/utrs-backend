/**
 * HyperGuest API Service (Test Mode / Certification)
 */
import axios from 'axios';
import { config } from '../config/index.js';

const HG = config.hyperguest;
const BOOK_TIMEOUT = 300000; // 300 seconds per API requirement

function getHeaders() {
  const token = HG.authToken;
  if (!token) throw new Error('HyperGuest auth token not configured');
  return {
    Authorization: `Bearer ${token}`,
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
}

/**
 * Search for availability
 */
export async function search({ checkIn, nights, guests, hotelIds, customerNationality, currency }) {
  const params = new URLSearchParams();
  params.set('checkIn', checkIn);
  params.set('nights', nights ?? 1);
  params.set('guests', guests ?? 1);
  params.set('hotelIds', hotelIds ?? HG.testPropertyId);
  if (customerNationality) params.set('customerNationality', customerNationality);
  if (currency) params.set('currency', currency);

  const res = await axios.get(`${HG.searchUrl}/2.0/?${params}`, {
    headers: getHeaders(),
    timeout: 30000,
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    const err = new Error(res.data?.error || res.data?.message || `HyperGuest search failed: ${res.status}`);
    err.status = res.status;
    err.response = { status: res.status, statusText: res.statusText, data: res.data };
    throw err;
  }
  return res.data;
}

/**
 * Create a booking with HyperGuest
 */
export async function createBooking(payload) {
  const res = await axios.post(
    `${HG.bookUrl}/2.0/booking/create`,
    payload,
    {
      headers: getHeaders(),
      timeout: BOOK_TIMEOUT,
      validateStatus: () => true,
    }
  );
  if (res.status >= 400) {
    const err = new Error(res.data?.error || res.data?.message || `HyperGuest booking failed: ${res.status}`);
    err.status = res.status;
    err.response = { status: res.status, statusText: res.statusText, data: res.data };
    throw err;
  }
  return res.data;
}

/**
 * Pre-book (price & payment options validation before final booking)
 */
export async function preBook(payload) {
  const res = await axios.post(
    `${HG.bookUrl}/2.0/booking/pre-book`,
    payload,
    {
      headers: getHeaders(),
      timeout: 30000,
      validateStatus: () => true,
    }
  );
  if (res.status >= 400) {
    const err = new Error(res.data?.error || res.data?.message || `HyperGuest pre-book failed: ${res.status}`);
    err.status = res.status;
    err.response = { status: res.status, statusText: res.statusText, data: res.data };
    throw err;
  }
  return res.data;
}

/**
 * Get booking details by HyperGuest bookingId
 */
export async function getBooking(bookingId) {
  const res = await axios.get(
    `${HG.bookUrl}/2.0/booking/get/${bookingId}`,
    { headers: getHeaders(), validateStatus: () => true }
  );
  if (res.status >= 400) {
    const err = new Error(res.data?.error || res.data?.message || `HyperGuest get booking failed: ${res.status}`);
    err.status = res.status;
    err.response = { status: res.status, statusText: res.statusText, data: res.data };
    throw err;
  }
  return res.data;
}

/**
 * List bookings (fallback when create times out)
 */
export async function listBookings({ agencyReference, dates, limit = 100, page = 1 }) {
  const body = {};
  if (agencyReference) body.agencyReference = agencyReference;
  if (dates) body.dates = dates;

  const res = await axios.post(
    `${HG.bookUrl}/2.0/booking/list?limit=${limit}&page=${page}`,
    Object.keys(body).length ? body : {},
    { headers: getHeaders(), validateStatus: () => true }
  );
  if (res.status >= 400) {
    const err = new Error(res.data?.error || res.data?.message || `HyperGuest list bookings failed: ${res.status}`);
    err.status = res.status;
    err.response = { status: res.status, statusText: res.statusText, data: res.data };
    throw err;
  }
  return res.data;
}

/**
 * Cancel a booking
 */
export async function cancelBooking({ bookingId, reason, simulation = false }) {
  const res = await axios.post(
    `${HG.bookUrl}/2.0/booking/cancel`,
    { bookingId, reason, simulation },
    { headers: getHeaders(), validateStatus: () => true }
  );
  if (res.status >= 400) {
    const err = new Error(res.data?.error || res.data?.message || `HyperGuest cancel booking failed: ${res.status}`);
    err.status = res.status;
    err.response = { status: res.status, statusText: res.statusText, data: res.data };
    throw err;
  }
  return res.data;
}
