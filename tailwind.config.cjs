/** @type {import('tailwindcss').Config} */
// Dirección visual: terminal de trading. Fondo profundo casi-negro, acentos
// de datos (verde alza / rojo baja / ámbar alerta), tipografía mono para cifras.
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0a0e14',       // fondo base
          panel: '#0f141c',    // paneles
          border: '#1c2533',   // bordes sutiles
          muted: '#5b6b7f',    // texto secundario
          text: '#cdd6e4',     // texto principal
        },
        signal: {
          up: '#22c55e',       // alza / value positivo
          down: '#ef4444',     // baja / value negativo
          warn: '#f59e0b',     // alerta / cuota baja
          info: '#38bdf8',     // info / neutral
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
