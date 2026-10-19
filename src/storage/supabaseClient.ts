import { createClient } from '@supabase/supabase-js';

// Read from Vite env vars (create a .env.local in the project root):
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[NohomeWork] Supabase is not configured. Add VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY to .env.local to enable cloud sync. ' +
      'The app will keep working in local-only mode.'
  );
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);