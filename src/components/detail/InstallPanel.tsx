import { useState } from 'react'
import { buildInstallSnippet, MCP_CLIENTS, MCP_SERVER_PACKAGE, type McpClient } from '@/lib/mcpConfig'
import type { AgentManifest } from '@/types/agent'
import { CodeBlock } from '../ui'

/** Tab 4: generates the exact config for the chosen MCP client. */
export function InstallPanel({ agent }: { agent: AgentManifest }) {
  const [clientId, setClientId] = useState<McpClient>('claude_desktop')
  const client = MCP_CLIENTS.find((c) => c.id === clientId)!
  const snippet = buildInstallSnippet(agent, clientId)
  const externalTools = agent.tools_required.filter((tool) => tool.type === 'mcp_tool')

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="MCP client" className="segmented flex">
        {MCP_CLIENTS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={clientId === id}
            onClick={() => setClientId(id)}
            className="segment"
          >
            {label}
          </button>
        ))}
      </div>

      <ol className="space-y-4 text-sm text-muted">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="min-w-0 flex-1">
            {client.configFile ? (
              <>
                <p>
                  Open <code className="font-mono text-ink">{client.configFile}</code>:
                </p>
                <dl className="mt-2 space-y-1">
                  {client.locations.map(({ os, path }) => (
                    <div key={os} className="flex gap-2 text-xs">
                      <dt className="w-16 shrink-0 text-subtle">{os}</dt>
                      <dd className="min-w-0 font-mono break-all">{path}</dd>
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
                : 'Run this command.'}
            </p>
            <CodeBlock
              code={snippet}
              copyLabel={client.configFile ? 'Copy config' : 'Copy command'}
              title={client.configFile ?? 'shell'}
            />
          </div>
        </li>

        <li className="flex gap-3">
          <Step n={3} />
          <p className="flex-1">
            {client.configFile ? `Restart ${client.label}. ` : ''}
            <strong className="font-medium text-ink">{agent.name}</strong> appears as an MCP server
            and runs on your existing subscription.
          </p>
        </li>
      </ol>

      {externalTools.length > 0 && (
        <p className="rounded-md border border-line bg-sunken p-3 text-sm text-muted">
          <strong className="font-medium text-ink">Before you run it:</strong> this agent also calls{' '}
          {externalTools.length} companion MCP {externalTools.length === 1 ? 'tool' : 'tools'}.
          Install the servers listed under Tools, or those steps will fail.
        </p>
      )}

      <p className="text-xs text-subtle">
        Requires Node.js 18 or newer. <code className="font-mono">{MCP_SERVER_PACKAGE}</code> fetches
        the manifest pinned at v{agent.version}; your prompts never pass through AgentForge.
      </p>
    </div>
  )
}

function Step({ n }: { n: number }) {
  return <span className="w-4 shrink-0 text-right font-mono text-xs leading-5 text-subtle">{n}</span>
}
