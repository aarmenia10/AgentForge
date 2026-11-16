import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/components/ui'
import {
  dottedPath,
  emptyField,
  FIELD_TYPE_LABELS,
  fieldsToSchema,
  pathLabel,
  schemaToFields,
  within,
  type FieldDraft,
  type FieldType,
  type SchemaDraft,
} from '@/lib/studioManifest'
import type { StepProps } from './context'
import { FindingNote, inputClass, Notes, smallButton } from './parts'

export function StepIO(props: StepProps) {
  const { draft, update } = props
  return (
    <div className="space-y-8">
      <SchemaEditor
        {...props}
        root="input_schema"
        title="Input"
        intro="What the person gives the agent. Each field becomes part of the input’s JSON Schema."
        value={draft.input}
        onChange={(input) => update({ input })}
      />
      <SchemaEditor
        {...props}
        root="output_schema"
        title="Output"
        intro="What the agent hands back."
        value={draft.output}
        onChange={(output) => update({ output })}
      />
    </div>
  )
}

function SchemaEditor({
  root,
  title,
  intro,
  value,
  onChange,
  touch,
  notes,
  problemsWithin,
  findingsWithin,
}: StepProps & {
  root: 'input_schema' | 'output_schema'
  title: string
  intro: string
  value: SchemaDraft
  onChange: (value: SchemaDraft) => void
}) {
  const [switchMessage, setSwitchMessage] = useState('')
  const idBase = `studio-${root}`

  function toJson() {
    setSwitchMessage('')
    onChange({
      ...value,
      mode: 'json',
      json: JSON.stringify(fieldsToSchema(value.fields), null, 2),
    })
  }
  function toFields() {
    let fields: FieldDraft[] | null
    try {
      fields = schemaToFields(JSON.parse(value.json))
    } catch {
      fields = null
    }
    if (!fields) {
      setSwitchMessage(
        'The field builder cannot show this schema exactly, so it stays as JSON. Remove the extra keywords to switch back.',
      )
      return
    }
    setSwitchMessage('')
    onChange({ ...value, mode: 'fields', fields })
  }
  function patchField(index: number, patch: Partial<FieldDraft>) {
    onChange({
      ...value,
      fields: value.fields.map((f, i) =>
        i === index ? { ...f, ...patch } : f,
      ),
    })
  }

  // Findings inside a named property sit beside that field; the rest sit
  // under the whole schema.
  const allFindings = findingsWithin(root)
  const fieldNames =
    value.mode === 'fields' ? value.fields.map((f) => f.name.trim()) : []
  const looseFindings = allFindings.filter(
    (f) =>
      dottedPath(f.path) !== root &&
      !fieldNames.some(
        (name) =>
          name && within(dottedPath(f.path), `${root}.properties.${name}`),
      ),
  )

  return (
    <section aria-labelledby={`${idBase}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          id={`${idBase}-title`}
          className="text-base font-semibold text-slate-900 dark:text-white"
        >
          {title}
        </h3>
        <div
          role="group"
          aria-label={`How to edit the ${title.toLowerCase()} schema`}
          className="inline-flex rounded-lg bg-slate-900/5 p-0.5 dark:bg-white/10"
        >
          {(['fields', 'json'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={value.mode === mode}
              onClick={() =>
                mode === value.mode
                  ? undefined
                  : mode === 'json'
                    ? toJson()
                    : toFields()
              }
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition',
                value.mode === mode
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-navy-700 dark:text-white'
                  : 'text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
              )}
            >
              {mode === 'fields' ? 'Field builder' : 'Edit as JSON'}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm">{intro}</p>
      {switchMessage && (
        <p
          role="status"
          className="mt-2 text-xs text-amber-800 dark:text-amber-200"
        >
          {switchMessage}
        </p>
      )}

      {value.mode === 'json' ? (
        <div className="mt-3">
          <label htmlFor={`${idBase}-json`} className="sr-only">
            {title} JSON Schema
          </label>
          <textarea
            id={`${idBase}-json`}
            value={value.json}
            rows={14}
            spellCheck={false}
            onChange={(e) => onChange({ ...value, json: e.target.value })}
            onBlur={() => touch(root)}
            className={`${inputClass()} py-2 font-mono text-xs leading-relaxed`}
          />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {value.fields.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm dark:border-white/15">
              No fields. Add one, or leave it empty if there is nothing to pass.
            </p>
          )}
          <ul className="space-y-3">
            {value.fields.map((field, index) => {
              const id = `${idBase}-${field.key}`
              const name = field.name.trim()
              const fieldFindings = name
                ? allFindings.filter((f) =>
                    within(dottedPath(f.path), `${root}.properties.${name}`),
                  )
                : []
              return (
                <li
                  key={field.key}
                  className="rounded-xl border border-slate-300 p-3 dark:border-white/15"
                >
                  <fieldset>
                    <legend className="sr-only">
                      {title} field {index + 1}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                      <div>
                        <label
                          htmlFor={`${id}-name`}
                          className="mb-1 block text-xs font-medium text-slate-800 dark:text-slate-100"
                        >
                          Field name
                        </label>
                        <input
                          id={`${id}-name`}
                          value={field.name}
                          spellCheck={false}
                          autoCapitalize="none"
                          placeholder="for example order_id"
                          onChange={(e) =>
                            patchField(index, { name: e.target.value })
                          }
                          onBlur={() =>
                            touch(`${root}.properties.${field.key}`)
                          }
                          className={`${inputClass()} h-10 font-mono`}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${id}-type`}
                          className="mb-1 block text-xs font-medium text-slate-800 dark:text-slate-100"
                        >
                          Type
                        </label>
                        <select
                          id={`${id}-type`}
                          value={field.type}
                          onChange={(e) =>
                            patchField(index, {
                              type: e.target.value as FieldType,
                            })
                          }
                          className={`${inputClass()} h-10`}
                        >
                          {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map(
                            (t) => (
                              <option key={t} value={t}>
                                {FIELD_TYPE_LABELS[t]}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label
                        htmlFor={`${id}-description`}
                        className="mb-1 block text-xs font-medium text-slate-800 dark:text-slate-100"
                      >
                        Description (optional)
                      </label>
                      <input
                        id={`${id}-description`}
                        value={field.description}
                        onChange={(e) =>
                          patchField(index, { description: e.target.value })
                        }
                        className={`${inputClass()} h-10`}
                      />
                    </div>
                    <Notes
                      problems={problemsWithin(
                        `${root}.properties.${field.key}`,
                      )}
                      findings={fieldFindings}
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) =>
                            patchField(index, { required: e.target.checked })
                          }
                          className="size-4 accent-teal-700 dark:accent-teal-400"
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        className={smallButton}
                        onClick={() =>
                          onChange({
                            ...value,
                            fields: value.fields.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Remove field
                      </button>
                    </div>
                  </fieldset>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className={smallButton}
            onClick={() =>
              onChange({ ...value, fields: [...value.fields, emptyField()] })
            }
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add a field
          </button>
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
              Show the JSON Schema this makes
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-xs text-slate-100">
              {JSON.stringify(fieldsToSchema(value.fields), null, 2)}
            </pre>
          </details>
        </div>
      )}

      {notes(root)}
      {looseFindings.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {looseFindings.map((f, i) => (
            <FindingNote key={i} finding={f} showPath={pathLabel(f.path)} />
          ))}
        </div>
      )}
    </section>
  )
}
