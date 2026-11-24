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
  'In 10 to 15 minutes, connect AgentLemon to your AI and make your first agent and skill.'

/** The promise, as short bullets for the top of the page. */
export const ACADEMY_PROMISE: readonly string[] = [
  'Connect AgentLemon to your AI so you can stop copying and pasting between apps.',
  'Learn what agents and skills are by trying one of each.',
  'Make and save a simple agent and skill of your own.',
]

export const ACADEMY_STEPS: readonly AcademyStep[] = [
  {
    id: 'what',
    title: 'Meet AgentLemon',
    minutes: 1,
    body: [
      'AgentLemon is a library of ready-made helpers for your AI. It’s also a place to keep the helpers you make.',
      'You use them right inside the AI you already use or pay for. Your AI does the work, and AgentLemon keeps the instructions handy.',
    ],
  },
  {
    id: 'connect',
    title: 'Connect AgentLemon to your AI',
    minutes: 3,
    body: [
      'A connector lets your AI talk to AgentLemon. Copy the account link below so your AI can find helpers and save the ones you make. Once it’s set up, ask your AI, “Am I signed in to AgentLemon?”',
      'On claude.ai or in the Claude app, look for Connectors in Settings or under Customize. Choose + Add, then Add custom connector. Name it AgentLemon. Paste the link. Finish adding it, then choose Connect to sign in. If you see Sign in now during setup, you can sign in there.',
      'In ChatGPT on the web, open Plugins. Choose +, then Add custom MCP server. Name it AgentLemon and paste the link under Connection. Choose OAuth for sign-in. Review the notice, then choose Create as a plugin. Sign in to AgentLemon when asked. You may need help from the person who manages your workspace.',
      'If ChatGPT still shows Apps, go to Apps in Settings or Workspace settings. Choose Create. Paste the link. Choose OAuth, then Scan Tools. Sign in to AgentLemon. Choose Create.',
      'In other apps, look for Connectors in Settings. Some apps only allow custom connectors on paid plans. Claude’s free plan allows one.',
    ],
    copy: { label: 'Copy the connection link', text: ACADEMY_CONNECTOR_URL },
  },
  {
    id: 'agent',
    title: 'Try an agent',
    minutes: 2,
    body: [
      'An agent is a ready-made set of instructions that helps your AI act like a specialist for one job. A story editor, for example, can spot details that change from one scene to the next.',
      'Paste the prompt below into your chat. Your AI searches AgentLemon, picks an agent, and follows its instructions on the example.',
    ],
    copy: {
      label: 'Copy the agent prompt',
      text: 'Use AgentLemon to find and use the Story Continuity Editor. In my story, Jo has only one key. Check just these two scenes: Jo loses her key in scene one. In scene two, she opens the door with it. Tell me what needs fixing and suggest one small change.',
    },
  },
  {
    id: 'skill',
    title: 'Try a skill',
    minutes: 2,
    body: [
      'A skill is a short how-to your AI can follow. A meeting notes skill can turn messy notes into a tidy summary.',
      'An agent gives your AI a role, and a skill gives it steps for a specific task. Try this skill on a few made-up notes.',
    ],
    copy: {
      label: 'Copy the skill prompt',
      text: 'Use AgentLemon to find the Meeting Notes Cleanup skill (meeting-notes-cleanup). Follow it with these notes: Sam will send the draft on Friday. Lee will check the dates. We still need to pick a room.',
    },
  },
  {
    id: 'make-skill',
    title: 'Make your first skill',
    minutes: 2,
    body: [
      'Think of a small task your AI just helped you with. You can save your own version of the steps so you can use them again.',
      'Try the prompt below in the same chat. Your skill is saved privately, where only you can see it. You’ll find it under My items.',
    ],
    copy: {
      label: 'Copy the make-a-skill prompt',
      text: 'Turn what we just did into a short skill called My Meeting Recap. Give it steps for pulling out decisions, to-dos, and open questions. Show me the steps, then save it to my AgentLemon when I say yes.',
    },
    link: { label: 'My items', to: '/me' },
  },
  {
    id: 'make-agent',
    title: 'Make your first agent',
    minutes: 2,
    body: [
      'Pick one job you’d like a specialist to do again. Give your AI a role and tell it what a good result looks like.',
      'Try the prompt below to make a story editor of your own. Your agent is saved privately, where only you can see it. Look for it under My items.',
    ],
    copy: {
      label: 'Copy the make-an-agent prompt',
      text: 'Turn our story check into a simple agent called My Story Checker. It should find one detail that doesn’t line up, point to the two lines, and suggest one small fix. Show me its instructions, then save it to my AgentLemon when I say yes.',
    },
    link: { label: 'My items', to: '/me' },
  },
  {
    id: 'next',
    title: 'Keep going',
    minutes: 1,
    body: [
      'From any AI app connected to your AgentLemon account, ask for one of your saved items by name.',
      'Open My items to share with friends or ask to make something public. AgentLemon reviews it before it appears in the public library.',
      'Want to try another helper? See the agents and skills picked for you.',
    ],
    link: { label: 'Agents and skills picked for you', to: '/suggestions' },
  },
]

