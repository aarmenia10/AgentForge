import { lintSkill } from '../lib/safetyLinter'
import type { CouncilManifest } from '../types/council'

export function lintCouncil(council: CouncilManifest) {
  const result = lintSkill({
    ...council,
    files: [
      {
        path: 'instructions',
        content: council.instructions,
        kind: 'reference',
      },
      ...council.members.map(({ role }, index) => ({
        path: 'members[' + index + '].role',
        content: role,
        kind: 'reference' as const,
      })),
    ],
  })
  for (const finding of result.findings) {
    const match = /^files\[("(?:[^"\\]|\\.)*")\]\.content$/.exec(finding.path)
    if (match) finding.path = JSON.parse(match[1]) as string
  }
  return result
}
