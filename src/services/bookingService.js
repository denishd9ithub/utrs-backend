import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { config } from '../config/index.js';
import * as accountingService from './accountingService.js';
import * as razorpayService from './razorpayService.js';
import * as hyperguestService from './hyperguestService.js';
import * as partnerService from './partnerService.js';

const BOOKING_REF_PREFIX = 'VBR';

function generateBookingRef() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${BOOKING_REF_PREFIX}-${ts}-${rnd}`;
}

export async function createBooking({
  villaId,
  checkIn,
  checkOut,
  guests,
  guestId,
  userId,
  source = 'web',
  whatsappSessionId,
}) {
  const { data: pricing } = await supabase
    .from('villa_pricing')
    .select('net_rate, sell_rate')
    .eq('villa_id', villaId)
    .gte('source_date', checkIn)
    .lte('source_date', checkOut)
    .eq('is_safe', true);

  if (!pricing?.length) throw new Error('No available pricing for selected dates');

  const netCost = pricing.reduce((s, p) => s + Number(p.net_rate), 0);
  const sellPrice = pricing.reduce((s, p) => s + Number(p.sell_rate), 0);
  const marginAmount = sellPrice - netCost;
  const marginPercent = netCost > 0 ? ((marginAmount / netCost) * 100).toFixed(2) : 0;

  const booking = {
    booking_ref: generateBookingRef(),
    villa_id: villaId,
    check_in: checkIn,
    check_out: checkOut,
    guests: parseInt(guests, 10) || 1,
    net_cost: netCost,
    sell_price: sellPrice,
    margin_amount: marginAmount,
    margin_percent: marginPercent,
    status: 'pending',
    guest_id: guestId,
    user_id: userId,
    source,
    whatsapp_session_id: whatsappSessionId,
  };

  const { data, error } = await supabase.from('bookings').insert(booking).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getBooking(idOrRef) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef);
  const col = isUuid ? 'id' : 'booking_ref';

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      villas (id, name, slug, location, images)
    `)
    .eq(col, idOrRef)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data;
}

export async function updateStatus(idOrRef, {
  status,
  paymentId,
  razorpayOrderId,
  paymentMethod,
  paymentStatus,
  cancellationReason,
  refundAmount,
}) {
  const existing = await getBooking(idOrRef);
  if (!existing) throw new Error('Booking not found');

  const updates = { status };
  if (paymentId) updates.payment_id = paymentId;
  if (razorpayOrderId) updates.razorpay_order_id = razorpayOrderId;
  if (paymentMethod) updates.payment_method = paymentMethod;
  if (paymentStatus) updates.payment_status = paymentStatus;
  if (status === 'paid') updates.payment_gateway = 'razorpay';
  if (status === 'cancelled') {
    updates.cancelled_at = new Date().toISOString();
    if (cancellationReason) updates.cancellation_reason = cancellationReason;
  }
  if (status === 'refunded') {
    if (refundAmount != null) updates.refund_amount = refundAmount;
    updates.refunded_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', existing.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (status === 'cancelled' && existing.partner_reservation_id) {
    try {
      await hyperguestService.cancelBooking({
        bookingId: parseInt(existing.partner_reservation_id, 10) || existing.partner_reservation_id,
        reason: cancellationReason || 'Customer requested cancellation',
      });
    } catch (err) {
      console.error('[HyperGuest] Cancel failed:', err?.message || err);
    }
  }

  if (status === 'cancelled') {
    await captureOnUserCancellation(existing);
  }

  return data;
}

/**
 * User cancellation: capture authorized card payment (user loses money; no refund).
 */
async function captureOnUserCancellation(booking) {
  if (!booking?.payment_id || booking.payment_status !== 'authorized') return;

  const amountPaise = Math.round(Number(booking.sell_price) * 100);
  if (amountPaise < 100) return;

  try {
    const payment = await razorpayService.fetchPayment(booking.payment_id);
    if (payment.status === 'captured' || payment.captured) {
      console.log('[Razorpay] Skip capture - already captured', booking.booking_ref);
      return;
    }
    await razorpayService.capturePayment({
      paymentId: booking.payment_id,
      amountPaise,
      currency: booking.currency || 'INR',
    });
    await supabase
      .from('bookings')
      .update({ payment_status: 'captured' })
      .eq('id', booking.id);
    console.log('[Razorpay] Captured on user cancellation', booking.booking_ref);
  } catch (err) {
    console.error('[Razorpay] Capture on cancellation failed:', err?.message || err);
  }
}

