import { build } from 'esbuild'
import { chmod, copyFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const { dependencies } = JSON.parse(
  await readFile(new URL('./package.json', import.meta.url), 'utf8'),
)
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  metafile: true,
  banner: { js: '#!/usr/bin/env node' },
})
// Local shared modules are bundled; only declared npm dependencies and Node
// builtins may remain as runtime imports. Never ship a reference to the web app.
for (const output of Object.values(result.metafile.outputs)) {
  for (const imported of output.imports) {
    if (
      imported.external &&
      !imported.path.startsWith('node:') &&
      !Object.keys(dependencies).some(
        (name) =>
          imported.path === name || imported.path.startsWith(`${name}/`),
      )
    ) {
      throw new Error(`Undeclared runtime import: ${imported.path}`)
    }
  }
}
if (
  !Object.keys(result.metafile.inputs).some((path) =>
    path.endsWith('/src/lib/validateManifest.ts'),
  )
) {
  throw new Error('The shared manifest validator must be bundled into dist/')
}
await chmod(new URL('./dist/cli.js', import.meta.url), 0o755)
await copyFile(
  new URL('../../public/catalog.json', import.meta.url),
  new URL('./catalog.json', import.meta.url),
)
