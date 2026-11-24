import { Loader2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Notice, smallButton } from '@/components/studio/parts'
import { describeServiceError } from '@/lib/studioErrors'
import * as skillsApi from '@/services/skills'
import { SKILL_PAGE_MAX } from '@/services/skills'
import type { SkillRecord } from '@/types/skill'
import { SkillDetail } from './SkillDetail'
import { loadFriendSkills, ScreenError } from './skillActions'
import { toIndexEntry } from './skillDraft'

const PAGE = SKILL_PAGE_MAX

/**
 * One friend's friends-only skills, inside their row in Shared with me. It
 * mounts when the row opens, so a closed row reads nothing.
 */
export function FriendSkills({ uid, name }: { uid: string; name: string }) {
  const [skills, setSkills] = useState<SkillRecord[] | null>(null)
  const [refused, setRefused] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const panel = useId()

  async function load(after?: string) {
    setLoading(true)
    setError('')
    try {
      const page = await loadFriendSkills(skillsApi, uid, PAGE, after)
      setRefused((n) => n + page.refused)
      setSkills((current) =>
        after && current ? [...current, ...page.items] : page.items,
      )
      setCursor(page.cursor)
    } catch (e) {
      setError(
        e instanceof ScreenError
          ? e.message
          : describeServiceError(e, 'list', 'skill'),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // Loaded once, when the friend's row opens.
    // load reads only uid, which keys this component.
  }, [])

  const opened = skills?.find((s) => s.id === open) ?? null

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-fg">Skills</h4>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {skills && skills.length === 0 && !refused && (
        <p>{name} has not shared any skills with friends yet.</p>
      )}
      {refused > 0 && (
        <p className="text-xs text-fg-muted">
          {refused === 1 ? 'One skill was' : `${refused} skills were`} left out
          because {refused === 1 ? 'it breaks' : 'they break'} the skill rules.
        </p>
      )}
      {skills && skills.length > 0 && (
        <ul className="space-y-2">
          {skills.map((skill) => (
            <li
              key={skill.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block break-words font-medium text-fg">
                  {skill.name}
                </span>
                <span className="font-mono text-xs text-fg-muted">
                  v{skill.version}
                </span>
              </span>
              <button
                type="button"
                className={smallButton}
                aria-expanded={open === skill.id}
                aria-controls={open === skill.id ? panel : undefined}
                onClick={() => setOpen(open === skill.id ? null : skill.id)}
              >
                {open === skill.id ? 'Close' : 'Open'}
                <span className="sr-only"> {skill.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {opened && (
        <div id={panel} className="rounded-3xl bg-surface p-4">
          <SkillDetail
            key={opened.id}
            skill={toIndexEntry(opened)}
            loadFiles={() => Promise.resolve(opened.files)}
            heading="h4"
            onClose={() => setOpen(null)}
          />
        </div>
      )}
      {loading && (
        <p className="inline-flex items-center gap-2" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading skills…
        </p>
      )}
      {cursor && !loading && (
        <button
          type="button"
          className={smallButton}
          onClick={() => load(cursor)}
        >
          Show more skills
        </button>
      )}
    </div>
  )
}
