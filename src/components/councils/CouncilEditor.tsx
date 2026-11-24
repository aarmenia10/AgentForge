import { useState, type FormEvent } from 'react'
import { formatItemRef, parseItemRef } from '@/lib/skillSchema'
import { councilStore } from '@/services/councilStore'
import {
  inputClass,
  primaryButton,
  smallButton,
} from '@/components/studio/parts'
import type { CouncilRecord } from '@/types/council'

export function CouncilEditor({
  record,
  done,
}: {
  record: CouncilRecord
  done: (message: string) => void
}) {
  const [members, setMembers] = useState(() =>
    record.members.map(({ ref, ...member }, index) => ({
      ...member,
      ref: formatItemRef(ref),
      key: index,
    })),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const store = await councilStore()
      const { staged } = await store.update({
        ...record,
        name: String(form.get('name')),
        version: String(form.get('version')),
        description: String(form.get('description')),
        instructions: String(form.get('instructions')),
        tags: String(form.get('tags'))
          .split(',')
          .map((tag) => tag.trim()),
        members: members.map(({ ref, role, order }) => ({
          ref: parseItemRef(ref),
          role,
          order,
        })),
      })
      done(staged ? 'Proposed version sent for review.' : 'Council saved.')
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not save council.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="space-y-4" onSubmit={(event) => void save(event)}>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['name', 'version', 'tags'] as const).map((field) => (
          <label key={field} className="space-y-1">
            <span className="capitalize">
              {field}
              {field === 'tags' ? ' (comma-separated)' : ''}
            </span>
            <input
              className={inputClass() + ' h-10'}
              name={field}
              required
              defaultValue={
                field === 'tags' ? record.tags.join(', ') : record[field]
              }
            />
          </label>
        ))}
      </div>
      {(['description', 'instructions'] as const).map((field) => (
        <label key={field} className="block space-y-1">
          <span className="capitalize">{field}</span>
          <textarea
            className={inputClass() + ' py-2'}
            name={field}
            required
            rows={field === 'description' ? 3 : 8}
            defaultValue={record[field]}
          />
        </label>
      ))}
      <fieldset className="space-y-2">
        <legend className="font-medium">Pinned members</legend>
        {members.map((member) => (
          <div
            key={member.key}
            className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]"
          >
            {(['ref', 'role', 'order'] as const).map((field) => (
              <label key={field} className="space-y-1">
                <span>
                  {field === 'ref'
                    ? 'Reference'
                    : field === 'role'
                      ? 'Role'
                      : 'Stage'}
                </span>
                <input
                  required
                  className={inputClass() + ' h-10'}
                  value={member[field]}
                  type={field === 'order' ? 'number' : 'text'}
                  min={field === 'order' ? 1 : undefined}
                  placeholder={
                    field === 'ref' ? 'agent:example@1.0.0' : undefined
                  }
                  onChange={(e) => {
                    const value =
                      field === 'order'
                        ? Number(e.target.value)
                        : e.target.value
                    setMembers((current) =>
                      current.map((row) =>
                        row.key === member.key
                          ? { ...row, [field]: value }
                          : row,
                      ),
                    )
                  }}
                />
              </label>
            ))}
            <button
              type="button"
              className={smallButton + ' self-end'}
              disabled={members.length <= 2}
              onClick={() =>
                setMembers((current) =>
                  current.filter((row) => row.key !== member.key),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={smallButton}
          disabled={members.length >= 20}
          onClick={() =>
            setMembers((current) => [
              ...current,
              {
                ref: '',
                role: '',
                order: 1,
                key: Math.max(...current.map(({ key }) => key)) + 1,
              },
            ])
          }
        >
          Add member
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="whitespace-pre-wrap text-fg">
          {error}
        </p>
      )}
      <button type="submit" className={primaryButton} disabled={busy}>
        {record.visibility === 'public' && record.review_status === 'approved'
          ? 'Submit new version'
          : 'Save changes'}
      </button>
    </form>
  )
}
