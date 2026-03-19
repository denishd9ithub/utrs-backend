import * as guestService from '../services/guestService.js';

/**
 * POST /guests
 * Body: { name?, email?, phone?, birthDate?, address? }
 * If user logged in (Bearer token): pre-fills from profile, links user_id
 */
export async function create(req, res, next) {
  try {
    const { name, email, phone, birthDate, address } = req.body;
    const payload = {
      name: name?.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      birthDate: birthDate || null,
      address: address?.trim() || null,
    };

    if (req.user) {
      const nameFromUser = req.user.user_metadata?.full_name ?? req.user.user_metadata?.name ?? req.user.email?.split('@')[0];
      payload.name = payload.name || nameFromUser || 'Guest';
      payload.email = payload.email || req.user.email || null;
      payload.phone = payload.phone || req.user.user_metadata?.phone || null;
      payload.userId = req.user.id;
    }

    const guest = await guestService.createGuest(payload);
    res.status(201).json(guest);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /guests/me
 * Returns guest for logged-in user. Creates one if not exists.
 * Requires auth.
 */
export async function getMe(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Login required' });
    }
    const guest = await guestService.findOrCreateGuestForUser(req.user);
    if (!guest) {
      return res.status(500).json({ error: 'Could not create guest' });
    }
    res.json(guest);
  } catch (err) {
    next(err);
  }
}
