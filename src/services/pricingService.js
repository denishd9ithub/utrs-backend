import { supabase } from '../config/supabase.js';
import { getMarkupForPartner } from './partnerService.js';

/**
 * Margin Engine: Net Rate + Markup -> Sell Rate
 * Safety: If Sell Rate < Net Rate => hide/flag
 */
export async function getVillaPricing(villaId, { checkIn, checkOut } = {}) {
  let query = supabase
    .from('villa_pricing')
    .select('*')
    .eq('villa_id', villaId)
    .eq('is_safe', true);

  if (checkIn) query = query.gte('source_date', checkIn);
  if (checkOut) query = query.lte('source_date', checkOut);

  const { data, error } = await query.order('source_date');

  if (error) throw new Error(error.message);
  return data;
}

export async function getFlaggedPricing() {
  const { data, error } = await supabase
    .from('villa_pricing')
    .select(`
      *,
      villas (id, name, slug)
    `)
    .eq('is_safe', false)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function upsertPricing(villaId, partnerId, rows) {
  const markup = await getMarkupForPartner(partnerId);
  const toInsert = rows.map(({ date, netRate }) => {
    const sellRate = Number((netRate * (1 + markup / 100)).toFixed(2));
    const isSafe = sellRate >= netRate;
    return {
      villa_id: villaId,
      partner_id: partnerId,
      source_date: date,
      net_rate: netRate,
      markup_percent: markup,
      sell_rate: sellRate,
      is_safe: isSafe,
      flag_reason: isSafe ? null : 'Sell rate < Net rate',
    };
  });

  const { data, error } = await supabase
    .from('villa_pricing')
    .upsert(toInsert, { onConflict: 'villa_id,source_date' })
    .select();

  if (error) throw new Error(error.message);
  return data;
}

export function computeSellRate(netRate, markupPercent) {
  const sell = Number((netRate * (1 + markupPercent / 100)).toFixed(2));
  return { sellRate: sell, isSafe: sell >= netRate };
}
