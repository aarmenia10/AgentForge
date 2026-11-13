import { mkdir, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { SEED_AGENTS } from '../src/data/seedAgents'
import {
  validateCatalog,
  validateManifest,
  validateAgentRecord,
  manifestSchema,
} from '../src/lib/validateManifest'
import type { AgentManifest, AgentRecord } from '../src/types/agent'

export function mergeCatalog(
  seeds: readonly AgentManifest[],
  live: unknown[],
): AgentManifest[] {
  // Seeds are maintainer-approved manifests; live documents carry explicit review metadata.
  const records = new Map(
    validateCatalog(
      seeds
        .map(validateManifest)
        .filter((agent) => agent.visibility === 'public'),
    ).map((agent) => [agent.id, agent]),
  )
  const ids = new Set<string>()
  // Validate excluded documents too: malformed live data fails the build.
  for (const value of live) {
    const record = validateAgentRecord(value)
    if (ids.has(record.id)) throw new Error('Duplicate live id: ' + record.id)
    ids.add(record.id)
    if (record.visibility === 'public' && record.review_status === 'approved') {
      records.set(record.id, manifestSchema.strip().parse(record))
    } else {
      // A privacy or review change must also suppress a seed with the same id.
      records.delete(record.id)
    }
  }
  return validateCatalog([...records.values()]).sort((a, b) =>
    a.id.localeCompare(b.id, 'en'),
  )
}

async function readLiveRecords(): Promise<AgentRecord[]> {
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
        'No Application Default Credentials found; exporting approved public seeds only.',
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
      const agent = validateAgentRecord(doc.data())
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
    `Exported ${catalog.length} approved public agents to public/catalog.json`,
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
