import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { createSchemaValidator } from '../../../src/lib/validateManifest'
import type { AgentManifest } from '../../../src/types/agent'
import { selectAgent } from './catalog'

const searchArgs = z.strictObject({
  query: z.string().optional(),
  category: z.string().optional(),
})
const switchArgs = z.strictObject({ agent_id: z.string().min(1) })
const jsonResult = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
})
const uri = 'agentforge://active/manifest'

export function renderBlueprint(agent: AgentManifest): string {
  return [
    `Agent: ${agent.id}@${agent.version}`,
    agent.prompt_blueprint.system_prompt,
    'Instructions:',
    ...agent.prompt_blueprint.instructions.map((v, i) => `${i + 1}. ${v}`),
    'Verification rules:',
    ...agent.prompt_blueprint.verification_rules.map((v) => `- ${v}`),
    'Required external capabilities (declarations only; connect these separately):',
    JSON.stringify(agent.tools_required),
    'Input JSON Schema:',
    JSON.stringify(agent.input_schema),
    'Output JSON Schema:',
    JSON.stringify(agent.output_schema),
  ].join('\n')
}

export function createRegistryServer(
  catalog: AgentManifest[],
  selector?: string,
) {
  let active = selector ? selectAgent(catalog, selector) : undefined
  const server = new Server(
    { name: 'agentforge-registry', version: '0.1.0' },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true },
      },
      instructions:
        'Discover workflows with search_registry and load one with switch_agent. The active prompt and manifest describe the current workflow. Agent tools return validated execution briefs for your own model; this server performs no inference and does not execute external tool declarations. switch_agent returns the new blueprint; use it after a switch instead of the initial blueprint.\n' +
        (active ? renderBlueprint(active) : ''),
    },
  )
  const activeAgent = () => {
    if (!active)
      throw new McpError(
        ErrorCode.InvalidParams,
        'No active agent; call switch_agent first',
      )
    return active
  }
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [
      {
        name: 'search_registry',
        description:
          'Search the static catalog by keywords and category tag. Does not query Firestore.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            category: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'switch_agent',
        description:
          'Load an id or exact id@version, return its full blueprint, schemas and external tool requirements, and notify the client of changed prompts/resources/tools.',
        inputSchema: {
          type: 'object',
          properties: { agent_id: { type: 'string' } },
          required: ['agent_id'],
          additionalProperties: false,
        },
      },
    ]
    if (active)
      tools.push({
        name: `agent_${active.id.replaceAll('-', '_')}`,
        description: `Prepare ${active.name}: validates input and returns the workflow for the calling model to carry out. Does not run inference or external tools.`,
        inputSchema: {
          ...active.input_schema,
          type: 'object',
        } as Tool['inputSchema'],
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      })
    return { tools }
  })
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args = {} } = request.params
      if (name === 'search_registry') {
        const { query = '', category } = searchArgs.parse(args)
        const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
        return jsonResult(
          catalog
            .filter(
              (a) =>
                (!category || a.tags.includes(category.toLowerCase())) &&
                terms.every((term) =>
                  `${a.id} ${a.name} ${a.description} ${a.tags.join(' ')}`
                    .toLowerCase()
                    .includes(term),
                ),
            )
            .map((a) => ({
              id: a.id,
              version: a.version,
              name: a.name,
              description: a.description,
              tags: a.tags,
            })),
        )
      }
      if (name === 'switch_agent') {
        const next = selectAgent(catalog, switchArgs.parse(args).agent_id)
        active = next
        await Promise.all([
          server.notification({ method: 'notifications/tools/list_changed' }),
          server.notification({ method: 'notifications/prompts/list_changed' }),
          server.notification({
            method: 'notifications/resources/list_changed',
          }),
        ])
        return jsonResult({ agent: next, blueprint: renderBlueprint(next) })
      }
      const agent = activeAgent()
      if (name !== `agent_${agent.id.replaceAll('-', '_')}`)
        throw new Error(`Unknown or inactive tool: ${name}`)
      const validate = createSchemaValidator().compile(agent.input_schema)
      if (!validate(args))
        throw new Error(
          `Invalid agent input: ${JSON.stringify(validate.errors)}`,
        )
      return jsonResult({
        agent_id: agent.id,
        version: agent.version,
        blueprint: renderBlueprint(agent),
        input: args,
        status: 'ready_for_client_execution',
      })
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text:
              error instanceof Error ? error.message : 'Agent operation failed',
          },
        ],
      }
    }
  })
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: active
      ? [
          {
            name: 'active_agent',
            description: `${active.name} (${active.version}): prompt blueprint, verification rules, and schemas`,
          },
        ]
      : [],
  }))
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== 'active_agent')
      throw new McpError(ErrorCode.InvalidParams, 'Unknown prompt')
    return {
      description: activeAgent().description,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: renderBlueprint(activeAgent()),
          },
        },
      ],
    }
  })
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: active
      ? [
          {
            uri,
            name: `${active.id}@${active.version}`,
            mimeType: 'application/json',
            description:
              'Active manifest including external tool declarations and input/output contracts',
          },
        ]
      : [],
  }))
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== uri)
      throw new McpError(ErrorCode.InvalidParams, 'Unknown resource')
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(activeAgent(), null, 2),
        },
      ],
    }
  })
  return server
}
