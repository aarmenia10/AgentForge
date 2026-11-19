/**
 * The MCP server behind the remote connector. Stateless: one instance is
 * built per request and holds nothing afterwards, so there is no loaded
 * agent, no per-agent tool, and no list-changed notification.
 */
import { skillTools, hostedSkillReader } from '../../mcp-server/src/skills'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { AgentManifest } from '../../../src/types/agent'
import { versionSchema } from '../../../src/lib/manifestSchema'
import {
  createPortabilityBlock,
  type OriginApp,
} from '../../../src/lib/portability'
import {
  CONNECTOR_CONDENSED_GUIDE,
  CONNECTOR_GUIDE_PREFACE,
  GUIDE_NAME,
  GUIDE_URI,
  REGISTRY_GUIDE,
} from '../../mcp-server/src/guide'
import {
  BLUEPRINT_NOTICE,
  discoveryTools,
  jsonResult,
  renderBlueprint,
  runDiscoveryTool,
  selectAgent,
} from '../../mcp-server/src/shared'
import { accountToolNames, accountTools } from './accountTools'

export const CONNECTOR_NAME = 'agentlemon-connector'
export const CONNECTOR_VERSION = '0.1.0'
const LOAD_TOOL = 'get_agent'
const getArgs = z.strictObject({
  agent_id: z.string().min(1),
  version: versionSchema.optional(),
})
const guideText = CONNECTOR_GUIDE_PREFACE + '\n' + REGISTRY_GUIDE
const guideDescription =
  'How the AgentLemon registry is laid out and how to choose an agent: search several ways, compare candidates, prefer the narrowest full fit, and use no agent when nothing fits.'

const publicTitles: Record<string, string> = {
  search_registry: 'Search for agents',
  compare_agents: 'Compare agents',
  get_agent: 'Get an agent',
  search_skills: 'Search for skills',
  get_skill: 'Get a skill',
  get_skill_file: 'Get a skill file',
}

export function createConnectorServer(
  catalog: readonly AgentManifest[],
  resolve: (selector: string) => Promise<AgentManifest> = async (value) =>
    selectAgent(catalog, value),
  readSkill = hostedSkillReader(),
  account?: (
    name: string,
    args: unknown,
  ) => Promise<ReturnType<typeof jsonResult>>,
  origins:
    | Readonly<Record<string, OriginApp>>
    | (() => Promise<Readonly<Record<string, OriginApp>>>) = {},
) {
  const server = new Server(
    { name: CONNECTOR_NAME, version: CONNECTOR_VERSION },
    {
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: CONNECTOR_CONDENSED_GUIDE,
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      ...discoveryTools(LOAD_TOOL),
      ...skillTools,
      {
        name: LOAD_TOOL,
        description:
          'Fetch one agent after you have compared candidates and decided. Accepts an id or exact id@version and returns its full blueprint, schemas, and external tool requirements in one call. Nothing stays loaded afterwards. If no candidate fits the task, do not call this; tell the user and proceed without an agent.',
        inputSchema: {
          type: 'object',
          properties: {
            agent_id: {
              type: 'string',
              description: 'An id or exact id@version from search_registry.',
            },
            version: {
              type: 'string',
              description:
                'Optional exact version. Must agree with any id@version selector.',
            },
          },
          required: ['agent_id'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
    ] as const
    if (!account) return { tools: [...tools] }
    const securitySchemes = [{ type: 'noauth' }]
    return {
      tools: [
        ...tools.map((tool) => ({
          ...tool,
          title: publicTitles[tool.name],
          annotations: { ...tool.annotations, title: publicTitles[tool.name] },
          securitySchemes,
          _meta: {
            ...('_meta' in tool && typeof tool._meta === 'object'
              ? tool._meta
              : {}),
            securitySchemes,
          },
        })),
        ...accountTools,
      ],
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args = {} } = request.params
      if (account && accountToolNames.has(name))
        return await account(name, args)
      const discovery = runDiscoveryTool(catalog, name, args, LOAD_TOOL)
      if (discovery) return discovery
      const skill = await readSkill(name, args)
      if (skill) return skill
      if (name === LOAD_TOOL) {
        const { agent_id, version } = getArgs.parse(args)
        if (
          version &&
          agent_id.includes('@') &&
          !agent_id.endsWith(`@${version}`)
        )
          throw new Error('Conflicting version selectors')
        const agent = await resolve(
          version && !agent_id.includes('@')
            ? `${agent_id}@${version}`
            : agent_id,
        )
        const originsMap =
          typeof origins === 'function' ? await origins() : origins
        const originApp = originsMap[`${agent.id}@${agent.version}`]
        return jsonResult({
          notice: BLUEPRINT_NOTICE,
          agent,
          blueprint: renderBlueprint(agent),
          portability: createPortabilityBlock(agent, originApp),
        })
      }
      throw new Error(`Unknown tool: ${name}`)
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: error instanceof Error ? error.message : String(error),
          },
        ],
      }
    }
  })

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [{ name: GUIDE_NAME, description: guideDescription }],
  }))
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== GUIDE_NAME)
      throw new McpError(ErrorCode.InvalidParams, 'Unknown prompt')
    return {
      description: guideDescription,
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: guideText },
        },
      ],
    }
  })

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: GUIDE_URI,
        name: GUIDE_NAME,
        description: guideDescription,
        mimeType: 'text/markdown',
      },
    ],
  }))
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== GUIDE_URI)
      throw new McpError(ErrorCode.InvalidParams, 'Unknown resource')
    return {
      contents: [
        { uri: GUIDE_URI, mimeType: 'text/markdown', text: guideText },
      ],
    }
  })

  return server
}
