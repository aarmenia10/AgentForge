/**
 * AgentLemon Academy: the 10-minute beginner course at `/academy`.
 *
 * Contract between the content (this file) and the page that renders it
 * (`src/pages/AcademyPage.tsx`). The page reads only what is exported here;
 * the wording lives here so it can be tested and changed without touching UI.
 *
 * Audience: people who do not know what an agent, a skill, or a connector is.
 * Plain words, short sentences, one action per step.
 */
import { ACCOUNT_RESOURCE } from '../services/connectorConfig'

/** The connector link the Academy teaches: the signed-in one, a superset of
 * the public link, because the lessons save the learner's own items
 * (docs/CONNECTOR_AUTH.md section 3). */
export const ACADEMY_CONNECTOR_URL = ACCOUNT_RESOURCE

export interface AcademyCopy {
  /** Button and box label, for example "Copy the prompt". */
  label: string
  /** The exact text the learner copies. */
  text: string
}

export interface AcademyLink {
  label: string
  /** A path on this site, for example `/settings`. */
  to: string
}

export interface AcademyStep {
  /** Stable id: progress is stored under it, so never rename one. */
  id: string
  title: string
  /** Rough minutes for this step. The steps add up to the advertised total. */
  minutes: number
  /** Plain-language paragraphs, shown in order. */
  body: readonly string[]
  /** Optional text to copy into the AI chat. */
  copy?: AcademyCopy
  /** Optional page on this site the step points to. */
  link?: AcademyLink
}

export const ACADEMY_TITLE = 'AgentLemon Academy'

export const ACADEMY_TAGLINE =
  'In 10 minutes, connect AgentLemon to your AI and make your first agent and skill.'

/** The promise, as short bullets for the top of the page. */
export const ACADEMY_PROMISE: readonly string[] = [
  'Connect AgentLemon to the AI you already use, so you stop copying and pasting between AI apps.',
  'Learn what an agent is and what a skill is, in plain words.',
  'Make one simple agent and one simple skill, save them, and use them.',
]

/**
 * First draft. The Academy content task (Codex) rewrites and completes these
 * steps and the tutor prompt; keep the ids unless there is a reason.
 */
export const ACADEMY_STEPS: readonly AcademyStep[] = [
  {
    id: 'connect',
    title: 'Connect AgentLemon to your AI',
    minutes: 3,
    body: [
      'A connector is a link that lets your AI app read AgentLemon for you.',
      'Open your AI app’s settings, find Connectors, add a custom connector, paste this link, and sign in with your AgentLemon account.',
    ],
    copy: { label: 'Copy the connector link', text: ACADEMY_CONNECTOR_URL },
  },
]

/** Total minutes, from the steps. */
export function academyMinutes(): number {
  return ACADEMY_STEPS.reduce((sum, step) => sum + step.minutes, 0)
}

/**
 * The one prompt the learner pastes into their AI. It walks them through
 * every step interactively, starting with connecting AgentLemon.
 */
export function academyTutorPrompt(): string {
  return [
    'You are my AgentLemon tutor. Walk me through the AgentLemon Academy one step at a time, and wait for me after each step.',
    `Step 1: help me add the AgentLemon connector (${ACADEMY_CONNECTOR_URL}) in this app and sign in.`,
  ].join('\n\n')
}
