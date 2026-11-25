import { displayAuthorHandle } from '@/lib/authorBranding'
import { useEffect, useState } from 'react'
import { CouncilRoster } from './CouncilRoster'
import { councilStore } from '@/services/councilStore'
import { lintCouncil } from '@/services/councilSafety'
import {
  dangerButton,
  primaryButton,
  smallButton,
} from '@/components/studio/parts'
import type { CouncilRecord } from '@/types/council'

type Row = { record: CouncilRecord; edit: boolean }
type MemberState = Awaited<
  ReturnType<Awaited<ReturnType<typeof councilStore>>['memberStatus']>
>

function ReviewCard({ row, onChange }: { row: Row; onChange: () => void }) {
  const { record, edit } = row
  const [states, setStates] = useState<MemberState[]>([])
  const [checking, setChecking] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const findings = lintCouncil(record).findings
  const ready =
    states.length === record.members.length &&
    states.every(
      (member) =>
        member?.visibility === 'public' && member.reviewStatus === 'approved',
    )
  async function check() {
    setChecking(true)
    setError('')
    try {
      const store = await councilStore()
      setStates(
        await Promise.all(
          record.members.map(({ ref }) => store.memberStatus(ref)),
        ),
      )
    } catch {
      setStates([])
      setError('Could not check the referenced members.')
    } finally {
      setChecking(false)
    }
  }
  async function decide(status: 'approved' | 'rejected') {
    setWorking(true)
    setError('')
    try {
      await (await councilStore()).review(record.id, status, edit)
      onChange()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not review the council.',
      )
    } finally {
      setWorking(false)
    }
  }
  async function verifyAuthor() {
    setWorking(true)
    setError('')
    try {
      await (
        await councilStore()
      ).verifyAuthor(record.id, !record.author.verified)
      onChange()
    } catch {
      setError('Could not update author verification.')
    } finally {
      setWorking(false)
    }
  }
  return (
    <details className="space-y-3 rounded-3xl bg-surface p-5">
      <summary className="cursor-pointer font-semibold">
        {record.name} · {record.version} ·{' '}
        {edit ? 'Proposed edit' : record.review_status}
      </summary>
      <p>{record.description}</p>
      <p className="text-xs">
        @{displayAuthorHandle(record.author.handle)} · {record.tags.join(', ')}
      </p>
      <h3 className="font-medium">How the Council Works</h3>
      <pre className="whitespace-pre-wrap break-words rounded-2xl bg-surface-2 p-4 text-sm">
        {record.instructions}
      </pre>
      <button
        className={smallButton}
        type="button"
        disabled={checking || working}
        onClick={() => void check()}
      >
        {checking ? 'Checking…' : 'Check member status'}
      </button>
      <CouncilRoster
        members={record.members}
        details={states.map(
          (member, index) =>
            member && {
              ...member,
              state:
                member.visibility +
                ' · ' +
                member.reviewStatus +
                (member.version !== record.members[index].ref.version
                  ? ' · current version ' + member.version
                  : ''),
            },
        )}
      />
      {!!findings.length && (
        <ul className="list-disc space-y-1 pl-5">
          {findings.map((finding, index) => (
            <li key={index}>
              {finding.severity} · {finding.path} · {finding.message}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-fg">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!edit && (
          <button
            type="button"
            className={smallButton}
            disabled={working}
            onClick={() => void verifyAuthor()}
          >
            {record.author.verified
              ? 'Remove author verification'
              : 'Verify author'}
          </button>
        )}
        {record.review_status !== 'approved' && (
          <button
            className={primaryButton}
            type="button"
            disabled={
              checking ||
              working ||
              !ready ||
              findings.some(({ severity }) => severity === 'block')
            }
            onClick={() => void decide('approved')}
          >
            Approve council
          </button>
        )}
        {record.review_status !== 'rejected' && (
          <button
            className={dangerButton}
            type="button"
            disabled={working}
            onClick={() => void decide('rejected')}
          >
            {record.review_status === 'approved'
              ? 'Take down council'
              : 'Reject council'}
          </button>
        )}
      </div>
    </details>
  )
}

export function CouncilReviewQueue() {
  const [filter, setFilter] = useState<{
    status: CouncilRecord['review_status']
    edit: boolean
  }>({ status: 'pending', edit: false })
  const [rows, setRows] = useState<Row[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  useEffect(() => {
    let active = true
    councilStore()
      .then((store) => store.listReview(filter.status, filter.edit))
      .then((page) => {
        if (active) {
          setRows(page.items.map((record) => ({ record, edit: filter.edit })))
          setCursor(page.cursor)
        }
      })
      .catch(() => {
        if (active) setError('Could not load the council review queue.')
      })
    return () => {
      active = false
    }
  }, [filter, revision])
  function reset() {
    setRows(null)
    setCursor(null)
    setError('')
    setRevision((current) => current + 1)
  }
  async function more() {
    setLoadingMore(true)
    try {
      const page = await (
        await councilStore()
      ).listReview(filter.status, filter.edit, cursor ?? undefined)
      setRows((current) => [
        ...(current ?? []),
        ...page.items.map((record) => ({ record, edit: filter.edit })),
      ])
      setCursor(page.cursor)
    } catch {
      setError('Could not load more councils.')
    } finally {
      setLoadingMore(false)
    }
  }
  return (
    <section className="mt-5 space-y-4" aria-label="Council review">
      <label className="flex flex-wrap items-center gap-2">
        Council submissions
        <select
          disabled={loadingMore}
          value={filter.status + (filter.edit ? '-edits' : '')}
          className={smallButton}
          onChange={(event) => {
            const [status, section] = event.target.value.split('-')
            setFilter({
              status: status as CouncilRecord['review_status'],
              edit: section === 'edits',
            })
            reset()
          }}
        >
          <option value="pending">Pending councils</option>
          <option value="pending-edits">Pending edits</option>
          <option value="rejected">Rejected councils</option>
          <option value="rejected-edits">Rejected edits</option>
          <option value="approved">Approved councils</option>
        </select>
      </label>
      {error ? (
        <p role="alert">{error}</p>
      ) : !rows ? (
        <p role="status">Loading council submissions…</p>
      ) : (
        !rows.length && <p>No submissions in this view.</p>
      )}
      {rows?.map((row) => (
        <ReviewCard
          key={row.record.id + '@' + row.record.version}
          row={row}
          onChange={reset}
        />
      ))}
      {cursor && (
        <button
          className={smallButton}
          type="button"
          disabled={loadingMore}
          onClick={() => void more()}
        >
          Load more submissions
        </button>
      )}
    </section>
  )
}
