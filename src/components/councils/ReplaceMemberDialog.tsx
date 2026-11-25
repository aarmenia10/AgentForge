import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Link } from '@/router/Router'
import { listMyAgents } from '@/services/agents'
import * as skillsApi from '@/services/skills'
import { SKILL_PAGE_MAX } from '@/services/skills'
import type { CouncilIndexEntry, CouncilRecord } from '@/types/council'
import type { ItemRef } from '@/types/skill'
import type { CouncilMemberUse } from '@/services/councilStore'
import { smallButton, textLink } from '@/components/studio/parts'

interface ReplacementItem {
  ref: ItemRef
  name: string
}

interface ReplaceMemberDialogProps {
  mode: 'delete' | 'version'
  itemName: string
  target: ItemRef
  ownerUses: CouncilMemberUse<CouncilRecord>[]
  publicUses: CouncilMemberUse<CouncilIndexEntry>[]
  replacement?: ItemRef
  onCancel: () => void
  onDeleteAnyway?: () => Promise<void>
  onReplace?: (replacement: ItemRef, deleteAfter: boolean) => Promise<void>
  onUpdateVersion?: () => Promise<void>
}

async function loadAgents(): Promise<ReplacementItem[]> {
  const found: ReplacementItem[] = []
  let after: string | undefined
  do {
    const page = await listMyAgents(20, after)
    found.push(
      ...page.items.map((item) => ({
        ref: { kind: 'agent' as const, id: item.id, version: item.version },
        name: item.name,
      })),
    )
    after = page.cursor ?? undefined
  } while (after)
  return found
}

async function loadSkills(): Promise<ReplacementItem[]> {
  const found: ReplacementItem[] = []
  let after: string | undefined
  do {
    const page = await skillsApi.listMySkills(SKILL_PAGE_MAX, after)
    found.push(
      ...page.items.map((item) => ({
        ref: { kind: 'skill' as const, id: item.id, version: item.version },
        name: item.name,
      })),
    )
    after = page.cursor ?? undefined
  } while (after)
  return found
}

