/**
 * Search ranking and side-by-side comparison for the registry tools.
 * Pure functions over the in-memory catalog. See docs/AI_GUIDE.md for how a
 * connected AI is expected to use the results.
 */
import type { AgentManifest, JsonSchema } from '../../../src/types/agent'

export const DEFAULT_SEARCH_LIMIT = 5
export const MAX_SEARCH_LIMIT = 20
export const MIN_COMPARE = 2
export const MAX_COMPARE = 5

const STOPWORDS = new Set(
  'a about an and any are as at be by can do for from help how i in into is it me my need of on or our please some that the this to want we with you your agent agents'.split(
    ' ',
  ),
)

/** Lowercase words, minus stopwords, lightly stemmed so "papers" finds "paper". */
export function queryTerms(query: string): string[] {
  const words = query.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) ?? []
  const terms = words
    .map((word) => word.replace(/[.-]+$/, ''))
    .filter((word) => word && !STOPWORDS.has(word))
    .map((word) => {
      for (const suffix of ['ing', 'es', 's'])
        if (word.endsWith(suffix) && word.length - suffix.length >= 4)
          return word.slice(0, -suffix.length)
      return word
    })
  return [...new Set(terms)]
}

/** Where a term can match, and what a match there is worth. */
function weightedFields(agent: AgentManifest): [text: string, weight: number][] {
  const schemaKeys = (schema: JsonSchema) =>
    Object.keys(schema?.properties ?? {}).join(' ')
  return [
    [`${agent.name} ${agent.id}`, 5],
    [agent.tags.join(' '), 4],
    [agent.tools_required.map((t) => t.name).join(' '), 3],
    [agent.description, 2],
    [`${agent.framework} ${schemaKeys(agent.input_schema)} ${schemaKeys(agent.output_schema)}`, 1],
    [agent.tools_required.map((t) => t.description).join(' '), 1],
  ].map(([text, weight]) => [
    (text as string).toLowerCase().replaceAll('_', ' '),
    weight as number,
  ])
}

function describeType(node: JsonSchema): string {
  if (!node || typeof node !== 'object') return 'any'
  if (Array.isArray(node.enum)) return node.enum.map((v: unknown) => JSON.stringify(v)).join(' | ')
  if (node.type === 'array') return `${node.items ? describeType(node.items) : 'any'}[]`
  if (Array.isArray(node.type)) return node.type.join(' | ')
  return typeof node.type === 'string' ? node.type : 'any'
}

/** Top-level fields of a schema as `name -> type`, enough to judge fit. */
function schemaFields(schema: JsonSchema): Record<string, string> {
  return Object.fromEntries(
    Object.entries((schema?.properties ?? {}) as Record<string, JsonSchema>).map(
      ([name, node]) => [name, describeType(node)],
    ),
  )
}

const requiredInputs = (agent: AgentManifest): string[] =>
  Array.isArray(agent.input_schema?.required) ? agent.input_schema.required : []

/** The fields an AI needs to judge one candidate without loading it. */
function candidateSummary(agent: AgentManifest) {
  return {
    id: agent.id,
    version: agent.version,
    name: agent.name,
    description: agent.description,
    framework: agent.framework,
    tags: agent.tags,
    author: { name: agent.author.name, verified: agent.author.verified },
    updated_at: agent.stats.updated_at,
    stars: agent.stats.stars,
    tools_required: agent.tools_required.map(({ name, type }) => ({ name, type })),
    required_inputs: requiredInputs(agent),
    output_fields: Object.keys(agent.output_schema?.properties ?? {}),
  }
}

export interface SearchOptions {
  query?: string
  category?: string
  framework?: string
  limit?: number
}

