import { build } from 'esbuild'
import { chmod, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
await build({
  absWorkingDir: root,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
})
await chmod(new URL('./dist/cli.js', import.meta.url), 0o755)
await copyFile(
  new URL('../../public/catalog.json', import.meta.url),
  new URL('./catalog.json', import.meta.url),
)
