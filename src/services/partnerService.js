import { supabase } from '../config/supabase.js';

export async function listPartners() {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('is_active', true)
    .order('code');

  if (error) throw new Error(error.message);
  return data;
}

export async function getPartner(id) {
  const { data, error } = await supabase
    .from('partners')
    .select('*, markup_rules(*)')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getPartnerByCode(code) {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('code', code)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data;
}

export async function getMarkupForPartner(partnerId, netRate = null) {
  const partner = await getPartner(partnerId);
  if (!partner) return 15; // fallback global

  const { data: partnerRules } = await supabase
    .from('markup_rules')
    .select('markup_percent')
    .eq('is_active', true)
    .eq('rule_type', 'partner')
    .eq('partner_id', partnerId)
    .limit(1);

  if (partnerRules?.[0]) return partnerRules[0].markup_percent;

  const { data: globalRules } = await supabase
    .from('markup_rules')
    .select('*')
    .eq('is_active', true)
    .eq('rule_type', 'global');

  for (const rule of globalRules || []) {
    if (netRate != null) {
      if (rule.min_price != null && netRate < rule.min_price) continue;
      if (rule.max_price != null && netRate > rule.max_price) continue;
    }
    return rule.markup_percent;
  }
  return partner.markup_percent ?? 15;
}
