import { createClient } from '@supabase/supabase-js';

// Cliente del navegador. SOLO usa la anon key y la URL pública.
// El frontend lee de Supabase; NUNCA llama a API-Football directamente, y la
// API key de API-Football jamás llega aquí (vive como secret en Edge Functions).
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // No tiramos en build para permitir scaffolding sin secrets; avisamos en runtime.
  console.warn(
    '[supabase] Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY. Copia .env.example a .env.',
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '');
