import js from '@eslint/js'
import globals from 'globals'
import tseslint from './tools/lint/index.mjs'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-ssr/**',
      'coverage/**',
      '.firebase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
)
