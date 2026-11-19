/**
 * App-specific tool detection and portability adaptation (P3-2).
 *
 * This module is imported by both the local server and the remote connector's
 * Worker runtime. It must remain strictly free of Node APIs, Ajv, and eval.
 */

export type OriginApp = 'claude' | 'chatgpt' | 'other'

export const ORIGIN_APPS: readonly OriginApp[] = ['claude', 'chatgpt', 'other']

/**
 * Read a public origins file defensively: keep only "<id>@<version>" keys
 * whose value is an allowed app. Anything else is dropped, never trusted.
 */
export function parseOrigins(value: unknown): Record<string, OriginApp> {
  const origins: Record<string, OriginApp> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return origins
  for (const [key, app] of Object.entries(value as Record<string, unknown>))
    if (
      /^[a-z0-9]+(-[a-z0-9]+)*@[0-9A-Za-z.+-]{1,64}$/.test(key) &&
      (ORIGIN_APPS as readonly unknown[]).includes(app)
    )
      origins[key] = app as OriginApp
  return origins
}

/**
 * Maps a connector client host name to an allowed OriginApp.
 * claude.ai -> "claude"
 * chatgpt.com -> "chatgpt"
 * anything else -> "other"
 */
export function clientOriginApp(host: string | undefined | null): OriginApp {
  if (!host) return 'other'
  const normalized = host.toLowerCase().trim()
  if (normalized === 'claude.ai' || normalized.endsWith('.claude.ai'))
    return 'claude'
  if (normalized === 'chatgpt.com' || normalized.endsWith('.chatgpt.com'))
    return 'chatgpt'
  return 'other'
}

export interface AppToolPattern {
  name: string
  pattern: RegExp
  description: string
}

/**
 * Conservative allowlist of app-specific tools and environments.
 *
 * Ambiguous terms like "Canvas" must NEVER be flagged alone (as Canvas is also
 * a learning management system, HTML5 canvas, or general design surface).
 * Only unambiguous compound usages like "ChatGPT Canvas" or "OpenAI Canvas" are detected.
 */
export const APP_SPECIFIC_TOOLS: readonly AppToolPattern[] = [
  {
    name: 'Claude in Chrome',
    pattern: /\bclaude\s+in\s+chrome\b/i,
    description: "Anthropic's Chrome browser extension for web automation",
  },
  {
    name: 'Claude Code',
    pattern: /\bclaude\s+code\b/i,
    description: "Anthropic's agentic command-line developer tool",
  },
  {
    name: 'Artifacts',
    pattern: /\b(?:claude\s+)?artifacts?\b/i,
    description:
      "Claude's interactive visual UI and document generation environment",
  },
  {
    name: 'Code Interpreter',
    pattern: /\b(?:chatgpt\s+)?code\s+interpreter\b/i,
    description: "ChatGPT's sandboxed Python execution environment",
  },
  {
    name: 'ChatGPT Data Analysis',
    pattern:
      /\b(?:chatgpt\s+(?:advanced\s+)?data\s+analysis|advanced\s+data\s+analysis)\b/i,
    description: "ChatGPT's Advanced Data Analysis / Python execution tool",
  },
  {
    name: 'Custom GPTs',
    pattern: /\b(?:custom\s+gpts?|gpt\s+store)\b/i,
    description: "OpenAI's tailored custom chat assistant ecosystem",
  },
  {
    name: 'ChatGPT Canvas',
    pattern: /\b(?:chatgpt|openai)\s+canvas\b/i,
    description:
      "OpenAI's interactive document and code editing surface (unambiguous; bare 'canvas' is never flagged)",
  },
  {
    name: 'Gemini',
    pattern:
      /\b(?:google\s+gemini|gemini\s+advanced|gemini\s+extensions?|gemini\s+workspace|gemini\s+live)\b/i,
    description: "Google's Gemini models, workspace extensions, and tools",
  },
  {
    name: 'Deep Research',
    pattern: /\bdeep\s+research\b/i,
    description: 'Autonomous multi-step web research agent',
  },
  {
    name: 'Computer Use',
    pattern: /\bcomputer\s+use\b/i,
    description:
      'Direct OS desktop and screen interaction tool (Anthropic API)',
  },
]

/**
 * Scans text for references to app-specific tools and environments.
 * Returns unique tool names in canonical order.
 */
export function detectAppTools(text: string | null | undefined): string[] {
  if (!text) return []
  const matches: string[] = []
  for (const { name, pattern } of APP_SPECIFIC_TOOLS) {
    if (pattern.test(text)) {
      matches.push(name)
    }
  }
  return matches
}

export const PORTABILITY_NOTE =
  'Items may be written for a specific AI app or tool environment. ' +
  'When executing instructions that reference specific tools, use your own equivalent ' +
  'capabilities and inform the user. If you lack a clear equivalent or a step depends ' +
  'on a tool you do not have, ask the user how to proceed rather than assuming or pretending ' +
  'to have the capability.'

