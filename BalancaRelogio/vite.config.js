// Configuração do Vite (servidor de desenvolvimento e build) e do Vitest (testes).
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Versão do package.json e hora do build: aparecem no app para saber qual versão está instalada.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  // Plugin oficial do React: JSX + Fast Refresh no modo dev.
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
    'import.meta.env.VITE_APP_BUILD': JSON.stringify(new Date().toISOString()),
  },
  css: {
    modules: {
      // Classes "kebab-case" no CSS viram camelCase no JSX (ex.: .nav-button → styles.navButton).
      localsConvention: 'camelCaseOnly',
    },
  },
  test: {
    // Os testes cobrem só lógica pura (parser, fórmulas, sessão, relatório), sem DOM.
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
