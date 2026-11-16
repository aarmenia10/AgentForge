import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { inputClass, smallButton } from './parts'

/**
 * An ordered list of text entries: numbered, reorderable with buttons, each
 * with its own notes underneath. Used for instructions and verification rules.
 */
export function ListEditor({
  idBase,
  label,
  itemNoun,
  items,
  onChange,
  onBlur,
  notesFor,
  placeholder,
}: {
  idBase: string
  label: string
  /** "step" or "check", for button and field labels. */
  itemNoun: string
  items: string[]
  onChange: (items: string[]) => void
  onBlur: () => void
  notesFor: (index: number) => ReactNode
  placeholder?: string
}) {
  function set(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? value : item)))
  }
  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <ol className="space-y-3" aria-label={label}>
      {items.map((item, index) => {
        const id = `${idBase}-${index}`
        return (
          <li key={index} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-2 grid size-6 shrink-0 place-items-center rounded-full bg-teal-500/15 text-xs font-semibold text-teal-800 dark:text-teal-200"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor={id} className="sr-only">
                {`${itemNoun[0].toUpperCase()}${itemNoun.slice(1)} ${index + 1}`}
              </label>
              <textarea
                id={id}
                value={item}
                rows={2}
                placeholder={placeholder}
                onChange={(e) => set(index, e.target.value)}
                onBlur={onBlur}
                className={`${inputClass()} min-h-16 py-2`}
              />
              {notesFor(index)}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${itemNoun} ${index + 1} up`}
                >
                  <ArrowUp className="size-3.5" aria-hidden="true" />
                  Up
                </button>
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${itemNoun} ${index + 1} down`}
                >
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                  Down
                </button>
                <button
                  type="button"
                  className={smallButton}
                  onClick={() => remove(index)}
                  aria-label={`Remove ${itemNoun} ${index + 1}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Remove
                </button>
              </div>
            </div>
          </li>
        )
      })}
      <li>
        <button
          type="button"
          className={smallButton}
          onClick={() => onChange([...items, ''])}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add a {itemNoun}
        </button>
      </li>
    </ol>
  )
}