export interface PortabilityBlock {
  origin_app?: OriginApp
  detected_tools: string[]
  note: string
}

/**
 * Extracts searchable text from an agent or skill manifest or record.
 */
export function extractItemText(item: unknown): string {
  if (!item || typeof item !== 'object') return ''
  const parts: string[] = []
  const rec = item as Record<string, unknown>

  if (typeof rec.name === 'string') parts.push(rec.name)
  if (typeof rec.description === 'string') parts.push(rec.description)
  if (rec.prompt_blueprint && typeof rec.prompt_blueprint === 'object') {
    const pb = rec.prompt_blueprint as Record<string, unknown>
    if (typeof pb.system_prompt === 'string') parts.push(pb.system_prompt)
    if (Array.isArray(pb.instructions)) {
      for (const inst of pb.instructions) {
        if (typeof inst === 'string') parts.push(inst)
      }
    }
    if (Array.isArray(pb.verification_rules)) {
      for (const rule of pb.verification_rules) {
        if (typeof rule === 'string') parts.push(rule)
      }
    }
  } else if (typeof rec.prompt_blueprint === 'string') {
    parts.push(rec.prompt_blueprint)
  }
  if (Array.isArray(rec.tools_required)) {
    for (const tool of rec.tools_required) {
      if (typeof tool === 'string') parts.push(tool)
    }
  }
  if (Array.isArray(rec.tags)) {
    for (const tag of rec.tags) {
      if (typeof tag === 'string') parts.push(tag)
    }
  }
  if (Array.isArray(rec.files)) {
    for (const file of rec.files) {
      if (file && typeof file === 'object') {
        const f = file as Record<string, unknown>
        if (typeof f.path === 'string') parts.push(f.path)
        if (typeof f.content === 'string') parts.push(f.content)
      }
    }
  }
  return parts.join('\n')
}

/**
 * Builds a portability block for an agent or skill.
 *
 * @param item - Agent or skill record/manifest, or raw text.
 * @param explicitOrigin - Optional origin_app if known from record or public/origins.json.
 */
export function createPortabilityBlock(
  item: unknown,
  explicitOrigin?: OriginApp | null,
): PortabilityBlock {
  const text = typeof item === 'string' ? item : extractItemText(item)
  const detected = detectAppTools(text)
  const origin: OriginApp | undefined =
    explicitOrigin && ORIGIN_APPS.includes(explicitOrigin)
      ? explicitOrigin
      : typeof item === 'object' &&
          item &&
          'origin_app' in item &&
          typeof (item as Record<string, unknown>).origin_app === 'string' &&
          ORIGIN_APPS.includes(
            (item as Record<string, unknown>).origin_app as OriginApp,
          )
        ? ((item as Record<string, unknown>).origin_app as OriginApp)
        : undefined

  return {
    ...(origin && { origin_app: origin }),
    detected_tools: detected,
    note: PORTABILITY_NOTE,
  }
}

/**
 * Label for private/friends items in "My items".
 * Returns "Saved from Claude" or "Saved from ChatGPT" when origin is known,
 * or "Saved from chat" if saved from chat or other origin.
 */
export function originLabel(
  originApp?: string | null,
  savedFromChat?: boolean,
): string | null {
  if (originApp === 'claude') return 'Saved from Claude'
  if (originApp === 'chatgpt') return 'Saved from ChatGPT'
  if (savedFromChat || originApp) return 'Saved from chat'
  return null
}

/**
 * Quiet line for public agent and skill pages.
 * Only shown when origin is public and known (Claude or ChatGPT).
 */
export function publicOriginLabel(originApp?: string | null): string | null {
  if (originApp === 'claude') return 'Made in Claude'
  if (originApp === 'chatgpt') return 'Made in ChatGPT'
  return null
}

let cachedPublicOrigins: Record<string, OriginApp> | undefined
let pendingOrigins: Promise<Record<string, OriginApp>> | undefined

/**
 * Fetches public/origins.json in the browser.
 */
export async function fetchPublicOrigins(): Promise<Record<string, OriginApp>> {
  if (cachedPublicOrigins) return cachedPublicOrigins
  if (!pendingOrigins) {
    pendingOrigins = (async () => {
      try {
        if (typeof fetch === 'function') {
          const response = await fetch('/origins.json', {
            signal: AbortSignal.timeout(5000),
          })
          if (response.ok) {
            cachedPublicOrigins = (await response.json()) as Record<
              string,
              OriginApp
            >
          }
        }
      } catch {
        // Fall back to empty
      }
      return cachedPublicOrigins ?? {}
    })().finally(() => {
      pendingOrigins = undefined
    })
  }
  return pendingOrigins
}
