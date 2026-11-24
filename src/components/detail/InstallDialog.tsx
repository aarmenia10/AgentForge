import { useId, useRef, useState, type ReactNode } from 'react'
import { MCP_CONNECTOR_URL } from '@/lib/mcpConfig'
import { ACCOUNT_RESOURCE } from '@/services/connectorConfig'
import { CopyButton, primaryButtonClass } from '../ui'

type Kind = 'Agent' | 'Skill' | 'Council'
type Platform = 'ChatGPT' | 'Claude' | 'Codex' | 'Cursor'

const guidance: Record<Platform, string> = {
  ChatGPT:
    'On ChatGPT web, open Settings → Apps → Advanced Settings and enable developer mode if available. Create a custom app in Apps, name it AgentLemon, paste the link in the MCP server URL field, and choose the appropriate authentication. Enable the app in your chat. Plan eligibility and workspace admin permissions apply.',
  Claude:
    'Open Customize → Connectors → Add → Custom → Web. Name it AgentLemon, paste the link as the server URL, continue, and add it. Enable it from the chat connector menu. Free plans allow one custom connector; workspace permissions may apply.',
  Codex:
    'Open Codex MCP settings and add a streamable HTTP server named AgentLemon. Paste the link in the URL field and save. If using the CLI, use Advanced Options. Your Codex account and workspace must allow MCP.',
  Cursor:
    'Open Cursor Settings → Tools & MCP and add a custom MCP server. Name it AgentLemon and use the copied link as its URL in the server configuration. Enable it for Agent chat. Workspace permissions may apply.',
}

export function InstallDialog({
  kind,
  name,
  directText,
  connectedText,
  account = false,
  restricted = false,
  limitation,
  advanced,
}: {
  kind: Kind
  name: string
  directText: string | null
  connectedText?: string
  account?: boolean
  restricted?: boolean
  limitation?: string
  advanced?: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const [platform, setPlatform] = useState<Platform>('ChatGPT')
  const [manual, setManual] = useState('')
  const link = account ? ACCOUNT_RESOURCE : MCP_CONNECTOR_URL
  const platforms: Platform[] = account
    ? ['ChatGPT', 'Claude']
    : ['ChatGPT', 'Claude', 'Codex', 'Cursor']

  const [copySession, setCopySession] = useState(0)

  return (
    <>
      <button
        type="button"
        className={primaryButtonClass}
        onClick={() => {
          setCopySession((current) => current + 1)
          setManual('')
          dialog.current?.showModal()
        }}
      >
        Install {kind}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-3xl bg-surface p-5 text-fg shadow-xl backdrop:bg-black/60 sm:p-7"
        onKeyDown={(event) => event.stopPropagation()}
        onClose={() => {
          setManual('')
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={heading} className="text-xl font-semibold">
            Install {kind}: {name}
          </h2>
          <button
            type="button"
            className="rounded-full bg-surface-2 px-3 py-2 text-sm"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </div>
        <p className="my-3 text-sm text-fg-muted">
          Review the instructions before using either method.
        </p>
        {restricted && (
          <p className="mb-3 rounded-xl bg-surface-2 p-3 text-sm">
            This content is restricted. Use only an authorized AI workspace.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-line p-4">
            <h3 className="font-semibold">Copy &amp; Paste</h3>
            <p className="text-sm">
              Start using this tool without connecting AgentLemon.
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Click Copy {kind}.</li>
              <li>Open your preferred AI platform.</li>
              <li>Paste into your chat and start using the tool.</li>
            </ol>
            <CopyButton
              key={`direct-${copySession}`}
              text={directText}
              label={`Copy ${kind}`}
              tone="primary"
              onResult={(text) => setManual(text ?? '')}
            />
            {!directText && (
              <p className="text-sm text-fg-muted">
                Instructions unavailable. Reload or use the connection method.
              </p>
            )}
            <p className="text-xs text-fg-muted">
              {limitation ??
                'External tools, files or actions may require additional integrations and permissions.'}
            </p>
          </section>
          {connectedText && (
            <section className="space-y-3 rounded-2xl border border-line p-4">
              <h3 className="font-semibold">Connect &amp; Install</h3>
              <p className="text-sm">
                Connect once per AI platform for supported integrations.
              </p>
              <label className="block text-sm font-medium">
                Choose your AI platform
                <select
                  className="mt-1 block w-full rounded-xl border border-line bg-page p-2"
                  value={platform}
                  onChange={(event) =>
                    setPlatform(event.target.value as Platform)
                  }
                >
                  {platforms.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <h4 className="text-sm font-semibold">1. Connect AgentLemon</h4>
              <p className="text-sm">{guidance[platform]}</p>
              <p className="text-xs text-fg-muted">
                {account
                  ? 'Use OAuth sign-in and approve access to your AgentLemon account.'
                  : 'For this public connection, choose No authentication or No sign in.'}{' '}
                Already connected with this link? Skip this step.
              </p>
              <CopyButton
                key={`link-${copySession}`}
                text={link}
                label="Copy Connection Link"
                tone="primary"
                onResult={(text) => setManual(text ?? '')}
              />
              <h4 className="text-sm font-semibold">2. Install your tool</h4>
              <p className="text-sm">
                Paste the request into a chat with AgentLemon enabled.
              </p>
              <CopyButton
                key={`connected-${copySession}`}
                text={connectedText}
                label={`Copy ${kind}`}
                tone="primary"
                onResult={(text) => setManual(text ?? '')}
              />
            </section>
          )}
        </div>
        {manual && (
          <p role="alert" className="mt-3 text-sm">
            Automatic copying failed. Select and copy the text below.
          </p>
        )}
        {manual && (
          <textarea
            aria-label="Text to copy manually"
            readOnly
            value={manual}
            className="mt-2 h-32 w-full rounded-xl border border-line bg-page p-3"
            onFocus={(event) => event.target.select()}
          />
        )}
        <details className="mt-4 space-y-3 rounded-xl border border-line p-3">
          <summary className="cursor-pointer font-semibold">
            Advanced Options
          </summary>
          {connectedText && (
            <div className="space-y-2 break-words text-sm">
              <p>Connection URL: {link}</p>
              <p>{connectedText}</p>
              {!account && (
                <>
                  <p>Codex CLI: codex mcp add agentlemon --url {link}</p>
                  <p>Cursor: add this entry to mcpServers in mcp.json:</p>
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify({ agentlemon: { url: link } }, null, 2)}
                  </pre>
                </>
              )}
            </div>
          )}
          {advanced}
          <p className="text-xs text-fg-muted">
            If loading fails, check that AgentLemon is enabled in your AI app.
            You can also try direct copying.
          </p>
        </details>
      </dialog>
    </>
  )
}
