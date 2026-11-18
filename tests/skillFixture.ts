import type { SkillManifest } from '../src/types/skill'

export const SKILL_MD = `---
name: pdf-forms
description: Fill in PDF forms from structured data.
---

# PDF forms

Read references/fields.md before filling a form.
`

export function skill(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    skill_schema_version: 1,
    visibility: 'public',
    id: 'pdf-forms',
    version: '1.0.0',
    name: 'pdf-forms',
    description: 'Fill in PDF forms from structured data.',
    author: { uid: 'u1', name: 'Ada', handle: 'ada', verified: false },
    tags: ['documents'],
    files: [
      { path: 'SKILL.md', kind: 'instructions', content: SKILL_MD },
      {
        path: 'references/fields.md',
        kind: 'reference',
        content: '# Fields\n',
      },
    ],
    stats: { updated_at: '2026-11-18T00:00:00Z' },
    ...overrides,
  }
}
