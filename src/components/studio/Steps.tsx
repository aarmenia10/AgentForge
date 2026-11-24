import { Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import {
  AGENT_CATEGORIES,
  AGENT_FRAMEWORKS,
  FRAMEWORK_LABELS,
  TOOL_TYPE_LABELS,
  type AgentFramework,
  type AgentToolType,
} from '@/types/agent'
import { emptyTool, normalizeTag, slugify } from '@/lib/studioManifest'
import type { StepProps } from './context'
import { ListEditor } from './ListEditor'
import { Field, inputClass, smallButton } from './parts'

const legendClass = 'mb-1.5 block text-sm font-medium text-fg'

export function StepBasics({
  draft,
  update,
  touch,
  notes,
  editing,
}: StepProps) {
  const [tagText, setTagText] = useState('')

  function addTag() {
    const tag = normalizeTag(tagText)
    setTagText('')
    if (!tag || draft.tags.includes(tag) || draft.categories.includes(tag))
      return
    update({ tags: [...draft.tags, tag] })
    touch('tags')
  }

  return (
    <div className="space-y-6">
      <Field
        id="studio-name"
        label="Name"
        hint="What people see in the catalog, for example Invoice Checker."
        notes={notes('name')}
      >
        <input
          id="studio-name"
          value={draft.name}
          maxLength={120}
          onChange={(e) => {
            const name = e.target.value
            update(
              draft.idEdited || editing
                ? { name }
                : { name, id: slugify(name) },
            )
          }}
          onBlur={() => touch('name')}
          className={`${inputClass()} h-11`}
        />
      </Field>

      <Field
        id="studio-id"
        label="Id"
        hint={
          editing
            ? 'The id is fixed once an agent is saved.'
            : 'Suggested from the name. Used in links and install commands, and fixed after the first save.'
        }
        notes={notes('id')}
      >
        <input
          id="studio-id"
          value={draft.id}
          disabled={editing}
          maxLength={60}
          spellCheck={false}
          autoCapitalize="none"
          onChange={(e) => update({ id: e.target.value, idEdited: true })}
          onBlur={() => touch('id')}
          className={`${inputClass()} h-11 font-mono`}
        />
      </Field>

      <Field
        id="studio-version"
        label="Version"
        hint="Three numbers, like 1.0.0. Raise the last one for small fixes, the middle one for new features."
        notes={notes('version')}
      >
        <input
          id="studio-version"
          value={draft.version}
          maxLength={40}
          spellCheck={false}
          onChange={(e) => update({ version: e.target.value })}
          onBlur={() => touch('version')}
          className={`${inputClass()} h-11 max-w-48 font-mono`}
        />
      </Field>

      <Field
        id="studio-description"
        label="Description"
        hint="One or two sentences on what the agent does and for whom."
        notes={notes('description')}
      >
        <textarea
          id="studio-description"
          value={draft.description}
          rows={3}
          onChange={(e) => update({ description: e.target.value })}
          onBlur={() => touch('description')}
          className={`${inputClass()} py-2`}
        />
      </Field>

      <fieldset>
        <legend className={legendClass}>Categories</legend>
        <p className="mb-2 text-xs text-fg-muted">
          Pick any that fit. Each one is also a tag.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AGENT_CATEGORIES.map(({ tag, label }) => {
            const checked = draft.categories.includes(tag)
            return (
              <label
                key={tag}
                className="flex cursor-pointer items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm has-[:checked]:border-accent-fg has-[:checked]:bg-accent/10"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  className="size-4 accent-[var(--lm-accent)]"
                  onChange={() => {
                    update({
                      categories: checked
                        ? draft.categories.filter((c) => c !== tag)
                        : [...draft.categories, tag],
                      tags: draft.tags.filter((t) => t !== tag),
                    })
                    touch('tags')
                  }}
                />
                {label}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="studio-tag" className={legendClass}>
          More tags
        </label>
        <div className="flex gap-2">
          <input
            id="studio-tag"
            value={tagText}
            maxLength={60}
            placeholder="for example invoices"
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addTag()
              }
            }}
            className={`${inputClass()} h-10 min-w-0 flex-1`}
          />
          <button
            type="button"
            className={smallButton + ' h-10'}
            onClick={addTag}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </button>
        </div>
        <p className="mt-1.5 text-xs text-fg-muted">
          Press Enter to add. Tags are lowercase words joined by hyphens.
        </p>
        {draft.tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
            {draft.tags.map((tag) => (
              <li
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-xs text-fg"
              >
                #{tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() =>
                    update({ tags: draft.tags.filter((t) => t !== tag) })
                  }
                  className="grid size-6 place-items-center rounded-full hover:bg-surface"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {notes('tags')}
      </div>

      <Field
        id="studio-framework"
        label="Framework"
        hint="What the agent was written for. Choose MCP Native if it runs in any MCP client."
        notes={notes('framework')}
      >
        <select
          id="studio-framework"
          value={draft.framework}
          onChange={(e) =>
            update({ framework: e.target.value as AgentFramework })
          }
          className={`${inputClass()} h-11 max-w-64`}
        >
          {AGENT_FRAMEWORKS.map((f) => (
            <option key={f} value={f}>
              {FRAMEWORK_LABELS[f]}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}

export function StepPrompt({ draft, update, touch, notes }: StepProps) {
  return (
    <div className="space-y-6">
      <Field
        id="studio-system-prompt"
        label="System prompt"
        hint="Who the agent is and how it behaves. The AI reads this first."
        notes={notes('prompt_blueprint.system_prompt')}
      >
        <textarea
          id="studio-system-prompt"
          value={draft.systemPrompt}
          rows={6}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          onBlur={() => touch('prompt_blueprint.system_prompt')}
          className={`${inputClass()} py-2`}
        />
      </Field>

      <fieldset>
        <legend className={legendClass}>Instructions</legend>
        <p className="mb-3 text-xs text-fg-muted">
          The steps the agent follows, in order.
        </p>
        <ListEditor
          idBase="studio-instruction"
          label="Instructions"
          itemNoun="step"
          items={draft.instructions}
          onChange={(instructions) => update({ instructions })}
          onBlur={() => touch('prompt_blueprint.instructions')}
          notesFor={(i) => notes(`prompt_blueprint.instructions.${i}`)}
        />
        {notes('prompt_blueprint.instructions')}
      </fieldset>

      <fieldset>
        <legend className={legendClass}>Verification rules</legend>
        <p className="mb-3 text-xs text-fg-muted">
          Checks the agent makes before it answers, for example “Every figure
          has a source”.
        </p>
        <ListEditor
          idBase="studio-rule"
          label="Verification rules"
          itemNoun="check"
          items={draft.verificationRules}
          onChange={(verificationRules) => update({ verificationRules })}
          onBlur={() => touch('prompt_blueprint.verification_rules')}
          notesFor={(i) => notes(`prompt_blueprint.verification_rules.${i}`)}
        />
        {notes('prompt_blueprint.verification_rules')}
      </fieldset>
    </div>
  )
}

export function StepTools({ draft, update, touch, notes }: StepProps) {
  function patchTool(index: number, patch: Partial<(typeof draft.tools)[0]>) {
    update({
      tools: draft.tools.map((tool, i) =>
        i === index ? { ...tool, ...patch } : tool,
      ),
    })
  }
  return (
    <div className="space-y-4">
      <p className="text-sm">
        List the tools the agent needs from the person’s AI app, such as an MCP
        server or an API. Leave this empty if the agent runs on the model alone.
      </p>
      {draft.tools.length === 0 && (
        <p className="rounded-3xl bg-surface p-5 text-center text-sm text-fg-muted">
          No tools yet.
        </p>
      )}
      <ul className="space-y-4">
        {draft.tools.map((tool, index) => {
          const base = `tools_required.${index}`
          const id = `studio-tool-${tool.key}`
          return (
            <li key={tool.key} className="rounded-3xl bg-surface p-5">
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-fg">
                  Tool {index + 1}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    id={`${id}-name`}
                    label="Name"
                    notes={notes(`${base}.name`)}
                  >
                    <input
                      id={`${id}-name`}
                      value={tool.name}
                      spellCheck={false}
                      onChange={(e) =>
                        patchTool(index, { name: e.target.value })
                      }
                      onBlur={() => touch(`${base}.name`)}
                      className={`${inputClass()} h-10 font-mono`}
                    />
                  </Field>
                  <Field
                    id={`${id}-type`}
                    label="Kind"
                    notes={notes(`${base}.type`)}
                  >
                    <select
                      id={`${id}-type`}
                      value={tool.type}
                      onChange={(e) =>
                        patchTool(index, {
                          type: e.target.value as AgentToolType,
                        })
                      }
                      className={`${inputClass()} h-10`}
                    >
                      {(Object.keys(TOOL_TYPE_LABELS) as AgentToolType[]).map(
                        (t) => (
                          <option key={t} value={t}>
                            {TOOL_TYPE_LABELS[t]}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                </div>
                <Field
                  id={`${id}-endpoint`}
                  label="Where to get it (optional)"
                  hint="An https address, or a package with a pinned version such as npx -y some-server@1.2.3. Leave empty for a local function."
                  notes={notes(`${base}.endpoint`)}
                >
                  <input
                    id={`${id}-endpoint`}
                    value={tool.endpoint}
                    spellCheck={false}
                    autoCapitalize="none"
                    onChange={(e) =>
                      patchTool(index, { endpoint: e.target.value })
                    }
                    onBlur={() => touch(`${base}.endpoint`)}
                    className={`${inputClass()} h-10 font-mono`}
                  />
                </Field>
                <Field
                  id={`${id}-description`}
                  label="What it does"
                  notes={notes(`${base}.description`)}
                >
                  <textarea
                    id={`${id}-description`}
                    value={tool.description}
                    rows={2}
                    onChange={(e) =>
                      patchTool(index, { description: e.target.value })
                    }
                    onBlur={() => touch(`${base}.description`)}
                    className={`${inputClass()} py-2`}
                  />
                </Field>
                {notes(base)}
                <button
                  type="button"
                  className={smallButton}
                  onClick={() =>
                    update({ tools: draft.tools.filter((_, i) => i !== index) })
                  }
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Remove tool {index + 1}
                </button>
              </fieldset>
            </li>
          )
        })}
      </ul>
      {notes('tools_required')}
      <button
        type="button"
        className={smallButton}
        onClick={() => update({ tools: [...draft.tools, emptyTool()] })}
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Add a tool
      </button>
    </div>
  )
}
