import { Link2 } from 'lucide-react'
import { MCP_CONNECTOR_URL } from '@/lib/mcpConfig'
import { cn, CodeBlock } from './ui'

/**
 * The remote connector: one link, pasted into an AI app's connector settings.
 * Shown on the home page and at the top of every agent's install tab.
 */
export function ConnectorCard({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-labelledby={compact ? undefined : 'connect-heading'}
      className={cn('glass rounded-2xl', compact ? 'p-4' : 'p-5 sm:p-6')}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-300">
          <Link2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={compact ? undefined : 'connect-heading'}
            className={cn(
              'font-semibold tracking-tight',
              compact ? 'text-sm' : 'text-lg',
            )}
          >
            {compact
              ? 'Fastest: add AgentForge as a connector'
              : 'Connect AgentForge to your AI'}
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Nothing to install. Works on phone, web, and desktop. It connects
            the whole registry, so your AI can search it and pick the right
            agent for each task.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <CodeBlock
          code={MCP_CONNECTOR_URL}
          title="Connector link"
          copyLabel="Copy link"
        />
      </div>

      <ol className="mt-4 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
        <li>1. Open your AI app&apos;s settings and find Connectors.</li>
        <li>2. Choose to add a custom connector and paste the link.</li>
        <li>
          3. Then say:{' '}
          <span className="font-mono text-[13px] text-slate-800 dark:text-slate-100">
            Use AgentForge to find an agent for &lt;your task&gt;.
          </span>
        </li>
      </ol>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Covers public agents. Custom connectors may need a paid plan in some AI
        apps.
        {compact &&
          ' To pin just this one agent on a computer instead, use the options below.'}
      </p>
    </section>
  )
}
