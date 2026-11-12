import { TerminalSquare } from 'lucide-react'
import { useState } from 'react'
import { buildInstallSnippet, MCP_CLIENTS, MCP_SERVER_PACKAGE, type McpClient } from '@/lib/mcpConfig'
import type { AgentManifest } from '@/types/agent'
import { cn, CodeBlock } from '../ui'

/** Tab 4: generates the exact config for the chosen MCP client. */
export function InstallPanel({ agent }: { agent: AgentManifest }) {
  const [clientId, setClientId] = useState<McpClient>('claude_desktop')
  const client = MCP_CLIENTS.find((c) => c.id === clientId)!
  const snippet = buildInstallSnippet(agent, clientId)
  const externalTools = agent.tools_required.filter((tool) => tool.type === 'mcp_tool')

  return (
    <div className="space-y-5">
      <div
        role="radiogroup"
        aria-label="MCP client"
        className="flex rounded-xl bg-slate-900/5 p-1 dark:bg-white/5"
      >
        {MCP_CLIENTS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={clientId === id}
            onClick={() => setClientId(id)}
            className={cn(
              'h-9 flex-1 rounded-lg px-3 text-sm font-medium transition',
              clientId === id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-navy-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ol className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="min-w-0 flex-1">
            {client.configFile ? (
              <>
                <p>
                  Open <code className="font-mono text-slate-900 dark:text-white">{client.configFile}</code>:
                </p>
                <dl className="mt-2 space-y-1">
                  {client.locations.map(({ os, path }) => (
                    <div key={os} className="flex gap-2 text-xs">
                      <dt className="w-16 shrink-0 text-slate-400">{os}</dt>
                      <dd className="min-w-0 break-all font-mono">{path}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p>Open a terminal in the project where you want this agent.</p>
            )}
          </div>
        </li>

        <li className="flex gap-3">
          <Step n={2} />
          <div className="min-w-0 flex-1 space-y-2">
            <p>
              {client.configFile
                ? 'Paste this in. If the file already has an mcpServers block, add the inner entry to it.'
                : 'Run the command for your system.'}
            </p>
{client.configFile ? (
              <CodeBlock code={snippet} copyLabel="Copy config" title={client.configFile} />
            ) : (
              <>
                <CodeBlock
                  code={snippet}
                  copyLabel="Copy command"
                  title={<ShellTitle label="macOS, Linux, or WSL" />}
                />
                <CodeBlock
                  code={buildInstallSnippet(agent, clientId, 'windows')}
                  copyLabel="Copy command"
                  title={<ShellTitle label="Windows (PowerShell or Command Prompt)" />}
                />
              </>
            )}
          </div>
        </li>

        <li className="flex gap-3">
          <Step n={3} />
          <p className="flex-1">
            {client.configFile ? `Restart ${client.label}. ` : ''}
            <strong className="font-medium text-slate-900 dark:text-white">{agent.name}</strong>{' '}
            appears as an MCP server and runs on your existing subscription.
          </p>
        </li>
      </ol>

      {externalTools.length > 0 && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          This agent also calls {externalTools.length} companion MCP{' '}
          {externalTools.length === 1 ? 'tool' : 'tools'}. Install the servers listed under Tools
          &amp; MCP, or those steps will fail.
        </p>
      )}

      <p className="text-xs text-slate-400">
        Requires Node.js 22 or newer. <code className="font-mono">{MCP_SERVER_PACKAGE}</code> fetches
        the manifest pinned at v{agent.version}; your prompts never pass through AgentForge.
      </p>
    </div>
  )
}

function ShellTitle({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <TerminalSquare className="size-3.5" /> {label}
    </span>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-teal-500/15 text-xs font-semibold text-teal-700 dark:text-teal-300">
      {n}
    </span>
  )
}
