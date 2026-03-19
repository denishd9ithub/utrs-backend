import * as hyperguestService from '../services/hyperguestService.js';
import { supabase } from '../config/supabase.js';
import { config } from '../config/index.js';

/**
 * GET /hyperguest/search
 * Query: checkIn, nights, guests, hotelIds?, customerNationality?, currency?
*/
export async function search(req, res, next) {
  try {


    const { checkIn, nights, guests, hotelIds, customerNationality, currency } = req.query;
    if (!checkIn) return res.status(400).json({ error: 'checkIn required (YYYY-MM-DD)' });

    const data = await hyperguestService.search({
      checkIn,
      nights: nights ? parseInt(nights, 10) : 1,
      guests: guests ? parseInt(guests, 10) : 1,
      hotelIds: hotelIds || config.hyperguest?.testPropertyId,
      customerNationality,
      currency,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /hyperguest/book
 * Body: Full HyperGuest booking request (dates, propertyId, leadGuest, rooms, paymentDetails, etc.)
 */
export async function createBooking(req, res, next) {
  try {
    const payload = req.body;
    if (!payload.dates || !payload.propertyId || !payload.leadGuest || !payload.rooms) {
      return res.status(400).json({
        error: 'Required: dates, propertyId, leadGuest, rooms',
      });
    }

    const bookingRef = `VBR-HG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    payload.reference = payload.reference || {};
    payload.reference.agency = payload.reference.agency || bookingRef;

    if (payload.paymentDetails?.type === 'credit_card') {
      if (payload.paymentDetails.charge === undefined) {
        payload.paymentDetails.charge = false;
      }
    }

    const data = await hyperguestService.createBooking(payload);

    const hgBookingId = data?.bookingId ?? data?.rooms?.[0]?.bookingId ?? data?.content?.bookingId;
    if (hgBookingId) {
      const partner = await supabase
        .from('partners')
        .select('id')
        .eq('code', 'hyperguest')
        .single();
      const partnerId = partner?.data?.id;

      const netCost = data?.content?.prices?.net?.price ?? payload.rooms?.[0]?.expectedPrice?.amount ?? 0;
      const sellPrice = data?.content?.prices?.sell?.price ?? payload.rooms?.[0]?.expectedPrice?.amount ?? netCost;
      const marginAmount = sellPrice - netCost;
      const marginPercent = netCost > 0 ? ((marginAmount / netCost) * 100).toFixed(2) : 0;

      const { error: insertErr } = await supabase.from('bookings').insert({
        booking_ref: bookingRef,
        villa_id: null,
        check_in: payload.dates.from,
        check_out: payload.dates.to,
        guests: payload.rooms.reduce((s, r) => s + (r.guests?.length || 1), 0),
        net_cost: netCost,
        sell_price: sellPrice,
        margin_amount: marginAmount,
        margin_percent: marginPercent,
        status: 'confirmed',
        partner_id: partnerId ?? null,
        partner_reservation_id: String(hgBookingId),
        partner_meta: data,
        source: 'hyperguest',
      });

      if (insertErr) {
        console.error('[HyperGuest] DB insert failed:', insertErr.message, insertErr.details);
        return res.status(201).json({
          ...data,
          agencyReference: bookingRef,
          dbSaved: false,
          dbError: insertErr.message,
        });
      }
    }

    res.status(201).json({ ...data, agencyReference: bookingRef });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /hyperguest/pre-book
 * Body: HyperGuest pre-book request (search + rooms as per HG docs)
 * This does NOT create a booking in our DB – it only proxies to HyperGuest.
 */
export async function preBook(req, res, next) {
  try {
    const payload = req.body;

    if (!payload?.search || !payload?.rooms || !Array.isArray(payload.rooms) || !payload.rooms.length) {
      return res.status(400).json({
        error: 'Required: search and non-empty rooms array',
      });
    }

    const data = await hyperguestService.preBook(payload);
    // Just pass HyperGuest response through
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /hyperguest/booking/:bookingId
 */
export async function getBooking(req, res, next) {
  try {
    const data = await hyperguestService.getBooking(req.params.bookingId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /hyperguest/booking/list
 * Body: { agencyReference } or { dates: { startDate, endDate } }
*/

export async function listBookings(req, res, next) {
  try {
    const { agencyReference, dates, limit, page } = req.body || {};
    const data = await hyperguestService.listBookings({
      agencyReference,
      dates,
      limit,
      page,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /hyperguest/booking/:bookingId/cancel
 * Body: { reason, simulation? }
 */
export async function cancelBooking(req, res, next) {
  try {
    const { reason, simulation } = req.body || {};
    if (!reason) return res.status(400).json({ error: 'reason required' });

    const data = await hyperguestService.cancelBooking({
      bookingId: parseInt(req.params.bookingId, 10),
      reason: String(reason).slice(0, 256),
      simulation: !!simulation,
    });

    const hgBookingId = req.params.bookingId;
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('partner_reservation_id', hgBookingId)
      .maybeSingle();
    if (existing && !data?.cancelSimulation) {
      await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', existing.id);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}
