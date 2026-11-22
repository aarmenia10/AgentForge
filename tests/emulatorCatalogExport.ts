import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function createEmulatorCatalogExport(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'emulator-catalog-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

  return {
    directory,
    run: () =>
      execFileAsync(
        process.execPath,
        ['--import', 'tsx', 'scripts/export-catalog.ts'],
        {
          env: {
            ...process.env,
            AGENTLEMON_CATALOG_SOURCE: 'firestore',
            AGENTLEMON_CATALOG_OUTPUT_DIR: directory,
            GOOGLE_CLOUD_PROJECT: 'demo-agentlemon',
            CATALOG_CHECKPOINT: undefined,
            CATALOG_RECEIPTS: undefined,
          },
        },
      ),
  }
}
