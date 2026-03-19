import * as searchService from '../services/searchService.js';

export async function search(req, res, next) {
  try {
    const { location, guests, checkIn, checkOut, minPrice, maxPrice, amenities, page = 1, limit = 20 } = req.body;
    const result = await searchService.search({
      location,
      guests,
      checkIn,
      checkOut,
      minPrice,
      maxPrice,
      amenities,
      page,
      limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
