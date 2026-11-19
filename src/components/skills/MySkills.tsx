import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import {
  Notice,
  smallButton,
  StatusText,
  textLink,
  VisibilityLabel,
} from '@/components/studio/parts'
import { lintSkill } from '@/lib/safetyLinter'
import { describeServiceError } from '@/lib/studioErrors'
import { Link } from '@/router/Router'
import * as skillsApi from '@/services/skills'
import { SKILL_PAGE_MAX } from '@/services/skills'
import type { SkillRecord } from '@/types/skill'
import { SkillReviewLabel } from './parts'
import { SkillDetail } from './SkillDetail'
import { SkillVisibilityChanger } from './SkillVisibilityChanger'
import {
  changeSkillVisibility,
  loadMyPendingEdits,
  ScreenError,
} from './skillActions'
import { toIndexEntry } from './skillDraft'
import { originLabel } from '@/lib/portability'

const PAGE = SKILL_PAGE_MAX

/** What blocks sharing: any script, or any Blocked linter finding. */
export function skillBlockers(record: SkillRecord): {
  scripts: number
  blocked: boolean
} {
  const scripts = record.files.filter((f) => f.kind === 'script').length
  let block: boolean
  try {
    block = lintSkill(record).findings.some((f) => f.severity === 'block')
  } catch {
    block = false
  }
  return { scripts, blocked: block || scripts > 0 }
}

