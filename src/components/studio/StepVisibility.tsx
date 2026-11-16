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
        <legend className="mb-3 block text-sm font-medium text-slate-800 dark:text-slate-100">
          Who can see this agent?
        </legend>
        <div className="space-y-2">
          {VISIBILITY_CHOICES.map(({ value, label, line, icon: Icon }) => (
            <label
              key={value}
              className="flex cursor-pointer gap-3 rounded-xl border border-slate-300 p-3 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-500/10 dark:border-white/15 dark:has-[:checked]:border-teal-400"
            >
              <input
                type="radio"
                name="studio-visibility"
                value={value}
                checked={draft.visibility === value}
                onChange={() => update({ visibility: value })}
                className="mt-1 size-4 accent-teal-700 dark:accent-teal-400"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
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
        <p className="text-xs text-slate-600 dark:text-slate-400">
          For now, private and friends agents are used from this website: open
          one and copy its prompt. The install command works for public agents.
        </p>
      )}
    </div>
  )
}