/**
 * After Razorpay success: call HyperGuest Book API to confirm reservation.
 * Updates booking with partner_reservation_id, partner_id, status: confirmed.
 */
async function confirmWithHyperGuest(booking) {
  if (!booking?.villa_id) return; // Partner-direct bookings skip this
  if (booking.partner_reservation_id) return; // Already confirmed

  const partner = await partnerService.getPartnerByCode('hyperguest');
  if (!partner) return;

  const { data: source } = await supabase
    .from('villa_sources')
    .select('id, partner_id, external_id, raw_data')
    .eq('villa_id', booking.villa_id)
    .eq('partner_id', partner.id)
    .maybeSingle();

  if (!source) return; // Villa not from HyperGuest

  const raw = source.raw_data || {};
  const room = raw.rooms?.[0] ?? raw.propertyInfo?.rooms?.[0];
  const ratePlan = room?.ratePlans?.[0];
  const roomCode = room?.roomCode ?? room?.roomTypeCode ?? room?.code;
  const roomId = room?.roomId ?? room?.id;
  const rateCode = ratePlan?.rateCode ?? ratePlan?.ratePlanCode ?? ratePlan?.code;
  const ratePlanId = ratePlan?.ratePlanId ?? ratePlan?.id;

  if (!roomCode && !roomId) {
    console.warn('[HyperGuest] Missing roomCode/roomId in raw_data for villa', booking.villa_id);
    return;
  }
  if (!rateCode && !ratePlanId) {
    console.warn('[HyperGuest] Missing rateCode/ratePlanId in raw_data for villa', booking.villa_id);
    return;
  } 

  // HyperGuest requires expectedPrice.currency = search currency (not Razorpay/booking currency)
  const searchCurrency =
    ratePlan?.prices?.net?.currency ??
    ratePlan?.prices?.bar?.currency ??
    ratePlan?.prices?.sell?.currency ??
    'EUR';

  let guest = null;
  if (booking.guest_id) {
    const { data: g } = await supabase.from('guests').select('name, email, phone, birth_date').eq('id', booking.guest_id).single();
    guest = g;
  }
  if (!guest?.name) {
    console.warn('[HyperGuest] No guest data for booking', booking.booking_ref, '- cannot confirm');
    return;
  }

  const fullName = String(guest.name).trim() || 'Guest';
  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] || 'Guest';
  const lastName = nameParts.slice(1).join(' ') || 'Guest';
  const birthDate = guest.birth_date
    ? (typeof guest.birth_date === 'string' ? guest.birth_date : guest.birth_date.toISOString?.().slice(0, 10))
    : '1990-01-01';
  const guestEmail = guest.email || `guest-${booking.guest_id}@placeholder.local`;
  const guestPhone = guest.phone || '+910000000000';

  // HyperGuest requires leadGuest.contact as full object (address, city, country, email, phone, state, zip)
  const leadContact = {
    address: 'N/A',
    city: 'N/A',
    country: 'IN',
    email: guestEmail,
    phone: guestPhone,
    state: 'N/A',
    zip: 'N/A',
  };

  const roomPayload = {
    ...(roomCode && { roomCode }),
    ...(roomId && { roomId }),
    ...(rateCode && { rateCode }),
    ...(ratePlanId && { ratePlanId }),
    expectedPrice: {
      amount: Number(booking.net_cost),
      currency: searchCurrency,
    },
    guests: [
      {
        name: { first: firstName, last: lastName },
        birthDate,
        title: 'MR',
      },
    ],
  };

  const payload = {
    dates: { from: booking.check_in, to: booking.check_out },
    propertyId: parseInt(source.external_id, 10) || source.external_id,
    reference: { agency: booking.booking_ref },
    leadGuest: {
      name: { first: firstName, last: lastName },
      contact: leadContact,
      birthDate,
      title: 'MR',
    },
    rooms: [roomPayload],
    paymentDetails: { type: 'external' }, // Payment taken via Razorpay
  };

  const hgResponse = await hyperguestService.createBooking(payload);
  const hgBookingId = hgResponse?.bookingId ?? hgResponse?.rooms?.[0]?.bookingId ?? hgResponse?.content?.bookingId;

  if (hgBookingId) {
    await supabase
      .from('bookings')
      .update({
        partner_reservation_id: String(hgBookingId),
        partner_id: partner.id,
        partner_meta: hgResponse,
        status: 'confirmed',
      })
      .eq('id', booking.id);
  }
}