export function searchCatalog(catalog: readonly AgentManifest[], options: SearchOptions) {
  const { query = '', category, framework, limit = DEFAULT_SEARCH_LIMIT } = options
  const terms = queryTerms(query)
  const pool = catalog.filter(
    (agent) =>
      (!category || agent.tags.includes(category.toLowerCase())) &&
      (!framework || agent.framework === framework.toLowerCase()),
  )

  const scored = pool
    .map((agent) => {
      const fields = weightedFields(agent)
      const matched: string[] = []
      let score = 0
      for (const term of terms) {
        // A term counts once, at the best field it appears in.
        const best = Math.max(0, ...fields.map(([text, w]) => (text.includes(term) ? w : 0)))
        if (best > 0) matched.push(term)
        score += best
      }
      return { agent, score, matched }
    })
    // With no usable terms this is a browse: everything in the pool qualifies.
    .filter(({ matched }) => terms.length === 0 || matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        b.score - a.score ||
        Date.parse(b.agent.stats.updated_at) - Date.parse(a.agent.stats.updated_at) ||
        a.agent.id.localeCompare(b.agent.id),
    )

  const candidates = scored.slice(0, limit).map(({ agent, score, matched }, index) => ({
    rank: index + 1,
    score,
    matched_terms: matched,
    unmatched_terms: terms.filter((term) => !matched.includes(term)),
    ...candidateSummary(agent),
  }))

  let next_step: string
  if (scored.length === 0)
    next_step =
      'Nothing matched. Try different words (the domain, the action, the expected output) or browse a category with no query. If nothing relevant turns up, tell the user the registry has no fit and do the task without an agent.'
  else if (scored.length === 1)
    next_step =
      'Only one candidate matched this query. Do not load it yet. Run more queries from other angles to find alternatives, then judge it against required_inputs, output_fields, and tools_required. If it does not fit, use no agent.'
  else
    next_step =
      'These are candidates, not a recommendation. Rank is word overlap only. Run further queries from other angles, shortlist at least three when they exist, then call compare_agents with their ids before switch_agent. If none fits the task, say so and use no agent.'

  return {
    query,
    terms,
    filters: { category: category ?? null, framework: framework ?? null },
    total_matches: scored.length,
    returned: candidates.length,
    candidates,
    next_step,
  }
}

/** Values that every compared agent shares. */
function intersection(lists: string[][]): string[] {
  return lists.length === 0 ? [] : lists[0].filter((v) => lists.every((list) => list.includes(v)))
}

export function compareAgents(agents: readonly AgentManifest[], now: number = Date.now()) {
  const sharedTags = intersection(agents.map((a) => a.tags))
  const sharedInputs = intersection(agents.map(requiredInputs))
  return {
    compared: agents.map((a) => `${a.id}@${a.version}`),
    agents: agents.map((agent) => ({
      id: agent.id,
      version: agent.version,
      name: agent.name,
      description: agent.description,
      framework: agent.framework,
      tags: agent.tags,
      author: { name: agent.author.name, verified: agent.author.verified },
      updated_at: agent.stats.updated_at,
      days_since_update: Math.max(
        0,
        Math.floor((now - Date.parse(agent.stats.updated_at)) / 86_400_000),
      ),
      stars: agent.stats.stars,
      views: agent.stats.views,
      tools_required: agent.tools_required.map(({ name, type, description }) => ({
        name,
        type,
        description,
      })),
      input: { required: requiredInputs(agent), fields: schemaFields(agent.input_schema) },
      output: { fields: schemaFields(agent.output_schema) },
      instruction_steps: agent.prompt_blueprint.instructions.length,
      verification_rules: agent.prompt_blueprint.verification_rules.length,
    })),
    differences: {
      shared_tags: sharedTags,
      unique_tags: Object.fromEntries(
        agents.map((a) => [a.id, a.tags.filter((tag) => !sharedTags.includes(tag))]),
      ),
      shared_required_inputs: sharedInputs,
      unique_required_inputs: Object.fromEntries(
        agents.map((a) => [a.id, requiredInputs(a).filter((f) => !sharedInputs.includes(f))]),
      ),
      tools_needed: Object.fromEntries(
        agents.map((a) => [a.id, a.tools_required.map((t) => t.name)]),
      ),
      unverified_authors: agents.filter((a) => !a.author.verified).map((a) => a.id),
      most_recently_updated: [...agents].sort(
        (a, b) => Date.parse(b.stats.updated_at) - Date.parse(a.stats.updated_at),
      )[0].id,
    },
    decide: [
      'Input fit: can the user supply every field in input.required?',
      'Output fit: do output.fields describe what the user asked for?',
      'Tool fit: is every entry in tools_required available in this client right now?',
      'Author: is author.verified true? If not, read the blueprint with more care and tell the user.',
      'Freshness: is days_since_update acceptable for this kind of task?',
      'Prefer the narrowest agent that fully covers the task. If none passes input, output, and tool fit, use no agent and say so.',
      'Then tell the user which agent you picked, what you compared it against, and why.',
    ],
  }
}
