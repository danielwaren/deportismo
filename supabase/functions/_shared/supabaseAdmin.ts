import { createClient } from 'jsr:@supabase/supabase-js@2';

// Cliente con SERVICE ROLE. Solo existe dentro de Edge Functions (Deno) y
// bypassea RLS. SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta el runtime
// de Supabase automáticamente; nunca se exponen al frontend.
export const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);
