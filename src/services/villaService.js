import { supabase } from '../config/supabase.js';

export async function listVillas({ location, guests, page = 1, limit = 20 } = {}) {
  let query = supabase
    .from('villas')
    .select('id, slug, name, location, region, max_guests, amenities, images, tags', { count: 'exact' })
    .eq('is_active', true)
    .eq('is_hidden', false);

  if (location) {
    query = query.ilike('location', `%${location}%`);
  }
  if (guests) {
    query = query.gte('max_guests', parseInt(guests, 10));
  }

  const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(50, parseInt(limit, 10));
  const { data, error, count } = await query
    .range(offset, offset + Math.min(50, parseInt(limit, 10)) - 1)
    .order('name');

  if (error) throw new Error(error.message);
  return { data, total: count ?? 0, page, limit };
}

export async function getVillaById(id) {
  const { data, error } = await supabase
    .from('villas')
    .select(`
      *,
      villa_sources (
        partners (code, name),
        external_id,
        net_rate,
        is_winning_source
      )
    `)
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data;
}

export async function getVillaBySlug(slug) {
  const { data, error } = await supabase
    .from('villas')
    .select(`
      *,
      villa_sources (
        partners (code, name),
        external_id,
        net_rate,
        is_winning_source
      )
    `)
    .eq('slug', slug)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data;
}

export async function createVilla(villa) {
  const { data, error } = await supabase
    .from('villas')
    .insert(villa)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateVilla(id, updates, respectLock = true) {
  const existing = await getVillaById(id);
  if (!existing) return null;

  const locked = (existing.locked_fields || []);
  const filtered = respectLock
    ? Object.fromEntries(Object.entries(updates).filter(([k]) => !locked.includes(k)))
    : updates;

  if (Object.keys(filtered).length === 0) return existing;

  const { data, error } = await supabase
    .from('villas')
    .update(filtered)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function lockVillaFields(id, fields) {
  const { data, error } = await supabase
    .from('villas')
    .update({ is_locked: true, locked_fields: fields })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
