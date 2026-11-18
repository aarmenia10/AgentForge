/**
 * Everything a reviewer should see about one skill record: every linter
 * finding and every skill-rule problem, grouped by what they are about.
 * Pure, so tests import it directly.
 */
import { lintSkill, type LintFinding } from '@/lib/safetyLinter'
import { validateSkillRecord, type SkillIssue } from '@/lib/skillSchema'
import type { SkillRecord } from '@/types/skill'

export interface ReviewFindings {
  findings: LintFinding[]
  /** Skill-rule problems from validateSkillRecord. Empty for a valid record. */
  issues: SkillIssue[]
  blocks: number
  warns: number
  /** Findings and issues about a field (`name`) or a file (`files["a.md"]`). */
  byField(key: string): { findings: LintFinding[]; issues: SkillIssue[] }
}

function belongsTo(path: string, key: string): boolean {
  return (
    path === key || path.startsWith(`${key}.`) || path.startsWith(`${key}[`)
  )
}

export function reviewFindings(record: SkillRecord): ReviewFindings {
  let findings: LintFinding[]
  try {
    findings = lintSkill(record).findings
  } catch {
    findings = []
  }
  const validation = validateSkillRecord(record)
  const issues = validation.ok ? [] : validation.issues
  const blocks = findings.filter((f) => f.severity === 'block').length
  return {
    findings,
    issues,
    blocks,
    warns: findings.length - blocks,
    byField: (key) => ({
      findings: findings.filter((f) => belongsTo(f.path, key)),
      issues: issues.filter((i) => belongsTo(i.path, key)),
    }),
  }
}
