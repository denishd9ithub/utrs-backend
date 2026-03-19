import * as pricingService from '../services/pricingService.js';

export async function getVillaPricing(req, res, next) {
  try {
    const { checkIn, checkOut } = req.query;
    const pricing = await pricingService.getVillaPricing(req.params.villaId, { checkIn, checkOut });
    res.json(pricing);
  } catch (err) {
    next(err);
  }
}

export async function getFlagged(req, res, next) {
  try {
    const flags = await pricingService.getFlaggedPricing();
    res.json(flags);
  } catch (err) {
    next(err);
  }
}