function CouncilUses({
  uses,
}: {
  uses: CouncilMemberUse<CouncilRecord | CouncilIndexEntry>[]
}) {
  return (
    <ul className="space-y-2">
      {uses.map(({ council, members }) => (
        <li
          key={council.id}
          className="rounded-2xl bg-surface-2 px-4 py-3 text-sm"
        >
          <p className="font-semibold text-fg">{council.name}</p>
          <p className="mt-1 text-fg-muted">
            {members.map(({ role }) => role).join(', ')}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function ReplaceMemberDialog({
  mode,
  itemName,
  target,
  ownerUses,
  publicUses,
  replacement,
  onCancel,
  onDeleteAnyway,
  onReplace,
  onUpdateVersion,
}: ReplaceMemberDialogProps) {
  const dialog = useRef<HTMLDivElement>(null)
  const [choosing, setChoosing] = useState(false)
  const [candidates, setCandidates] = useState<ReplacementItem[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const loadCandidates = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const items =
        target.kind === 'agent' ? await loadAgents() : await loadSkills()
      setCandidates(items.filter(({ ref }) => ref.id !== target.id))
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not load your replacement items.',
      )
    } finally {
      setLoading(false)
    }
  }, [target.id, target.kind])

  useEffect(() => {
    dialog.current?.focus()
  }, [])

  useEffect(() => {
    if (!choosing) return
    void loadCandidates()
    window.addEventListener('focus', loadCandidates)
    return () => window.removeEventListener('focus', loadCandidates)
  }, [choosing, loadCandidates])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) {
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const controls = dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), select:not(:disabled), a[href]',
    )
    if (!controls?.length) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'The update did not finish.',
      )
    } finally {
      setBusy(false)
    }
  }

  const selectedItem = candidates.find(
    ({ ref }) => ref.id + '@' + ref.version === selected,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-page/80 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-member-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-[var(--lm-shadow)] focus:outline-none sm:rounded-3xl sm:p-7"
      >
        <h2
          id="replace-member-title"
          className="text-xl font-semibold text-fg sm:text-2xl"
        >
          {mode === 'delete'
            ? `Before deleting ${itemName}`
            : `Update councils using ${itemName}`}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          {mode === 'delete'
            ? 'A council left pointing at a deleted item will not load that member.'
            : `These councils still pin version ${target.version}. You can update your councils to the new version.`}
        </p>

        {ownerUses.length > 0 && (
          <section className="mt-5 space-y-2" aria-label="Your councils">
            <h3 className="font-semibold text-fg">Your councils</h3>
            <CouncilUses uses={ownerUses} />
          </section>
        )}

        {publicUses.length > 0 && (
          <section
            className="mt-5 space-y-2"
            aria-label="Other public councils"
          >
            <h3 className="font-semibold text-fg">
              Other people’s public councils
            </h3>
            <p className="text-sm text-fg-muted">
              Other people’s councils that use this will break. We can list
              them, but we cannot change someone else’s council.
            </p>
            <CouncilUses uses={publicUses} />
          </section>
        )}

        {error && (
          <p
            className="mt-4 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"
            role="alert"
          >
            {error}
          </p>
        )}

        {mode === 'version' ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {ownerUses.length > 0 && (
              <button
                type="button"
                className={smallButton}
                disabled={busy}
                onClick={() => onUpdateVersion && void run(onUpdateVersion)}
              >
                {busy ? 'Updating…' : 'Update councils to the new version'}
              </button>
            )}
            <button
              type="button"
              className={smallButton}
              disabled={busy}
              onClick={onCancel}
            >
              Leave councils unchanged
            </button>
          </div>
        ) : choosing ? (
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-fg">
              Replace with
              <select
                className="mt-2 h-11 w-full rounded-xl border border-line bg-page px-3 text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                disabled={loading || busy}
              >
                <option value="">Choose an item</option>
                {candidates.map(({ ref, name }) => (
                  <option
                    key={ref.kind + ':' + ref.id + '@' + ref.version}
                    value={ref.id + '@' + ref.version}
                  >
                    {name} · v{ref.version}
                  </option>
                ))}
              </select>
            </label>
            {loading && (
              <p role="status" className="text-sm text-fg-muted">
                Loading your items…
              </p>
            )}
            {candidates.length === 0 && !loading && (
              <p className="text-sm text-fg-muted">
                You do not have another {target.kind} yet.{' '}
                <Link
                  to={target.kind === 'agent' ? '/studio' : '/skills/new'}
                  target="_blank"
                  rel="noreferrer"
                  className={textLink}
                >
                  {target.kind === 'agent'
                    ? 'Create one in Studio'
                    : 'Create or upload a skill'}
                </Link>{' '}
                in a new tab; this replacement flow will stay open.
              </p>
            )}
            {candidates.length > 0 && (
              <p className="text-sm text-fg-muted">
                Need another item?{' '}
                <Link
                  to={target.kind === 'agent' ? '/studio' : '/skills/new'}
                  target="_blank"
                  rel="noreferrer"
                  className={textLink}
                >
                  {target.kind === 'agent'
                    ? 'Create one in Studio'
                    : 'Create or upload a skill'}
                </Link>{' '}
                in a new tab. Your list refreshes when you return.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={smallButton}
                disabled={!selectedItem || busy || loading}
                onClick={() =>
                  selectedItem &&
                  onReplace &&
                  void run(() => onReplace(selectedItem.ref, false))
                }
              >
                Replace only
              </button>
              <button
                type="button"
                className={smallButton}
                disabled={!selectedItem || busy || loading}
                onClick={() =>
                  selectedItem &&
                  onReplace &&
                  void run(() => onReplace(selectedItem.ref, true))
                }
              >
                Replace and delete
              </button>
              <button
                type="button"
                className={smallButton}
                disabled={busy}
                onClick={() => setChoosing(false)}
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap gap-2">
            {ownerUses.length > 0 && (
              <button
                type="button"
                className={smallButton}
                disabled={busy}
                onClick={() => setChoosing(true)}
              >
                Replace in these councils
              </button>
            )}
            <button
              type="button"
              className={smallButton}
              disabled={busy}
              onClick={() => onDeleteAnyway && void run(onDeleteAnyway)}
            >
              Delete anyway
            </button>
            <button
              type="button"
              className={smallButton}
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        )}
        {mode === 'version' && replacement && (
          <p className="mt-4 text-xs text-fg-muted">
            New pin: {replacement.kind}:{replacement.id}@{replacement.version}
          </p>
        )}
      </div>
    </div>
  )
}