/**
 * Create Razorpay order for a booking. Returns order_id for frontend checkout.
 */
export async function createRazorpayOrder(idOrRef) {
  const booking = await getBooking(idOrRef);
  if (!booking) throw new Error('Booking not found');
  const allowed = ['pending', 'booking_failed'];
  if (!allowed.includes(booking.status)) {
    throw new Error(`Cannot create payment for booking in ${booking.status} state`);
  }
  if (booking.status === 'booking_failed') {
    await supabase
      .from('bookings')
      .update({ status: 'pending', payment_id: null, razorpay_order_id: null, payment_status: null, payment_method: null })
      .eq('id', booking.id);
  }
  const current = await getBooking(idOrRef);
  if (current.razorpay_order_id) {
    const amountPaise = Math.round(Number(booking.sell_price) * 100);
    return {
      orderId: booking.razorpay_order_id,
      amount: amountPaise,
      currency: booking.currency || 'INR',
      keyId: config.razorpay?.keyId,
    };
  }

  const amountPaise = Math.round(Number(booking.sell_price) * 100);
  if (amountPaise < 100) throw new Error('Amount too low for Razorpay (min ₹1)');

  const order = await razorpayService.createOrder({
    amountPaise,
    bookingRef: booking.booking_ref,
    currency: booking.currency || 'INR',
  });

  await updateStatus(idOrRef, {
    status: 'payment_initiated',
    razorpayOrderId: order.id,
  });

  return {
    orderId: order.id,
    amount: amountPaise,
    currency: order.currency || 'INR',
    keyId: config.razorpay?.keyId,
  };
}

/**
 * Process payment success: store payment details, confirm with HyperGuest, capture/refund per payment type.
 * Card: authorize first; capture only on success; on platform failure, let auth expire.
 * UPI: auto-captured; on platform failure, refund.
 */
