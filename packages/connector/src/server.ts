/**
 * The MCP server behind the remote connector. Stateless: one instance is
 * built per request and holds nothing afterwards, so there is no loaded
 * agent, no per-agent tool, and no list-changed notification.
 */
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

export const CONNECTOR_NAME = 'agentforge-connector'
export const CONNECTOR_VERSION = '0.1.0'
const LOAD_TOOL = 'get_agent'
const getArgs = z.strictObject({ agent_id: z.string().min(1) })
const guideText = CONNECTOR_GUIDE_PREFACE + '\n' + REGISTRY_GUIDE
const guideDescription =
  'How the AgentForge registry is laid out and how to choose an agent: search several ways, compare candidates, prefer the narrowest full fit, and use no agent when nothing fits.'

export function createConnectorServer(catalog: readonly AgentManifest[]) {
  const server = new Server(
    { name: CONNECTOR_NAME, version: CONNECTOR_VERSION },
    {
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: CONNECTOR_CONDENSED_GUIDE,
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...discoveryTools(LOAD_TOOL),
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
          },
          required: ['agent_id'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args = {} } = request.params
      const discovery = runDiscoveryTool(catalog, name, args, LOAD_TOOL)
      if (discovery) return discovery
      if (name === LOAD_TOOL) {
        const agent = selectAgent(catalog, getArgs.parse(args).agent_id)
        return jsonResult({
          notice: BLUEPRINT_NOTICE,
          agent,
          blueprint: renderBlueprint(agent),
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
