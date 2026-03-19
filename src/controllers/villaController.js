import * as villaService from '../services/villaService.js';

export async function update(req, res, next) {
  try {
    const { name, description, images, amenities, location, max_guests } = req.body;
    const updates = {};
    if (name != null) updates.name = name;
    if (description != null) updates.description = description;
    if (images != null) updates.images = images;
    if (amenities != null) updates.amenities = amenities;
    if (location != null) updates.location = location;
    if (max_guests != null) updates.max_guests = max_guests;

    const villa = await villaService.updateVilla(req.params.id, updates);
    if (!villa) return res.status(404).json({ error: 'Villa not found' });
    res.json(villa);
  } catch (err) {
    next(err);
  }
}

export async function lockFields(req, res, next) {
  try {
    const { fields } = req.body;
    if (!Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: 'fields array required (e.g. ["description","images"])' });
    }
    const allowed = ['name', 'description', 'images', 'amenities', 'location', 'max_guests'];
    const valid = fields.filter((f) => allowed.includes(f));
    if (valid.length === 0) {
      return res.status(400).json({ error: 'No valid fields to lock' });
    }
    const villa = await villaService.lockVillaFields(req.params.id, valid);
    if (!villa) return res.status(404).json({ error: 'Villa not found' });
    res.json(villa);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const { location, guests, page = 1, limit = 20 } = req.query;
    const result = await villaService.listVillas({ location, guests, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const villa = await villaService.getVillaById(req.params.id);
    if (!villa) return res.status(404).json({ error: 'Villa not found' });
    res.json(villa);
  } catch (err) {
    next(err);
  }
}

export async function getBySlug(req, res, next) {
  try {
    const villa = await villaService.getVillaBySlug(req.params.slug);
    if (!villa) return res.status(404).json({ error: 'Villa not found' });
    res.json(villa);
  } catch (err) {
    next(err);
  }
}
