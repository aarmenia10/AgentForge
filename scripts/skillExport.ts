import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore'
import type {
  SkillManifest,
  SkillIndex,
  SkillIndexEntry,
} from '../src/types/skill'
import {
  utf8ByteLength,
  validateSkillRecord,
  skillVersionPath,
} from '../src/lib/skillSchema'
import { agentIdSchema, versionSchema } from '../src/lib/manifestSchema'
import { unallowedFindings, type LinterAllowance } from './catalogSafety'
import type { ExportNotice } from './export-catalog'
import type { Receipt } from './catalogChanges'

export interface SkillExport {
  skillIndex: SkillIndex
  skillFiles: Map<string, SkillManifest>
}
export function emptySkillExport(): SkillExport {
  return {
    skillIndex: { skill_schema_version: 1, skills: [] },
    skillFiles: new Map(),
  }
}
export function summarizeSkill(skill: SkillManifest): SkillIndexEntry {
  return {
    ...skill,
    files: skill.files.map(({ path, kind, content }) => ({
      path,
      kind,
      bytes: utf8ByteLength(content),
    })),
  }
}

export async function readSkillExport(
  db: Firestore,
  liveChanges: Receipt[],
  pins: Receipt[],
  allow: readonly LinterAllowance[],
  log: (n: ExportNotice) => void,
  previous?: SkillExport,
): Promise<SkillExport> {
  const entries = new Map(
    previous?.skillIndex.skills.map((entry) => [entry.id, entry]),
  )
  const skillFiles = new Map(previous?.skillFiles)
  function eligible(doc: DocumentSnapshot, snapshot: boolean) {
    if (!doc.exists) return
    const parsed = validateSkillRecord(doc.data())
    if (!parsed.ok) {
      log({
        id: doc.id,
        reason: 'invalid skill',
        findings: parsed.issues.map(({ code, path }) => ({
          rule: code,
          path,
          severity: 'block',
        })),
      })
      return
    }
    const { owner_uid, review_status, ...manifest } = parsed.value
    delete manifest.saved_from_chat
    if (
      manifest.author.uid !== owner_uid ||
      doc.id !== (snapshot ? manifest.id + '@' + manifest.version : manifest.id)
    ) {
      log({ id: doc.id, reason: 'skill identity mismatch' })
      return
    }
    const findings = unallowedFindings(manifest, allow)
    if (findings.length)
      log({
        id: doc.id,
        reason: 'skill findings',
        findings: findings.map(({ rule, path, severity }) => ({
          rule,
          path,
          severity,
        })),
      })
    if (
      manifest.visibility === 'public' &&
      review_status === 'approved' &&
      !findings.some((f) => f.severity === 'block')
    )
      return manifest
  }
  function remove(id: string) {
    entries.delete(id)
    for (const path of skillFiles.keys())
      if (path.startsWith('skills/' + id + '/')) skillFiles.delete(path)
  }
  function putVersion(doc: DocumentSnapshot) {
    const skill = eligible(doc, true)
    if (skill && entries.get(skill.id)?.author.uid === skill.author.uid)
      skillFiles.set(skillVersionPath(skill.id, skill.version), skill)
  }
  const live = db.collection('skills')
  const history = db.collection('skill_versions')
  if (!previous) {
    const [current, versions] = await Promise.all([
      live
        .where('visibility', '==', 'public')
        .where('review_status', '==', 'approved')
        .get(),
      history.get(),
    ])
    for (const doc of current.docs) {
      const skill = eligible(doc, false)
      if (skill) entries.set(skill.id, summarizeSkill(skill))
    }
    versions.docs.forEach(putVersion)
  } else {
    const changedIds = new Set(liveChanges.map((change) => change.id))
    const changedPins = []
    for (const change of pins) {
      const [id, version, ...extra] = change.id.split('@')
      if (
        extra.length ||
        !agentIdSchema.safeParse(id).success ||
        !versionSchema.safeParse(version).success
      ) {
        log({ id: change.id, reason: 'invalid skill snapshot id' })
        continue
      }
      changedPins.push({ id, version, key: change.id })
      // A repaired current pin can restore a previously excluded skill.
      if (!entries.has(id)) changedIds.add(id)
    }
    const refreshed = new Set<string>()
    for (const id of changedIds) {
      const before = entries.get(id)
      const skill = eligible(await live.doc(id).get(), false)
      if (!skill) remove(id)
      else if (!before || before.author.uid !== skill.author.uid) {
        remove(id)
        entries.set(id, summarizeSkill(skill))
        const versions = await history.where('id', '==', id).get()
        versions.docs.forEach(putVersion)
        refreshed.add(id)
      } else entries.set(id, summarizeSkill(skill))
    }
    for (const { id, version, key } of changedPins) {
      if (!entries.has(id) || refreshed.has(id)) continue
      skillFiles.delete(skillVersionPath(id, version))
      putVersion(await history.doc(key).get())
    }
  }
  for (const entry of entries.values()) {
    if (!skillFiles.has(skillVersionPath(entry.id, entry.version))) {
      log({ id: entry.id, reason: 'missing eligible current skill snapshot' })
      remove(entry.id)
    }
  }
  return {
    skillIndex: {
      skill_schema_version: 1,
      skills: [...entries.values()].sort((a, b) =>
        a.id.localeCompare(b.id, 'en'),
      ),
    },
    skillFiles,
  }
}
