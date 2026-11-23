import { Plus } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { primaryButtonClass } from '@/components/ui'
import type { CouncilRecord } from '@/types/council'

const CouncilBuilder = lazy(() =>
  import('./CouncilBuilder').then((m) => ({ default: m.CouncilBuilder })),
)

/**
 * "New council" on My items. The builder loads when it is first opened, so
 * the page does not carry it for people who never build one.
 */
export function NewCouncilButton({
  onCreated,
}: {
  onCreated: (record: CouncilRecord) => void
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={primaryButtonClass}
        aria-haspopup="dialog"
        onClick={() => {
          setNote('')
          setOpen(true)
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        New council
      </button>
      {note && (
        <p role="status" className="text-sm text-fg-muted">
          {note}
        </p>
      )}
      {open && (
        <Suspense fallback={null}>
          <CouncilBuilder
            onClose={() => setOpen(false)}
            onCreated={(record) => {
              if (record) {
                onCreated(record)
                setNote(`Saved ${record.name} as a private council.`)
              } else setNote('Saved. Reload to see it in the list.')
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
