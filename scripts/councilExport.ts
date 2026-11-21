import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore'
import { agentIdSchema, versionSchema } from '../src/lib/manifestSchema'
import {
  councilManifestSchema,
  councilVersionPath,
  validateCouncilRecord,
} from '../src/lib/councilSchema'
import { skillVersionPath, utf8ByteLength } from '../src/lib/skillSchema'
import { lintCouncil } from '../src/services/councilSafety'
import type {
  CouncilIndex,
  CouncilIndexEntry,
  CouncilManifest,
} from '../src/types/council'
import type { ItemRef } from '../src/types/skill'
import type { Receipt } from './catalogChanges'
import type { ExportNotice, PublicExport } from './export-catalog'

export interface CouncilExport {
  councilIndex: CouncilIndex
  councilFiles: Map<string, CouncilManifest>
}
type Inventory = Pick<
  PublicExport,
  'catalog' | 'files' | 'skillIndex' | 'skillFiles'
>

export function emptyCouncilExport(): CouncilExport {
  return {
    councilIndex: { council_schema_version: 1, councils: [] },
    councilFiles: new Map(),
  }
}

export function memberIsPublished({
  catalog,
  files,
  skillIndex,
  skillFiles,
}: Inventory) {
  const agents = new Map(catalog.map(({ id, author }) => [id, author.uid]))
  const skills = new Map(
    skillIndex.skills.map(({ id, author }) => [id, author.uid]),
  )
  return ({ kind, id, version }: ItemRef) => {
    const owner = (kind === 'agent' ? agents : skills).get(id)
    const member =
      kind === 'agent'
        ? files.get(id + '/' + version + '.json')
        : skillFiles.get(skillVersionPath(id, version))
    return (
      !!member && member.author.uid === owner && member.visibility === 'public'
    )
  }
}

function inventoryChanged(next: Inventory, previous: Inventory) {
  const changed = (
    a: ReadonlyMap<string, { author: { uid: string } }>,
    b: typeof a,
  ) =>
    a.size !== b.size ||
    [...a].some(([key, item]) => item.author.uid !== b.get(key)?.author.uid)
  return (
    changed(next.files, previous.files) ||
    changed(next.skillFiles, previous.skillFiles)
  )
}

function summarize({
  instructions,
  ...council
}: CouncilManifest): CouncilIndexEntry {
  return {
    ...council,
    instructions_bytes: utf8ByteLength(instructions),
    member_count: council.members.length,
  }
}

export async function readCouncilExport(
  db: Firestore,
  inventory: Inventory,
  changes: Receipt[],
  pins: Receipt[],
  log: (notice: ExportNotice) => void,
  checkpoint?: PublicExport,
): Promise<CouncilExport> {
  // A withdrawn pin removes dependent councils, including historical versions.
  // A restored pin can revive councils absent from the public-only checkpoint.
  const previous =
    checkpoint && !inventoryChanged(inventory, checkpoint)
      ? checkpoint
      : undefined
  const entries = new Map(
    previous?.councilIndex.councils.map((entry) => [entry.id, entry]),
  )
  const councilFiles = new Map(previous?.councilFiles)
  const isMemberApproved = memberIsPublished(inventory)
  const live = db.collection('councils')
  const history = db.collection('council_versions')
  function eligible(doc: DocumentSnapshot, snapshot: boolean) {
    if (!doc.exists) return
    const parsed = validateCouncilRecord(doc.data(), { isMemberApproved })
    if (!parsed.ok) {
      log({
        id: doc.id,
        reason: 'invalid or unavailable council',
        findings: parsed.issues.map(({ code, path }) => ({
          rule: code,
          path,
          severity: 'block',
        })),
      })
      return
    }
    const { owner_uid, review_status } = parsed.value
    const manifest = councilManifestSchema.strip().parse(parsed.value)
    if (manifest.visibility !== 'public' || review_status !== 'approved') return
    if (
      owner_uid !== manifest.author.uid ||
      doc.id !== (snapshot ? manifest.id + '@' + manifest.version : manifest.id)
    )
      return
    const { findings } = lintCouncil(manifest)
    if (findings.length)
      log({
        id: doc.id,
        reason: 'council findings',
        findings: findings.map(({ rule, path, severity }) => ({
          rule,
          path,
          severity,
        })),
      })
    if (!findings.some((finding) => finding.severity === 'block'))
      return manifest
  }
  function remove(id: string) {
    entries.delete(id)
    for (const path of councilFiles.keys())
      if (path.startsWith('councils/' + id + '/')) councilFiles.delete(path)
  }
  function putPin(doc: DocumentSnapshot) {
    const council = eligible(doc, true)
    if (council && entries.get(council.id)?.author.uid === council.author.uid)
      councilFiles.set(councilVersionPath(council.id, council.version), council)
  }
  if (!previous) {
    const [current, versions] = await Promise.all([
      live
        .where('visibility', '==', 'public')
        .where('review_status', '==', 'approved')
        .get(),
      history.get(),
    ])
    for (const doc of current.docs) {
      const council = eligible(doc, false)
      if (council) entries.set(council.id, summarize(council))
    }
    versions.docs.forEach(putPin)
  } else {
    const ids = new Set(changes.map(({ id }) => id))
    const changedPins = pins.flatMap(({ id: key }) => {
      const [id, version, ...extra] = key.split('@')
      if (
        extra.length ||
        !agentIdSchema.safeParse(id).success ||
        !versionSchema.safeParse(version).success
      )
        return []
      if (!entries.has(id)) ids.add(id)
      return [{ id, version, key }]
    })
    const refreshed = new Set<string>()
    for (const id of ids) {
      const before = entries.get(id)
      const council = eligible(await live.doc(id).get(), false)
      if (!council) remove(id)
      else {
        if (before?.author.uid !== council.author.uid) remove(id)
        entries.set(id, summarize(council))
        if (before?.author.uid !== council.author.uid) {
          const versions = await history.where('id', '==', id).get()
          versions.docs.forEach(putPin)
          refreshed.add(id)
        }
      }
    }
    for (const { id, version, key } of changedPins) {
      if (!entries.has(id) || refreshed.has(id)) continue
      councilFiles.delete(councilVersionPath(id, version))
      putPin(await history.doc(key).get())
    }
  }
  for (const entry of entries.values()) {
    if (!councilFiles.has(councilVersionPath(entry.id, entry.version))) {
      log({ id: entry.id, reason: 'missing eligible current council snapshot' })
      remove(entry.id)
    }
  }
  return {
    councilIndex: {
      council_schema_version: 1,
      councils: [...entries.values()].sort((a, b) =>
        a.id.localeCompare(b.id, 'en'),
      ),
    },
    councilFiles,
  }
}
