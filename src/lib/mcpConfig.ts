import type { AgentManifest } from '@/types/agent'

/** Name of the package that serves registry agents over MCP stdio. */
export const MCP_SERVER_PACKAGE = 'agentforge-registry'

/** Must match packages/mcp-server/package.json. A test enforces it. */
export const MCP_SERVER_VERSION = '0.1.0'

/**
 * What `npx` installs. The server is distributed as a tarball on our own
 * Firebase Hosting site, not through the npm registry, so installs depend on
 * no account and no package name that a third party could claim. Each
 * released tarball stays in public/mcp/ forever so old configs keep working.
 */
export const MCP_SERVER_SPEC = `https://agentforge-b10db.web.app/mcp/${MCP_SERVER_PACKAGE}-${MCP_SERVER_VERSION}.tgz`

export type McpClient = 'claude_desktop' | 'cursor' | 'claude_code' | 'codex'

export interface McpClientInfo {
  id: McpClient
  label: string
  /** File the snippet is merged into, or null when installed via CLI. */
  configFile: string | null
  /** Where that file lives, per OS. */
  locations: { os: string; path: string }[]
}

export const MCP_CLIENTS: readonly McpClientInfo[] = [
  {
    id: 'claude_desktop',
    label: 'Claude Desktop',
    configFile: 'claude_desktop_config.json',
    locations: [
      { os: 'macOS', path: '~/Library/Application Support/Claude/claude_desktop_config.json' },
      { os: 'Windows', path: '%APPDATA%\\Claude\\claude_desktop_config.json' },
      { os: 'Linux', path: '~/.config/Claude/claude_desktop_config.json' },
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    configFile: 'mcp.json',
    locations: [
      { os: 'Global', path: '~/.cursor/mcp.json' },
      { os: 'Project', path: '.cursor/mcp.json' },
    ],
  },
  {
    id: 'claude_code',
    label: 'Claude Code',
    configFile: null,
    locations: [],
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    configFile: null,
    locations: [],
  },
]

export interface McpServerEntry {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>
}

/** Key under `mcpServers`. One entry per installed agent keeps installs additive. */
export function mcpServerKey(agent: Pick<AgentManifest, 'id'>): string {
  return `agentforge-${agent.id}`
}

/** Pins the exact manifest version so a config never drifts under the user. */
export function buildServerEntry(agent: Pick<AgentManifest, 'id' | 'version'>): McpServerEntry {
  return {
    command: 'npx',
    args: ['-y', MCP_SERVER_SPEC, '--agent', `${agent.id}@${agent.version}`],
  }
}

/** The JSON object Claude Desktop and Cursor both accept. */
export function buildMcpConfig(agent: Pick<AgentManifest, 'id' | 'version'>): McpConfig {
  return { mcpServers: { [mcpServerKey(agent)]: buildServerEntry(agent) } }
}

/** Ready-to-paste text for the chosen client. */
export function buildInstallSnippet(
  agent: Pick<AgentManifest, 'id' | 'version'>,
  client: McpClient,
): string {
  if (client === 'claude_code') {
    const { command, args } = buildServerEntry(agent)
    return `claude mcp add ${mcpServerKey(agent)} -- ${command} ${args.join(' ')}`
  }
  if (client === 'codex') {
    // https://learn.chatgpt.com/docs/extend/mcp?surface=cli
    // The CLI writes Codex's mcp_servers configuration in config.toml.
    const { command, args } = buildServerEntry(agent)
    return `codex mcp add ${mcpServerKey(agent)} -- ${command} ${args.join(' ')}`
  }
  return JSON.stringify(buildMcpConfig(agent), null, 2)
}
