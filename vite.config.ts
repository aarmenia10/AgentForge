import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { defaultTokenSets } from './src/theme/appearance'

/**
 * Puts the default color variables into the pre-paint script in index.html,
 * computed by the same module the app uses, so the two cannot drift apart.
 */
function appearanceDefaults(): Plugin {
  return {
    name: 'appearance-defaults',
    transformIndexHtml: (html) =>
      html.replace(
        '/*__APPEARANCE_DEFAULTS__*/ null',
        JSON.stringify(defaultTokenSets()),
      ),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), appearanceDefaults()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
