import { supabase } from '../config/supabase.js';

/**
 * Create a guest record
 */
export async function createGuest({ name, email, phone, birthDate, address, userId = null }) {
  if (!name && !email) {
    throw new Error('At least name or email required');
  }
  const { data, error } = await supabase
    .from('guests')
    .insert({
      name: name || 'Guest',
      email: email || null,
      phone: phone || null,
      birth_date: birthDate || null,
      address: address || null,
      user_id: userId || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Find guest by user_id. Returns first match if multiple exist (handles data inconsistency).
 */
export async function getGuestByUserId(userId) {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

/**
 * Find or create guest for logged-in user. Uses profile + auth user data.
 */
export async function findOrCreateGuestForUser(user) {
  if (!user?.id) return null;

  const existing = await getGuestByUserId(user.id);
  if (existing) return existing;

  const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'Guest';
  const email = user.email || null;

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  const profileName = profile?.full_name;

  return createGuest({
    name: profileName || name,
    email,
    phone: user.user_metadata?.phone || null,
    userId: user.id,
  });
}

/**
 * Get guest by id
 */
export async function getGuest(id) {
  const { data, error } = await supabase.from('guests').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data;
}
