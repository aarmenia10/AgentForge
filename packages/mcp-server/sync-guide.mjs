// Regenerates src/guide.ts from docs/AI_GUIDE.md, the canonical text.
// Run after editing the guide: node packages/mcp-server/sync-guide.mjs
// tests/guide.test.ts fails when the two drift apart.
import { readFile, writeFile } from 'node:fs/promises'

const source = new URL('../../docs/AI_GUIDE.md', import.meta.url)
const target = new URL('./src/guide.ts', import.meta.url)
const marker = '// --- generated below this line by sync-guide.mjs ---'

const guide = (await readFile(source, 'utf8')).trimEnd()
const current = await readFile(target, 'utf8')
const head = current.slice(0, current.indexOf(marker) + marker.length)
const lines = guide.split('\n').map((line) => `  ${JSON.stringify(line)},`)
await writeFile(
  target,
  `${head}\nexport const REGISTRY_GUIDE: string = [\n${lines.join('\n')}\n].join('\\n')\n`,
)
console.log(`guide.ts updated from docs/AI_GUIDE.md (${lines.length} lines)`)
