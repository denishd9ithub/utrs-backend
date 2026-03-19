/**
 * Razorpay API client
 * https://razorpay.com/docs/api/orders
 */
import axios from 'axios';
import { config } from '../config/index.js';

const RAZORPAY_BASE = 'https://api.razorpay.com/v1';

function getAuth() {
  const keyId = config.razorpay?.keyId;
  const keySecret = config.razorpay?.keySecret;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials not configured');
  }
  const creds = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return `Basic ${creds}`;
}

/**
 * Create order with payment_capture=0 for card authorization.
 * Card payments will be "authorized" (amount held); capture via capturePayment().
 * UPI/netbanking/wallet are auto-captured by Razorpay (no auth support).
 */
export async function createOrder({ amountPaise, bookingRef, currency = 'INR' }) {
  try {
    const res = await axios.post(
      `${RAZORPAY_BASE}/orders`,
      {
        amount: amountPaise,
        currency,
        receipt: bookingRef,
        notes: { booking_ref: bookingRef },
        payment_capture: 0, // Manual capture: card = authorized, UPI = auto-captured
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: getAuth(),
        },
      }
    );
    return res.data;
  } catch (err) {
    if (err.response?.status === 401) {
      const hint = 'Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env - remove quotes/spaces. Get keys from dashboard.razorpay.com → Settings → API Keys.';
      throw new Error(`Razorpay authentication failed (401). ${hint}`);
    }
    throw err;
  }
}

/**
 * Fetch order details from Razorpay (to get receipt/notes from payment.captured webhook)
 */
export async function fetchOrder(orderId) {
  const res = await axios.get(`${RAZORPAY_BASE}/orders/${orderId}`, {
    headers: { Authorization: getAuth() },
  });
  return res.data;
}

/**
 * Fetch payment details (method, status: authorized|captured, etc.)
 */
export async function fetchPayment(paymentId) {
  const res = await axios.get(`${RAZORPAY_BASE}/payments/${paymentId}`, {
    headers: { Authorization: getAuth() },
  });
  return res.data;
}

/**
 * Capture authorized payment. Must be called within ~5 days of authorization.
 * Throws if already captured (safety: prevent double capture).
 */
export async function capturePayment({ paymentId, amountPaise, currency = 'INR' }) {
  const res = await axios.post(
    `${RAZORPAY_BASE}/payments/${paymentId}/capture`,
    { amount: amountPaise, currency },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: getAuth(),
      },
    }
  );
  return res.data;
}

/**
 * Refund a payment (for UPI when booking fails; cards use auth expiry instead).
 * Only works on captured payments. Omit amount for full refund.
 */
export async function refundPayment({ paymentId, amountPaise, reason }) {
  const body = {};
  if (amountPaise != null) body.amount = amountPaise;
  if (reason) body.notes = { reason };
  const res = await axios.post(
    `${RAZORPAY_BASE}/payments/${paymentId}/refund`,
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: getAuth(),
      },
    }
  );
  return res.data;
}
