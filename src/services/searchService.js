import { supabase } from '../config/supabase.js';

/**
 * High-speed search with sticky filters
 * Price, Location, Amenities - instant results without page reload
 * Filters by checkIn/checkOut: only villas with pricing for full date range
 */
export async function search({
  location,
  guests,
  checkIn,
  checkOut,
  minPrice,
  maxPrice,
  amenities,
  page = 1,
  limit = 20,
} = {}) {
  let villaIdsFilter = null;

  if (checkIn && checkOut) {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const nights = Math.max(1, Math.ceil((end - start) / 86400000));

    const { data: pricingRows, error: pricingErr } = await supabase
      .from('villa_pricing')
      .select('villa_id, source_date')
      .gte('source_date', checkIn)
      .lte('source_date', checkOut)
      .eq('is_safe', true);

    if (pricingErr) throw new Error(pricingErr.message);

    const byVilla = (pricingRows || []).reduce((acc, row) => {
      if (!acc[row.villa_id]) acc[row.villa_id] = new Set();
      acc[row.villa_id].add(row.source_date);
      return acc;
    }, {});

    villaIdsFilter = Object.entries(byVilla)
      .filter(([, dates]) => dates.size >= nights)
      .map(([id]) => id);

    if (villaIdsFilter.length === 0) {
      return { data: [], total: 0, page, limit };
    }
  }

  let query = supabase
    .from('villas')
    .select(
      `
      id, slug, name, location, region, max_guests, amenities, images, tags,
      villa_pricing (source_date, sell_rate, is_safe)
    `,
      { count: 'exact' }
    )
    .eq('is_active', true)
    .eq('is_hidden', false);

  if (villaIdsFilter) query = query.in('id', villaIdsFilter);
  if (location) {
    const loc = String(location).trim().replace(/'/g, "''");
    query = query.or(`location.ilike.%${loc}%,region.ilike.%${loc}%`);
  }
  if (guests) {
    query = query.gte('max_guests', parseInt(guests, 10));
  }
  if (amenities?.length) {
    query = query.contains('amenities', amenities);
  }

  const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(50, parseInt(limit, 10));
  const { data: villas, error, count } = await query
    .range(offset, offset + Math.min(50, parseInt(limit, 10)) - 1)
    .order('name');

  if (error) throw new Error(error.message);

  let filtered = villas || [];

  if (checkIn && checkOut) {
    filtered = filtered.map((v) => {
      const pricing = (v.villa_pricing || []).filter(
        (p) => p.source_date >= checkIn && p.source_date <= checkOut
      );
      return { ...v, villa_pricing: pricing };
    });
  }

  if (minPrice != null || maxPrice != null) {
    filtered = filtered.filter((v) => {
      const prices = v.villa_pricing?.map((p) => p.sell_rate).filter(Boolean) || [];
      const total = prices.reduce((a, b) => a + b, 0);
      const avg = prices.length ? total / prices.length : null;
      if (avg == null) return true;
      if (minPrice != null && avg < parseFloat(minPrice)) return false;
      if (maxPrice != null && avg > parseFloat(maxPrice)) return false;
      return true;
    });
  }

  return {
    data: filtered.map(({ villa_pricing, ...v }) => ({ ...v, pricing: villa_pricing })),
    total: count ?? 0,
    page,
    limit,
  };
}
