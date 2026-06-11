import { createClient } from '@supabase/supabase-js';

// Single browser Supabase client, lifted from poc. createClient persists the
// session to localStorage by default, which is what we want for a plain SPA.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