/** The signed-in user's skills, 20 to a page, beside their agents on /me. */
export function MySkills() {
  const [items, setItems] = useState<SkillRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [edits, setEdits] = useState<Map<string, SkillRecord>>(new Map())

  const loadPage = useCallback(async (after?: string) => {
    setLoading(true)
    setError('')
    try {
      const page = await skillsApi.listMySkills(PAGE, after)
      setItems((current) => (after ? [...current, ...page.items] : page.items))
      setCursor(page.cursor && page.items.length === PAGE ? page.cursor : null)
    } catch (e) {
      setError(describeServiceError(e, 'list', 'skill'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage()
    // Waiting edits: a few documents at most, read in pages of 20.
    let active = true
    loadMyPendingEdits(skillsApi, PAGE)
      .then((found) => active && setEdits(found))
      .catch(() => {
        // The list still works without edit markers.
      })
    return () => {
      active = false
    }
  }, [loadPage])

  function replace(record: SkillRecord) {
    setItems((current) => current.map((r) => (r.id === record.id ? record : r)))
  }
  function dropEdit(id: string) {
    setEdits((current) => {
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }

  if (!loading && !error && items.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-white/15">
        <p>You have not uploaded a skill yet.</p>
        <p className="mt-2">
          <Link to="/skills/new" className={textLink}>
            Upload a skill folder
          </Link>
          , or write a SKILL.md on the page. You choose who can see it.
        </p>
      </div>
    )

  return (
    <div className="space-y-3">
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <ul className="space-y-3">
        {items.map((record) => (
          <SkillRow
            key={record.id}
            record={record}
            edit={edits.get(record.id) ?? null}
            onChanged={replace}
            onEditGone={() => dropEdit(record.id)}
          />
        ))}
      </ul>
      {loading && (
        <p className="inline-flex items-center gap-2" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your skills…
        </p>
      )}
      {cursor && !loading && (
        <button
          type="button"
          className={smallButton}
          onClick={() => loadPage(cursor)}
        >
          Show more skills
        </button>
      )}
      {items.length > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Skills cannot be deleted. To take one out of circulation, make it
          private.
        </p>
      )}
    </div>
  )
}

export function SkillRow({
  record,
  edit,
  onChanged,
  onEditGone,
}: {
  record: SkillRecord
  edit: SkillRecord | null
  onChanged: (record: SkillRecord) => void
  onEditGone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState<
    SkillRecord['visibility'] | 'any' | null
  >(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const panel = useId()
  const { scripts, blocked } = skillBlockers(record)

  async function applyVisibility(visibility: SkillRecord['visibility']) {
    setBusy(true)
    setError('')
    try {
      const { fresh, message } = await changeSkillVisibility(
        skillsApi,
        record,
        visibility,
      )
      // Changing visibility removes any waiting edit.
      onEditGone()
      if (fresh) onChanged(fresh)
      setChanging(null)
      setMessage(message)
    } catch (e) {
      setError(
        e instanceof ScreenError
          ? e.message
          : describeServiceError(e, 'visibility', 'skill'),
      )
    } finally {
      setBusy(false)
    }
  }

  async function withdraw() {
    if (!edit) return
    const what =
      edit.review_status === 'rejected'
        ? `Remove the edit to version ${edit.version} that was not approved?`
        : `Withdraw your edit to version ${edit.version}? It leaves the review queue.`
    if (!window.confirm(what)) return
    setBusy(true)
    setError('')
    try {
      await skillsApi.withdrawPendingSkillEdit(record.id)
      onEditGone()
      setMessage('The edit was withdrawn.')
    } catch (e) {
      setError(describeServiceError(e, 'withdraw', 'skill'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border border-slate-900/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 break-words text-base font-semibold text-slate-900 dark:text-white">
          {record.name}
        </h3>
        <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
          v{record.version}
        </span>
      </div>
      <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
        {record.id}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <StatusText tone="indigo">Skill</StatusText>
        <VisibilityLabel visibility={record.visibility} />
        <SkillReviewLabel record={record} />
        {originLabel(record.origin_app, record.saved_from_chat) && (
          <StatusText tone="indigo">
            {originLabel(record.origin_app, record.saved_from_chat)}
          </StatusText>
        )}
        {edit &&
          (edit.review_status === 'rejected' ? (
            <StatusText tone="rose">
              Edit v{edit.version} not approved
            </StatusText>
          ) : (
            <StatusText tone="amber">Edit v{edit.version} waiting</StatusText>
          ))}
        {scripts > 0 && (
          <StatusText tone="rose">
            {scripts} {scripts === 1 ? 'script' : 'scripts'}
          </StatusText>
        )}
        {blocked && scripts === 0 && (
          <StatusText tone="rose">Blocked finding</StatusText>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          className={smallButton}
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close' : 'Open'}
          <span className="sr-only"> {record.name}</span>
        </button>
        <Link
          to={`/skills/new?edit=${encodeURIComponent(record.id)}`}
          className={smallButton}
        >
          Edit<span className="sr-only"> {record.name}</span>
        </Link>
        <button
          type="button"
          className={smallButton}
          aria-expanded={changing !== null}
          onClick={() => setChanging(changing ? null : 'any')}
        >
          Change visibility
        </button>
        {record.visibility !== 'private' && (
          <button
            type="button"
            className={smallButton}
            onClick={() => setChanging('private')}
          >
            Make private
          </button>
        )}
        {edit && (
          <button
            type="button"
            className={smallButton}
            onClick={withdraw}
            disabled={busy}
          >
            {edit.review_status === 'rejected'
              ? 'Remove the edit'
              : 'Withdraw the edit'}
          </button>
        )}
      </div>
      {changing && (
        <SkillVisibilityChanger
          record={record}
          edit={edit}
          scripts={scripts}
          blocked={blocked}
          initial={changing === 'any' ? null : changing}
          busy={busy}
          onCancel={() => setChanging(null)}
          onConfirm={applyVisibility}
        />
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        </div>
      )}
      {message && !error && (
        <p
          role="status"
          className="mt-3 text-sm text-teal-800 dark:text-teal-200"
        >
          {message}
        </p>
      )}
      {open && (
        <div
          id={panel}
          className="mt-4 border-t border-slate-900/10 pt-4 dark:border-white/10"
        >
          <SkillDetail
            skill={toIndexEntry(record)}
            loadFiles={() => Promise.resolve(record.files)}
            heading="h4"
            showAuthor={false}
          />
        </div>
      )}
    </li>
  )
}
