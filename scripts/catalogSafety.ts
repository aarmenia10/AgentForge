// Node-only exporter boundary. Never import this module from src/.
import { createHash } from 'node:crypto'
import type { SkillManifest } from '../src/types/skill'
import { lintManifest, lintSkill } from '../src/lib/safetyLinter'
import type { AgentManifest } from '../src/types/agent'
import type { LintFinding } from '../src/lib/safetyLinter'

export interface LinterAllowance {
  kind?: 'skill' | 'agent'
  agent_id: string
  version: string
  rule: string
  path: string
  sha256: string
}
export function parseAllowlist(value: unknown): LinterAllowance[] {
  if (!Array.isArray(value)) throw new Error('Invalid safety allowlist')
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Object.keys(entry).sort().join(',') !==
        (entry.kind === undefined
          ? 'agent_id,path,rule,sha256,version'
          : 'agent_id,kind,path,rule,sha256,version') ||
      (entry.kind !== undefined && !['agent', 'skill'].includes(entry.kind)) ||
      !['agent_id', 'version', 'rule', 'path', 'sha256'].every(
        (k) => typeof entry[k] === 'string',
      ) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error('Invalid safety allowance')
  }
  return value
}
export function fieldText(
  manifest: AgentManifest | SkillManifest,
  path: string,
): string | null {
  const tokens: string[] = []
  const pattern = /(?:^|\.)([a-zA-Z_$][\w$]*)|\[(\d+|"(?:[^"\\]|\\.)*")\]/g
  let end = 0
  for (const match of path.matchAll(pattern)) {
    if (match.index !== end) return null
    tokens.push(
      match[1] ?? (match[2].startsWith('"') ? JSON.parse(match[2]) : match[2]),
    )
    end = match.index! + match[0].length
  }
  if (end !== path.length) return null
  if (
    'files' in manifest &&
    tokens[0] === 'files' &&
    tokens[2] === 'content' &&
    tokens.length === 3
  )
    return manifest.files.find((f) => f.path === tokens[1])?.content ?? null
  let value: unknown = manifest
  for (const token of tokens) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, token))
      return null
    value = (value as Record<string, unknown>)[token]
  }
  // SL-15 also points at a schema property name (whose value is a schema).
  return typeof value === 'string'
    ? value
    : path.includes('.properties')
      ? tokens.at(-1)!
      : null
}
export function unallowedFindings(
  manifest: AgentManifest | SkillManifest,
  allow: readonly LinterAllowance[],
): LintFinding[] {
  const skill = 'skill_schema_version' in manifest
  const result = skill ? lintSkill(manifest) : lintManifest(manifest)
  return result.findings.filter((f) => {
    if (f.rule === 'SK-01' || !allow.length) return true
    const field = fieldText(manifest, f.path)
    if (field === null) return true
    const hash = createHash('sha256').update(field, 'utf8').digest('hex')
    return !allow.some(
      (a) =>
        (a.kind ?? 'agent') === (skill ? 'skill' : 'agent') &&
        a.agent_id === manifest.id &&
        a.version === manifest.version &&
        a.rule === f.rule &&
        a.path === f.path &&
        a.sha256 === hash,
    )
  })
}
