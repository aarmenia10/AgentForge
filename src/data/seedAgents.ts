import type { AgentManifest } from '@/types/agent'

/**
 * Minimal seed catalog: one agent per category, enough to exercise every UI
 * state. Authors and stats are placeholders, not real listings.
 * TODO(codex): expand to a full seed set and move it to `public/catalog.json`.
 */
export const SEED_AGENTS: readonly AgentManifest[] = [
  {
    id: 'pr-sentinel',
    name: 'PR Sentinel',
    version: '1.4.0',
    description:
      'Reviews pull requests for correctness bugs, missing tests, and risky migrations, then posts a ranked list of findings with suggested patches.',
    author: { name: 'Forge Labs', github: 'forge-labs', verified: true },
    tags: ['coding', 'review', 'sec'],
    framework: 'mcp_native',
    tools_required: [
      {
        name: 'github.get_pull_request_diff',
        type: 'mcp_tool',
        endpoint: 'npx -y @modelcontextprotocol/server-github',
        description: 'Fetches the unified diff and changed-file list for a PR.',
      },
      {
        name: 'github.create_review_comment',
        type: 'mcp_tool',
        endpoint: 'npx -y @modelcontextprotocol/server-github',
        description: 'Posts inline findings on the exact changed lines.',
      },
    ],
    input_schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['repo', 'pull_number'],
      properties: {
        repo: { type: 'string', description: 'owner/name of the repository.' },
        pull_number: { type: 'integer', description: 'Pull request number.' },
        severity_floor: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Drop findings below this severity.',
        },
      },
    },
    output_schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['verdict', 'findings'],
      properties: {
        verdict: { type: 'string', enum: ['approve', 'comment', 'request_changes'] },
        findings: {
          type: 'array',
          description: 'Ranked most severe first.',
          items: { type: 'object' },
        },
      },
    },
    prompt_blueprint: {
      system_prompt:
        'You are a staff engineer reviewing a pull request. Report only defects you can tie to a specific changed line.',
      instructions: [
        'Fetch the diff and list every changed file.',
        'Trace each changed function to its callers before judging it.',
        'For each defect, write the concrete input that triggers it.',
        'Rank findings by severity and drop anything below the floor.',
      ],
      verification_rules: [
        'Every finding cites a file path and line present in the diff.',
        'No finding is purely stylistic.',
      ],
    },
    stats: { stars: 2840, views: 51200, updated_at: '2026-11-02T10:00:00Z' },
  },
  {
    id: 'sec-filing-analyst',
    name: 'SEC Filing Analyst',
    version: '2.1.3',
    description:
      'Pulls 10-K and 10-Q filings from EDGAR, extracts segment financials and risk-factor changes, and writes a sourced variance memo.',
    author: { name: 'Ledgerline', github: 'ledgerline', verified: true },
    tags: ['finance', 'sec', 'research'],
    framework: 'langchain',
    tools_required: [
      {
        name: 'edgar_fetch_filing',
        type: 'rest_api',
        endpoint: 'https://data.sec.gov/submissions/',
        description: 'Downloads filings and XBRL facts by CIK and form type.',
      },
      {
        name: 'compute_variance',
        type: 'python_function',
        description: 'Period-over-period deltas with unit normalization.',
      },
      {
        name: 'filesystem.write_file',
        type: 'mcp_tool',
        endpoint: 'npx -y @modelcontextprotocol/server-filesystem',
        description: 'Saves the finished memo locally.',
      },
    ],
    input_schema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string', description: 'Exchange ticker, e.g. MSFT.' },
        form: { type: 'string', enum: ['10-K', '10-Q'], default: '10-K' },
        periods: { type: 'integer', minimum: 2, maximum: 8, description: 'Filings to compare.' },
      },
    },
    output_schema: {
      type: 'object',
      required: ['memo_markdown', 'citations'],
      properties: {
        memo_markdown: { type: 'string', description: 'The variance memo.' },
        citations: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
          description: 'EDGAR URLs backing each figure.',
        },
      },
    },
    prompt_blueprint: {
      system_prompt:
        'You are a buy-side analyst. Every number you state must trace to a filed document.',
      instructions: [
        'Resolve the ticker to a CIK and fetch the requested filings.',
        'Extract segment revenue, operating income, and cash flow facts.',
        'Compute period-over-period variances.',
        'Diff the risk-factor sections and summarize material changes.',
      ],
      verification_rules: [
        'Each figure carries an EDGAR citation.',
        'Variances reconcile to the reported totals within rounding.',
      ],
    },
    stats: { stars: 1915, views: 38400, updated_at: '2026-10-21T15:30:00Z' },
  },
  {
    id: 'deep-research-crew',
    name: 'Deep Research Crew',
    version: '0.9.2',
    description:
      'A planner, two searchers, and a skeptic that turn one question into a cited brief, with contradicting sources surfaced instead of buried.',
    author: { name: 'Mara Okafor', github: 'maraokafor', verified: false },
    tags: ['research', 'writing'],
    framework: 'crewai',
    tools_required: [
      {
        name: 'web_search',
        type: 'mcp_tool',
        endpoint: 'npx -y @modelcontextprotocol/server-brave-search',
        description: 'Runs the search queries the planner produces.',
      },
      {
        name: 'fetch.get',
        type: 'mcp_tool',
        endpoint: 'uvx mcp-server-fetch',
        description: 'Retrieves full page text for the skeptic to check.',
      },
    ],
    input_schema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string', description: 'The research question.' },
        depth: { type: 'string', enum: ['quick', 'standard', 'exhaustive'] },
      },
    },
    output_schema: {
      type: 'object',
      required: ['brief', 'sources'],
      properties: {
        brief: { type: 'string' },
        sources: { type: 'array', items: { type: 'object' } },
        open_questions: { type: 'array', items: { type: 'string' } },
      },
    },
    prompt_blueprint: {
      system_prompt:
        'You coordinate a research crew. Prefer primary sources and state disagreement plainly.',
      instructions: [
        'Break the question into sub-questions.',
        'Search each sub-question from two independent angles.',
        'Have the skeptic try to falsify each claim against the full source text.',
        'Write the brief, keeping only claims that survived.',
      ],
      verification_rules: [
        'Each claim has at least one fetched source.',
        'Conflicting sources are listed, not resolved silently.',
      ],
    },
    stats: { stars: 3320, views: 44100, updated_at: '2026-11-08T08:15:00Z' },
  },
  {
    id: 'incident-commander',
    name: 'Incident Commander',
    version: '1.0.5',
    description:
      'Correlates alerts, recent deploys, and logs into a probable-cause timeline, then drafts the rollback plan and the status-page update.',
    author: { name: 'Uptime Guild', github: 'uptime-guild', verified: true },
    tags: ['devops', 'sre', 'ops'],
    framework: 'autogen',
    tools_required: [
      {
        name: 'kubectl_get',
        type: 'mcp_tool',
        endpoint: 'npx -y mcp-server-kubernetes',
        description: 'Read-only cluster state and rollout history.',
      },
      {
        name: 'query_logs',
        type: 'rest_api',
        endpoint: 'https://logs.example.com/api/v1/query',
        description: 'Time-bounded log search.',
      },
    ],
    input_schema: {
      type: 'object',
      required: ['service', 'started_at'],
      properties: {
        service: { type: 'string' },
        started_at: { type: 'string', format: 'date-time' },
        environment: { type: 'string', enum: ['staging', 'production'] },
      },
    },
    output_schema: {
      type: 'object',
      required: ['timeline', 'probable_cause'],
      properties: {
        timeline: { type: 'array', items: { type: 'object' } },
        probable_cause: { type: 'string' },
        rollback_plan: { type: 'array', items: { type: 'string' } },
      },
    },
    prompt_blueprint: {
      system_prompt: 'You are the incident commander. Read-only until a human approves a change.',
      instructions: [
        'List deploys and config changes in the hour before the incident.',
        'Pull error-rate and latency logs for the same window.',
        'Order events into a timeline and name the most probable cause.',
        'Draft a rollback plan with the exact commands.',
      ],
      verification_rules: [
        'No mutating command is executed.',
        'The probable cause precedes the first alert in the timeline.',
      ],
    },
    stats: { stars: 1260, views: 19800, updated_at: '2026-09-30T19:45:00Z' },
  },
  {
    id: 'inbox-zero-operator',
    name: 'Inbox Zero Operator',
    version: '0.6.0',
    description:
      'Triages a shared support inbox: labels by intent, drafts replies from the knowledge base, and escalates anything involving refunds or legal.',
    author: { name: 'Jonas Reyes', github: 'jreyes-dev', verified: false },
    tags: ['ops', 'support'],
    framework: 'custom',
    tools_required: [
      {
        name: 'gmail.search_threads',
        type: 'mcp_tool',
        endpoint: 'https://gmail.mcp.example.com/mcp',
        description: 'Lists unread threads in the shared inbox.',
      },
    ],
    input_schema: {
      type: 'object',
      properties: {
        max_threads: { type: 'integer', default: 25 },
        escalation_keywords: { type: 'array', items: { type: 'string' } },
      },
    },
    output_schema: {
      type: 'object',
      required: ['triaged'],
      properties: {
        triaged: { type: 'array', items: { type: 'object' } },
        escalated: { type: 'array', items: { type: 'string' } },
      },
    },
    prompt_blueprint: {
      system_prompt: 'You triage support email. You draft replies and never send them.',
      instructions: [
        'Fetch unread threads, oldest first.',
        'Classify each thread by intent.',
        'Draft a reply from the knowledge base or mark it for escalation.',
      ],
      verification_rules: ['No email is sent.', 'Refund and legal threads are always escalated.'],
    },
    stats: { stars: 640, views: 9300, updated_at: '2026-11-10T12:00:00Z' },
  },
  {
    id: 'storyboard-smith',
    name: 'Storyboard Smith',
    version: '1.2.1',
    description:
      'Turns a one-line product idea into a shot-by-shot storyboard with scene descriptions, voiceover, and image prompts for each frame.',
    author: { name: 'Kiln Studio', github: 'kiln-studio', verified: true },
    tags: ['creative', 'video', 'writing'],
    framework: 'mcp_native',
    tools_required: [],
    input_schema: {
      type: 'object',
      required: ['idea'],
      properties: {
        idea: { type: 'string', description: 'The concept in one sentence.' },
        duration_seconds: { type: 'integer', default: 30 },
        tone: { type: 'string', enum: ['playful', 'cinematic', 'documentary'] },
      },
    },
    output_schema: {
      type: 'object',
      required: ['frames'],
      properties: {
        frames: {
          type: 'array',
          description: 'One entry per shot, in order.',
          items: { type: 'object' },
        },
      },
    },
    prompt_blueprint: {
      system_prompt: 'You are a commercial director who thinks in shots, not paragraphs.',
      instructions: [
        'Identify the single emotion the piece should leave.',
        'Split the runtime into shots of two to five seconds.',
        'Write scene, voiceover, and an image prompt for each shot.',
      ],
      verification_rules: ['Shot durations sum to the requested runtime.'],
    },
    stats: { stars: 980, views: 22700, updated_at: '2026-10-05T09:20:00Z' },
  },
]
