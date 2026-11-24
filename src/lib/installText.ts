import type { AgentManifest } from '../types/agent'
import type { CouncilManifest } from '../types/council'
import type { SkillManifest } from '../types/skill'
import type { CouncilItem } from '../services/councilPublic'

export function agentInstallText(agent: AgentManifest): string {
  return [
    `# Agent: ${agent.name} (${agent.id}@${agent.version})`,
    'Follow the blueprint below for my task. Do not invent tool results.',
    agent.description,
    '## System prompt',
    agent.prompt_blueprint.system_prompt,
    '## Instructions',
    ...agent.prompt_blueprint.instructions,
    '## Verification',
    ...agent.prompt_blueprint.verification_rules,
    '## Required tools (only use those available and authorized)',
    JSON.stringify(agent.tools_required, null, 2),
    '## Input contract',
    JSON.stringify(agent.input_schema, null, 2),
    '## Output contract',
    JSON.stringify(agent.output_schema, null, 2),
  ].join('\n\n')
}

export function skillInstallText(
  skill: Pick<SkillManifest, 'id' | 'name' | 'version' | 'files'>,
): string | null {
  if (!skill.files.some((file) => file.path === 'SKILL.md')) return null
  return [
    `# Skill: ${skill.name} (${skill.id}@${skill.version})`,
    'Follow SKILL.md for my task using the bundled files below. Do not run scripts or claim unavailable capabilities without my approval.',
    ...skill.files.map((file) => `## File: ${file.path}\n\n${file.content}`),
  ].join('\n\n')
}

export function councilInstallText(
  council: CouncilManifest,
  items: readonly CouncilItem[],
): string | null {
  const members: string[] = []
  for (const { ref, role, order } of council.members) {
    const match = items.find(
      ({ kind, item }) =>
        kind === ref.kind && item.id === ref.id && item.version === ref.version,
    )
    if (!match) return null
    const text =
      match.kind === 'agent'
        ? agentInstallText(match.item)
        : skillInstallText(match.item)
    if (!text) return null
    members.push(
      `## Stage ${order}: ${role} (${ref.kind}:${ref.id}@${ref.version})\n\n${text}`,
    )
  }
  return [
    `# Council: ${council.name} (${council.id}@${council.version})`,
    council.description,
    'Follow the coordination instructions and exact member versions below for my task. If separate agents cannot run, simulate their roles and explain that limitation.',
    council.instructions,
    ...members,
  ].join('\n\n')
}
