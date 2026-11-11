import { mkdir, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { validateCatalog, validateManifest } from '../src/lib/validateManifest'
import type { AgentManifest } from '../src/types/agent'

export function mergeCatalog(
  seeds: readonly AgentManifest[],
  live: unknown[],
): AgentManifest[] {
  const records = new Map(
    validateCatalog([...seeds])
      .filter((a) => a.author.verified)
      .map((a) => [a.id, a]),
  )
  // Validate even records that will be excluded. Invalid live data must not silently ship.
  for (const agent of validateCatalog(live)) {
    if (agent.author.verified) records.set(agent.id, agent)
    else records.delete(agent.id) // A revoked verification must also suppress the seed.
  }
  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))
}

async function readLiveRecords(): Promise<AgentManifest[]> {
  if (process.env.AGENTFORGE_CATALOG_SOURCE === 'seed') return []
  const { applicationDefault, initializeApp, deleteApp } =
    await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  const explicit = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    emulator ||
    process.env.AGENTFORGE_CATALOG_SOURCE === 'firestore',
  )
  const credential = applicationDefault()
  if (!emulator) {
    try {
      await credential.getAccessToken()
    } catch (error) {
      if (explicit)
        throw new Error('Configured Firestore credentials are unavailable', {
          cause: error,
        })
      console.error(
        'No Application Default Credentials found; exporting verified seeds only.',
      )
      return []
    }
  }
  const app = initializeApp(
    {
      credential,
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    },
    'catalog-export',
  )
  try {
    const snapshot = await getFirestore(app).collection('agents').get()
    return snapshot.docs.map((doc) => {
      const agent = validateManifest(doc.data())
      if (agent.id !== doc.id)
        throw new Error(`Firestore document id mismatch: ${doc.id}`)
      return agent
    })
  } finally {
    await deleteApp(app)
  }
}

export async function exportCatalog() {
  const catalog = mergeCatalog(SEED_AGENTS, await readLiveRecords())
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
  await mkdir(publicDir, { recursive: true })
  const output = resolve(publicDir, 'catalog.json')
  const temporary = `${output}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  await rename(temporary, output)
  console.error(
    `Exported ${catalog.length} verified agents to public/catalog.json`,
  )
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  exportCatalog().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
