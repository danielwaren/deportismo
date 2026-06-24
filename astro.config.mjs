import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// Despliegue objetivo: Vercel (frontend). La arquitectura es compatible; el
// adapter se añade en la fase de despliegue. Por ahora salida estática/SSR-ready.
export default defineConfig({
  integrations: [react(), tailwind()],
  vite: {
    // Las claves de servicio NUNCA llegan al cliente: solo se exponen las
    // variables PUBLIC_* (anon key + url). Ver src/lib/supabase.ts.
    envPrefix: ['PUBLIC_'],
  },
});
