import { displayAuthorHandle, displayAuthorName } from '@/lib/authorBranding'
import type { ReactNode } from 'react'
import { FrameworkBadge, VERIFIED_AUTHOR_LABEL } from '@/components/ui'
import {
  FindingNote,
  StatusText,
  VisibilityLabel,
} from '@/components/studio/parts'
import type { LintFinding } from '@/lib/safetyLinter'
import { pathLabel, within } from '@/lib/studioManifest'
import { TOOL_TYPE_LABELS, type AgentManifest } from '@/types/agent'

/**
 * The whole manifest, laid out for a reviewer. Every string is shown as text,
 * never as markup. Findings sit beside the field they refer to; findings with
 * dotted paths are expected (see dottedPath).
 */
export function ManifestView({
  manifest,
  findings,
}: {
  manifest: AgentManifest
  findings: LintFinding[]
}) {
  const at = (path: string) => findings.filter((f) => f.path === path)
  const inside = (path: string) => findings.filter((f) => within(f.path, path))
  const { system_prompt, instructions, verification_rules } =
    manifest.prompt_blueprint

  return (
    <div className="space-y-5 text-sm">
      <Block title="Basics">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr]">
          <Term>Name</Term>
          <Value findings={at('name')}>{manifest.name}</Value>
          <Term>Id</Term>
          <Value>
            <code className="break-all font-mono">{manifest.id}</code>
          </Value>
          <Term>Version</Term>
          <Value>
            <code className="font-mono">{manifest.version}</code>
          </Value>
          <Term>AI Technology</Term>
          <Value>
            <FrameworkBadge framework={manifest.framework} />
          </Value>
          <Term>Visibility</Term>
          <Value>
            <VisibilityLabel visibility={manifest.visibility} />
          </Value>
          <Term>Author</Term>
          <Value>
            @{displayAuthorHandle(manifest.author.handle)} (
            {displayAuthorName(manifest.author)}){' '}
            {manifest.author.verified ? (
              <StatusText tone="teal">{VERIFIED_AUTHOR_LABEL}</StatusText>
            ) : (
              <StatusText>Not marked {VERIFIED_AUTHOR_LABEL}</StatusText>
            )}
          </Value>
          <Term>Tags</Term>
          <Value findings={inside('tags')}>
            <span className="break-words">
              {manifest.tags.map((t) => `#${t}`).join(' ')}
            </span>
          </Value>
          <Term>Description</Term>
          <Value findings={at('description')}>
            <span className="whitespace-pre-wrap break-words">
              {manifest.description}
            </span>
          </Value>
        </dl>
      </Block>

      <Block title="Agent Instructions">
        <p className="whitespace-pre-wrap break-words rounded-2xl bg-surface-2 p-4">
          {system_prompt}
        </p>
        <FindingList findings={at('prompt_blueprint.system_prompt')} />
      </Block>

      <Block title="Instructions">
        <ol className="list-decimal space-y-2 pl-5">
          {instructions.map((step, i) => (
            <li key={i} className="whitespace-pre-wrap break-words">
              {step}
              <FindingList
                findings={at(`prompt_blueprint.instructions.${i}`)}
              />
            </li>
          ))}
        </ol>
      </Block>

      <Block title="Verification rules">
        <ul className="list-disc space-y-2 pl-5">
          {verification_rules.map((rule, i) => (
            <li key={i} className="whitespace-pre-wrap break-words">
              {rule}
              <FindingList
                findings={at(`prompt_blueprint.verification_rules.${i}`)}
              />
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Required tools">
        {manifest.tools_required.length === 0 ? (
          <p>None. It runs on the model alone.</p>
        ) : (
          <ul className="space-y-3">
            {manifest.tools_required.map((tool, i) => (
              <li key={i} className="rounded-3xl bg-surface p-4">
                <p className="flex flex-wrap items-center gap-2">
                  <code className="break-all font-mono font-medium">
                    {tool.name}
                  </code>
                  <StatusText tone="indigo">
                    {TOOL_TYPE_LABELS[tool.type]}
                  </StatusText>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">
                  {tool.description}
                </p>
                {tool.endpoint && (
                  <p className="mt-1 break-all font-mono text-xs">
                    {tool.endpoint}
                  </p>
                )}
                <FindingList
                  findings={inside(`tools_required.${i}`)}
                  labelled
                />
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Input Format">
        <Json value={manifest.input_schema} />
        <FindingList findings={inside('input_schema')} labelled />
      </Block>
      <Block title="Output Format">
        <Json value={manifest.output_schema} />
        <FindingList findings={inside('output_schema')} labelled />
      </Block>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
        {title}
      </h4>
      {children}
    </section>
  )
}

function Term({ children }: { children: ReactNode }) {
  return <dt className="font-medium text-fg-muted">{children}</dt>
}

function Value({
  children,
  findings = [],
}: {
  children: ReactNode
  findings?: LintFinding[]
}) {
  return (
    <dd className="min-w-0 text-fg">
      {children}
      <FindingList findings={findings} />
    </dd>
  )
}

export function FindingList({
  findings,
  labelled,
}: {
  findings: LintFinding[]
  labelled?: boolean
}) {
  if (!findings.length) return null
  return (
    <div className="mt-2 space-y-1.5">
      {findings.map((f, i) => (
        <FindingNote
          key={i}
          finding={f}
          showPath={labelled ? pathLabel(f.path) : undefined}
        />
      ))}
    </div>
  )
}

export function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-2xl bg-surface-2 p-4 font-mono text-xs leading-relaxed text-fg">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}