export async function processPaymentSuccess(idOrRef, paymentId, orderId) {
  const booking = await getBooking(idOrRef);
  if (!booking) throw new Error('Booking not found');
  if (booking.razorpay_order_id !== orderId) {
    throw new Error('Order does not match booking');
  }

  if (booking.payment_id && ['paid', 'confirmed', 'booking_failed'].includes(booking.status)) {
    return getBooking(idOrRef);
  }

  const payment = await razorpayService.fetchPayment(paymentId);
  if (payment.order_id !== orderId) throw new Error('Payment does not match order');

  const paymentMethod = payment.method || 'unknown';
  const paymentStatus = payment.status || (payment.captured ? 'captured' : 'authorized');
  const isCardAuthorized = paymentMethod === 'card' && paymentStatus === 'authorized';
  const isUpiCaptured = paymentMethod === 'upi' && (paymentStatus === 'captured' || payment.captured);

  await supabase
    .from('bookings')
    .update({
      payment_id: paymentId,
      razorpay_order_id: orderId,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      payment_gateway: 'razorpay',
      status: 'paid',
    })
    .eq('id', booking.id);

  console.log('[Payment] State stored', {
    booking_ref: booking.booking_ref,
    payment_method: paymentMethod,
    payment_status: paymentStatus,
  });

  const updated = await getBooking(idOrRef);

  try {
    await confirmWithHyperGuest(updated);
  } catch (err) {
    console.error('[HyperGuest] Post-payment confirm failed:', err?.message || err);
    if (err?.response) {
      console.error('[HyperGuest] API response:', JSON.stringify(err.response, null, 2));
    }
    if (isCardAuthorized) {
      await supabase
        .from('bookings')
        .update({ status: 'booking_failed', payment_status: 'released' })
        .eq('id', booking.id);
      console.log('[Razorpay] Card authorized - not capturing, auth will expire', booking.booking_ref);
    } else if (isUpiCaptured) {
      try {
        await razorpayService.refundPayment({
          paymentId,
          reason: 'Platform failure: booking could not be confirmed',
        });
      } catch (refundErr) {
        console.error('[Razorpay] Refund failed:', refundErr?.message || refundErr);
      }
      await supabase
        .from('bookings')
        .update({
          status: 'booking_failed',
          payment_status: 'refunded',
          refunded_at: new Date().toISOString(),
          refund_amount: Number(booking.sell_price),
        })
        .eq('id', booking.id);
      console.log('[Razorpay] UPI refunded due to platform failure', booking.booking_ref);
    } else {
      await supabase
        .from('bookings')
        .update({ status: 'booking_failed' })
        .eq('id', booking.id);
    }
    return getBooking(idOrRef);
  }

  if (isCardAuthorized || paymentStatus === 'authorized') {
    const amountPaise = Math.round(Number(booking.sell_price) * 100);
    try {
      const currentPayment = await razorpayService.fetchPayment(paymentId);
      if (currentPayment.status === 'captured' || currentPayment.captured) {
        console.log('[Razorpay] Skip capture - already captured', booking.booking_ref);
      } else {
        await razorpayService.capturePayment({
          paymentId,
          amountPaise,
          currency: booking.currency || 'INR',
        });
      }
      await supabase
        .from('bookings')
        .update({ payment_status: 'captured' })
        .eq('id', booking.id);
      console.log('[Razorpay] Card captured after HG confirm', booking.booking_ref);
    } catch (captureErr) {
      console.error('[Razorpay] Capture failed:', captureErr?.message || captureErr);
    }
  }

  const final = await getBooking(idOrRef);
  try {
    await accountingService.createInvoice(final);
  } catch (err) {
    console.error('[Accounting] Invoice creation failed:', err);
  }
  return final;
}

/**
 * Admin refund: call Razorpay refund API and update booking.
 * Only works on captured payments (paid/confirmed). Card authorized cannot be refunded.
 */
export async function refundBooking(idOrRef, { reason, amount } = {}) {
  const booking = await getBooking(idOrRef);
  if (!booking) throw new Error('Booking not found');
  if (!booking.payment_id) throw new Error('No Razorpay payment to refund');
  if (booking.status === 'refunded') throw new Error('Booking already refunded');

  const paymentStatus = booking.payment_status || 'captured';
  if (paymentStatus === 'authorized') {
    throw new Error('Payment is authorized but not captured. Cannot refund; let authorization expire (~5 days).');
  }

  const amountPaise = amount != null
    ? Math.round(Number(amount) * 100)
    : Math.round(Number(booking.sell_price) * 100);
  const refundAmount = amountPaise / 100;

  await razorpayService.refundPayment({
    paymentId: booking.payment_id,
    amountPaise: amount != null ? amountPaise : undefined,
    reason: reason || 'Admin refund',
  });

  await supabase
    .from('bookings')
    .update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
      refund_amount: refundAmount,
      payment_status: 'refunded',
    })
    .eq('id', booking.id);

  console.log('[Razorpay] Admin refund completed', booking.booking_ref, refundAmount);
  return getBooking(idOrRef);
}

/**
 * Verify payment signature (frontend sends razorpay_payment_id, razorpay_order_id after success)
 * Uses key_secret (API secret), not webhook secret
 */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const keySecret = config.razorpay?.keySecret;
  if (!keySecret) throw new Error('Razorpay key secret not configured');

  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/** Returns true if we should process (first time); false if duplicate */
async function ensureIdempotency(eventType, entityId) {
  const { error } = await supabase
    .from('razorpay_webhook_events')
    .insert({ event_type: eventType, entity_id: entityId });

  if (error?.code === '23505') return false;
  if (error) throw error;
  return true;
}

