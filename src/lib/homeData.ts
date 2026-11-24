/**
 * Loads the three public files for the home page. Loaded with a dynamic
 * `import()` so the schema code stays out of the startup bundle. Static files
 * only: no Firestore read (invariant 3).
 */
import { publicCouncils } from '../services/councilPublic'
import { agentRepository } from './agentRepository'
import type { HomeSources } from './homeFeed'
import { skillRepository } from './skillRepository'

let pending: Promise<HomeSources> | undefined

async function read(): Promise<HomeSources> {
  // One missing or broken file must not hide the others.
  const [agents, skills, councils] = await Promise.allSettled([
    agentRepository.listAgents(),
    skillRepository.listSkills(),
    publicCouncils.list(),
  ])
  return {
    agents: agents.status === 'fulfilled' ? agents.value : [],
    skills:
      skills.status === 'fulfilled' && skills.value.state === 'ready'
        ? skills.value.skills
        : [],
    councils: councils.status === 'fulfilled' ? councils.value : [],
  }
}

/** One load per page session. Returning to the home page is instant. */
export function loadHomeSources(): Promise<HomeSources> {
  pending ??= read()
  return pending
}
