import { Globe, Lock, Users } from 'lucide-react'
import type { AgentManifest } from '@/types/agent'
import type { StepProps } from './context'
import { Notice } from './parts'

export const VISIBILITY_CHOICES: {
  value: AgentManifest['visibility']
  label: string
  line: string
  icon: typeof Lock
}[] = [
  {
    value: 'private',
    label: 'Private',
    line: 'Only you can see it. Saved right away.',
    icon: Lock,
  },
  {
    value: 'friends',
    label: 'Friends',
    line: 'You and your accepted friends can see it, right away.',
    icon: Users,
  },
  {
    value: 'public',
    label: 'Public',
    line: 'Everyone can find and install it. Reviewed by a person first, then appears within about an hour.',
    icon: Globe,
  },
]

export function StepVisibility({
  draft,
  update,
  notes,
  liveIsPublic,
}: StepProps & { liveIsPublic: boolean }) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-3 block text-sm font-medium text-fg">
          Who can see this agent?
        </legend>
        <div className="space-y-2">
          {VISIBILITY_CHOICES.map(({ value, label, line, icon: Icon }) => (
            <label
              key={value}
              className="flex cursor-pointer gap-3 rounded-3xl border border-line bg-surface p-4 has-[:checked]:border-accent-fg has-[:checked]:bg-accent/10"
            >
              <input
                type="radio"
                name="studio-visibility"
                value={value}
                checked={draft.visibility === value}
                onChange={() => update({ visibility: value })}
                className="mt-1 size-4 accent-[var(--lm-accent)]"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </span>
                <span className="block text-sm">{line}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {notes('visibility')}
      {liveIsPublic && draft.visibility !== 'public' && (
        <Notice tone="warn">
          This agent is in the public catalog now. Saving it as{' '}
          {draft.visibility === 'private' ? 'private' : 'friends only'} takes it
          out of the catalog on the next refresh, within about an hour.
        </Notice>
      )}
      {draft.visibility !== 'public' && (
        <p className="text-xs text-fg-muted">
          For now, private and friends agents are used from this website: open
          one and copy its prompt. The install command works for public agents.
        </p>
      )}
    </div>
  )
}
