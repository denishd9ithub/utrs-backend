/**
 * On app startup: ensure default admin exists
 * Creates utrsadmin@yopmail.com / admin@123 if not found
 */
const ADMIN_EMAIL = 'utrsadmin@yopmail.com';
const ADMIN_PASSWORD = 'admin@123';

export async function ensureDefaultAdmin(supabase) {
  if (!supabase) return;

  try {
    const { data } = await supabase.auth.admin.listUsers();
    const found = data?.users?.find((u) => u.email === ADMIN_EMAIL);

    if (found) {
      await supabase.auth.admin.updateUserById(found.id, { app_metadata: { role: 'admin' } });
      return;
    }

    const { error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      app_metadata: { role: 'admin' },
    });

    if (error) {
      console.warn('[Admin] Could not create default admin:', error.message);
      return;
    }
    console.log('[Admin] Default admin created:', ADMIN_EMAIL);
  } catch (e) {
    console.warn('[Admin] Ensure admin failed:', e.message);
  }
}
