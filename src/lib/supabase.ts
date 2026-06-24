import { createClient } from '@supabase/supabase-js';

// Cliente del navegador. SOLO usa la anon key y la URL pública.
// El frontend lee de Supabase; NUNCA llama a API-Football directamente, y la
// API key de API-Football jamás llega aquí (vive como secret en Edge Functions).
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // No tiramos en build para permitir scaffolding sin secrets; avisamos en runtime.
  console.warn(
    '[supabase] Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY. Modo demo activo.',
  );
}

// Placeholders VÁLIDOS cuando no hay config: createClient lanza si la URL está
// vacía. En modo demo el cliente nunca se usa (queries.ts comprueba isConfigured
// antes de tocarlo), así que estos valores no llegan a hacer ninguna petición.
export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'demo-anon-placeholder-key',
);
