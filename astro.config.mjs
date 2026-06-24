import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';

// Despliegue: Vercel. Salida estática por defecto; las rutas con
// `prerender = false` (p.ej. /match/[id]) se sirven on-demand vía el adapter.
export default defineConfig({
  adapter: vercel(),
  integrations: [react(), tailwind()],
  vite: {
    // Las claves de servicio NUNCA llegan al cliente: solo se exponen las
    // variables PUBLIC_* (anon key + url). Ver src/lib/supabase.ts.
    envPrefix: ['PUBLIC_'],
  },
});