/** Total minutes, from the steps. */
export function academyMinutes(): number {
  return ACADEMY_STEPS.reduce((sum, step) => sum + step.minutes, 0)
}

/** The one prompt the learner pastes into their AI before connecting. */
export function academyTutorPrompt(): string {
  return [
    'Open by saying “AI made simple: the AgentLemon Academy”. Be my patient tutor. Use short sentences and everyday words. Give me one action at a time and wait for me to say I’m done before moving on. Use only features you can confirm AgentLemon has.',
    `1. Connect. Ask which AI app I’m using. A connector lets this app talk to AgentLemon. Help me copy the account link from https://agentlemon.web.app/academy or give me this link: ${ACADEMY_CONNECTOR_URL}. Walk me through adding it and signing in. In Claude, look for Connectors in Settings or Customize, choose + Add, then Add custom connector. In ChatGPT on the web, open Plugins, choose +, then pick the option to add a custom server. A server is what the app connects to. If my workspace uses Apps, use Apps → Create. Choose OAuth, the account sign-in option, if asked. If the menus differ, look for Connectors in Settings. If needed, help me turn on the connector in this chat. Then call account_status. If it asks me to connect, wait while I sign in and check again. If a tool is missing, setup is incomplete for this chat. Return here and check that the account link is enabled and the app allows the action. If this app can’t save items, suggest continuing in Claude.`,
    '2. Try an agent. Explain that an agent helps my AI act like a specialist. Call search_registry to find Story Continuity Editor, then call get_agent to read its instructions. Use it on this example, treating the lost key as the only established fact and checking only these two scenes: Jo loses her only key in scene one and opens a door with it in scene two. Show me one small fix and wait.',
    '3. Try a skill. Explain that a skill gives my AI steps for a specific task. Call search_skills to find Meeting Notes Cleanup (meeting-notes-cleanup), then call get_skill to read it. Use it on these notes: Sam will send the draft Friday. We still need to pick a room. Show me the recap and wait.',
    '4. Make a skill. Help me make a short how-to from the recap we just tried. Ask me to name it. Show me the instructions and ask if I want to save them. When I say yes, call save_skill to save it privately. Tell me when it’s saved and wait.',
    '5. Make an agent. Help me make a specialist for one small job, like checking a story for details that don’t line up. Show me its name and instructions and ask if I want to save it. When I say yes, call save_agent to save it privately. Confirm it saved. After I say I’m done, call list_my_items to show the two new items and point me to My items at https://agentlemon.web.app/me. Follow any additional pages until you find both.',
    'If a save fails, explain the reason in plain words. Saving requires signing in to AgentLemon, confirming my email, choosing a username, and allowing the app to save. If the item is too big, help me shorten it. Agents and skills can be up to 200 KB each, and each skill file can be up to 100 KB. Ask before trying again. Only say an item was saved after the save succeeds.',
  ].join('\n\n')
}
