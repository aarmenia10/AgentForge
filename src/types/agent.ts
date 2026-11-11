/**
 * Canonical AgentForge schema contract.
 *
 * This file is the single source of truth for the web app, the Firestore
 * `agents` collection, and `@agentforge/mcp-server`. Field names are snake_case
 * where the manifest is serialized (JSON on disk, Firestore documents, MCP
 * payloads), so do not rename them without a schema version bump.
 */

export type AgentFramework = 'crewai' | 'langchain' | 'autogen' | 'mcp_native' | 'custom'

export type AgentToolType = 'mcp_tool' | 'python_function' | 'rest_api'

/** A JSON Schema document (draft 2020-12 recommended). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonSchema = Record<string, any>

export interface AgentAuthor {
  name: string
  /** GitHub handle without the leading "@". */
  github: string
  verified: boolean
}

export interface AgentTool {
  name: string
  type: AgentToolType
  /** MCP server URL / package spec, or REST base URL. Omitted for local functions. */
  endpoint?: string
  description: string
}

export interface PromptBlueprint {
  system_prompt: string
  /** Ordered, step-by-step reasoning instructions. */
  instructions: string[]
  /** Checks the agent must pass before returning output. */
  verification_rules: string[]
}

export interface AgentStats {
  stars: number
  views: number
  /** ISO 8601 timestamp. */
  updated_at: string
}

export interface AgentManifest {
  /** Unique, URL-safe slug. Doubles as the Firestore document id. */
  id: string
  name: string
  /** Semver. */
  version: string
  description: string
  author: AgentAuthor
  /** Lowercase discovery tags, e.g. 'finance', 'coding', 'sec', 'research'. */
  tags: string[]
  framework: AgentFramework
  tools_required: AgentTool[]
  input_schema: JsonSchema
  output_schema: JsonSchema
  prompt_blueprint: PromptBlueprint
  stats: AgentStats
}

/* ---------- UI-facing constants derived from the contract ---------- */

export const AGENT_FRAMEWORKS: readonly AgentFramework[] = [
  'mcp_native',
  'crewai',
  'langchain',
  'autogen',
  'custom',
]

export const FRAMEWORK_LABELS: Record<AgentFramework, string> = {
  crewai: 'CrewAI',
  langchain: 'LangChain',
  autogen: 'AutoGen',
  mcp_native: 'MCP Native',
  custom: 'Custom',
}

export const TOOL_TYPE_LABELS: Record<AgentToolType, string> = {
  mcp_tool: 'MCP tool',
  python_function: 'Python function',
  rest_api: 'REST API',
}

/** Top-level categories. Each maps 1:1 onto a tag in `AgentManifest.tags`. */
export const AGENT_CATEGORIES = [
  { tag: 'coding', label: 'Coding' },
  { tag: 'finance', label: 'Finance' },
  { tag: 'research', label: 'Research' },
  { tag: 'devops', label: 'DevOps' },
  { tag: 'ops', label: 'Ops' },
  { tag: 'creative', label: 'Creative' },
] as const

export type AgentCategoryTag = (typeof AGENT_CATEGORIES)[number]['tag']
