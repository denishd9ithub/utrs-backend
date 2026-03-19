/**
 * Accounting Bridge: On Booking Status = "Paid"
 * Sends Invoice + Payment Entry to Zoho Books and/or Tally API
 */
import axios from 'axios';
import { config } from '../config/index.js';
import { supabase } from '../config/supabase.js';

function buildInvoicePayload(booking) {
  const customerId = config.zoho?.defaultCustomerId || booking.guest_id;
  return {
    customer_id: customerId,
    date: new Date().toISOString().split('T')[0],
    line_items: [
      {
        name: `Villa Booking - ${booking.villas?.name || booking.villa_id}`,
        description: `${booking.check_in} to ${booking.check_out}`,
        quantity: 1,
        rate: booking.sell_price,
      },
    ],
    reference_number: booking.booking_ref,
  };
}

async function getZohoAccessToken() {
  const { clientId, clientSecret, refreshToken } = config.zoho || {};
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await axios.post(
      'https://accounts.zoho.com/oauth/v2/token',
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return res.data?.access_token;
  } catch (err) {
    console.error('[Accounting] Zoho token refresh failed:', err?.message);
    return null;
  }
}

async function sendToZohoBooks(booking, payload) {
  const token = await getZohoAccessToken();
  if (!token) return null;

  const { booksUrl, organizationId } = config.zoho || {};
  const orgId = organizationId || '';
  const url = `${booksUrl}/invoices`;
  const params = orgId ? `?organization_id=${orgId}` : '';

  try {
    const lineItems = payload.line_items.map((li) => ({
      name: li.name,
      description: li.description,
      quantity: li.quantity,
      rate: li.rate,
    }));
    const res = await axios.post(
      `${url}${params}`,
      { ...payload, line_items: lineItems },
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    );
    const invoiceId = res.data?.invoice?.invoice_id;
    if (invoiceId && booking?.id) {
      await supabase.from('bookings').update({ zoho_invoice_id: String(invoiceId) }).eq('id', booking.id);
    }
    return res.data;
  } catch (err) {
    console.error('[Accounting] Zoho Books API failed:', err?.response?.data || err?.message);
    throw err;
  }
}

async function sendToTally(booking, payload) {
  const { apiUrl } = config.tally || {};
  if (!apiUrl) return null;

  const tallyPayload = {
    ledger: 'Sales - Accommodation',
    date: payload.date,
    reference: payload.reference_number,
    amount: payload.line_items?.[0]?.rate ?? booking?.sell_price,
    narration: payload.line_items?.[0]?.description || '',
  };

  try {
    const res = await axios.post(apiUrl, tallyPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return res.data;
  } catch (err) {
    console.error('[Accounting] Tally API failed:', err?.response?.data || err?.message);
    throw err;
  }
}

export async function createInvoice(booking) {
  const payload = buildInvoicePayload(booking);

  if (!config.zoho?.clientId && !config.tally?.apiUrl) {
    console.log('[Accounting] No Zoho/Tally configured, payload prepared:', payload);
    return payload;
  }

  let result = null;

  if (config.zoho?.clientId) {
    try {
      result = await sendToZohoBooks(booking, payload);
      console.log('[Accounting] Zoho invoice created:', result?.invoice?.invoice_id);
    } catch (err) {
      console.error('[Accounting] Zoho failed:', err?.message);
    }
  }
      
  if (config.tally?.apiUrl) {                                                       
    try {
      await sendToTally(booking, payload);
      console.log('[Accounting] Tally payload sent');
    } catch (err) {
      console.error('[Accounting] Tally failed:', err?.message);
    }
  }

  return result || payload;
}                                                           
              