import { createClient } from '@supabase/supabase-js';
import { config } from './index.js';

if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.warn(
    '[Supabase] URL or Service Role Key not set. Database operations will fail.'
  );
} else {
  console.log('[Supabase] Client initialized');
}

export const supabase = createClient(
  config.supabase.url || 'https://placeholder.supabase.co',
  config.supabase.serviceRoleKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
