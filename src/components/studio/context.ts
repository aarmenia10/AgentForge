import type { ReactNode } from 'react'
import type { LintFinding } from '@/lib/safetyLinter'
import type { Problem, StudioDraft } from '@/lib/studioManifest'

/** What every Studio step receives from the Studio. */
export interface StepProps {
  draft: StudioDraft
  update: (patch: Partial<StudioDraft>) => void
  /** Marks a manifest path as visited, so its problems start to show. */
  touch: (path: string) => void
  /** Problems and findings at exactly this manifest path, ready to render. */
  notes: (path: string) => ReactNode
  /** Raw access for the field builder, which matches findings by field name. */
  problemsWithin: (path: string) => Problem[]
  findingsWithin: (path: string) => LintFinding[]
  editing: boolean
}