async function getBookingRefFromOrder(orderId) {
  const order = await razorpayService.fetchOrder(orderId);
  return order?.receipt || order?.notes?.booking_ref || null;
}

export async function handleRazorpayWebhook(req) {
  const rawBody = req.body;
  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = config.razorpay?.webhookSecret;

  // Log incoming webhook (helps debug ngrok/routing)
  const payload = JSON.parse(rawBody?.toString?.() || '{}');
  const event = payload.event;
  console.log('[Razorpay] Webhook received', { event, hasPayment: !!payload?.payload?.payment?.entity, hasOrder: !!payload?.payload?.order?.entity });

  if (webhookSecret && signature) {
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    if (signature !== expected) {
      console.error('[Razorpay] Webhook signature mismatch');
      throw new Error('Invalid webhook signature');
    }
  } else if (!webhookSecret) {
    console.warn('[Razorpay] Webhook secret not set - skipping signature verification');
  }

  const payment = payload.payload?.payment?.entity;
  const order = payload.payload?.order?.entity;

  const processPaymentForBooking = async (bookingRef, paymentId, orderId) => {
    const booking = await getBooking(bookingRef);
    if (!booking) return;
    try {
      await processPaymentSuccess(bookingRef, paymentId, orderId);
      console.log('[Razorpay] Webhook processed', event, bookingRef);
    } catch (err) {
      console.error('[Razorpay] Webhook process failed:', err?.message || err);
    }
  };

  if (event === 'payment.authorized' && payment) {
    const entityId = `auth_${payment.id}`;
    if (!(await ensureIdempotency('payment.authorized', entityId))) return;

    let bookingRef = payment.notes?.booking_ref;
    if (!bookingRef && payment.order_id) {
      try {
        bookingRef = await getBookingRefFromOrder(payment.order_id);
      } catch (e) {
        console.warn('[Razorpay] Could not fetch order for payment.authorized:', e?.message);
      }
    }
    if (bookingRef && payment.order_id) {
      await processPaymentForBooking(bookingRef, payment.id, payment.order_id);
    } else {
      console.warn('[Razorpay] payment.authorized: no bookingRef (order_id:', payment.order_id, ')');
    }
    return;
  }

  if (event === 'payment.captured' && payment) {
    const entityId = `captured_${payment.id}`;
    if (!(await ensureIdempotency('payment.captured', entityId))) return;

    let bookingRef = payment.notes?.booking_ref;
    if (!bookingRef && payment.order_id) {
      try {
        bookingRef = await getBookingRefFromOrder(payment.order_id);
      } catch (e) {
        console.warn('[Razorpay] Could not fetch order for payment.captured:', e?.message);
      }
    }
    if (bookingRef && payment.order_id) {
      await processPaymentForBooking(bookingRef, payment.id, payment.order_id);
    } else {
      console.warn('[Razorpay] payment.captured: no bookingRef (order_id:', payment.order_id, ')');
    }
    return;
  }

  if (event === 'order.paid' && order) {
    const entityId = `order_${order.id}`;
    if (!(await ensureIdempotency('order.paid', entityId))) return;

    const bookingRef = order.receipt || order.notes?.booking_ref;
    if (bookingRef && payment?.id) {
      await processPaymentForBooking(bookingRef, payment.id, order.id);
    }
    return;
  }

  if (event === 'payment.failed' && payment) {
    const entityId = `failed_${payment.id}`;
    if (!(await ensureIdempotency('payment.failed', entityId))) return;

    let bookingRef = null;
    if (payment.order_id) {
      try {
        bookingRef = await getBookingRefFromOrder(payment.order_id);
      } catch (e) {
        console.warn('[Razorpay] Could not fetch order for failed payment:', e.message);
      }
    }
    if (bookingRef) {
      const existing = await getBooking(bookingRef);
      if (existing?.status === 'payment_initiated') {
        await supabase
          .from('bookings')
          .update({ status: 'pending' })
          .eq('id', existing.id);
      }
    }
  }
}
