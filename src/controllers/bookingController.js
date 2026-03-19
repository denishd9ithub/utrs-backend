import * as bookingService from '../services/bookingService.js';
import * as guestService from '../services/guestService.js';

export async function create(req, res, next) {
  try {
    const { villaId, checkIn, checkOut, guests, guestId, guest, source, whatsappSessionId } = req.body;

    let resolvedGuestId = guestId;

    if (resolvedGuestId) {
      const g = await guestService.getGuest(resolvedGuestId);
      if (!g) return res.status(400).json({ error: 'Guest not found', guestId: resolvedGuestId });
    } else if (guest && (guest.name || guest.email)) {
      const newGuest = await guestService.createGuest({
        name: guest.name?.trim(),
        email: guest.email?.trim(),
        phone: guest.phone?.trim(),
        birthDate: guest.birthDate || null,
        address: guest.address || null,
        userId: req.user?.id || null,
      });
      resolvedGuestId = newGuest.id;
    } else if (req.user) {
      const myGuest = await guestService.findOrCreateGuestForUser(req.user);
      resolvedGuestId = myGuest?.id || null;
    }

    if (!resolvedGuestId) {
      return res.status(400).json({
        error: 'Guest required. Provide guestId, guest: { name, email?, phone? }, or login with Bearer token.',
      });
    }

    const booking = await bookingService.createBooking({
      villaId,
      checkIn,
      checkOut,
      guests,
      guestId: resolvedGuestId,
      userId: req.user?.id || null,
      source,
      whatsappSessionId,
    });
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
}

export async function get(req, res, next) {
  try {
    const booking = await bookingService.getBooking(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    next(err);
  }
}

export async function createOrder(req, res, next) {
  try {
    const result = await bookingService.createRazorpayOrder(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const { orderId, paymentId, signature } = req.body;
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: 'orderId, paymentId and signature required' });
    }

    const valid = bookingService.verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });
    if (!valid) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const booking = await bookingService.getBooking(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.razorpay_order_id !== orderId) {
      return res.status(400).json({ error: 'Order does not match booking' });
    }

    const updated = await bookingService.processPaymentSuccess(req.params.id, paymentId, orderId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req, res, next) {
  try {
    const { status, paymentId, cancellationReason, refundAmount } = req.body;
    const booking = await bookingService.updateStatus(req.params.id, {
      status,
      paymentId,
      cancellationReason,
      refundAmount,
    });
    res.json(booking);
  } catch (err) {
    next(err);
  }
}

/**
 * Admin only: Refund a booking via Razorpay.
 * POST /bookings/:id/refund
 * Body: { reason?: string, amount?: number } — amount in INR for partial refund; omit for full
 */
export async function refund(req, res, next) {
  try {
    const { reason, amount } = req.body;
    const booking = await bookingService.refundBooking(req.params.id, {
      reason,
      amount,
    });
    res.json(booking);
  } catch (err) {
    next(err);
  }
}
