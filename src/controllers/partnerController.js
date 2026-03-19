import * as partnerService from '../services/partnerService.js';

export async function list(req, res, next) {
  try {
    const partners = await partnerService.listPartners();
    res.json(partners);
  } catch (err) {
    next(err);
  }
}

export async function get(req, res, next) {
  try {
    const partner = await partnerService.getPartner(req.params.id);
    if (!partner) return res.status(404).json({ error: 'Partner not found' });
    res.json(partner);
  } catch (err) {
    next(err);
  }
}
