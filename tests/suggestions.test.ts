import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeSuggestions } from '../src/lib/suggestions'
import type { AgentManifest } from '../src/types/agent'
import type { SkillIndexEntry } from '../src/types/skill'

function makeAgent(
  id: string,
  tags: string[],
  views = 0,
  stars = 0,
): AgentManifest {
  return {
    schema_version: 2,
    visibility: 'public',
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    description: `Description of ${id}`,
    author: { uid: 'u1', name: 'Author', handle: 'author', verified: true },
    tags,
    framework: 'mcp_native',
    tools_required: [],
    input_schema: { type: 'object' },
    output_schema: { type: 'object' },
    prompt_blueprint: {
      system_prompt: 'prompt',
      instructions: ['do task'],
      verification_rules: ['verify'],
    },
    stats: { stars, views, updated_at: '2026-11-18T00:00:00.000Z' },
  }
}

function makeSkill(
  id: string,
  tags: string[],
  updated_at = '2026-11-18T00:00:00.000Z',
): SkillIndexEntry {
  return {
    skill_schema_version: 1,
    id,
    name: `Skill ${id}`,
    version: '1.0.0',
    description: `Description of skill ${id}`,
    author: { uid: 'u1', name: 'Author', handle: 'author', verified: true },
    tags,
    files: [{ path: 'SKILL.md', kind: 'instructions', bytes: 100 }],
    stats: { updated_at },
  }
}

const SAMPLE_AGENTS: AgentManifest[] = [
  makeAgent('coding-agent', ['coding', 'python'], 100),
  makeAgent('devops-agent', ['devops', 'kubernetes'], 80),
  makeAgent('finance-agent', ['finance', 'stocks'], 50),
  makeAgent('research-agent', ['research', 'papers'], 60),
  makeAgent('creative-agent', ['creative', 'copywriting'], 70),
  makeAgent('ops-agent', ['ops', 'project-management'], 40),
]

const SAMPLE_SKILLS: SkillIndexEntry[] = [
  makeSkill('coding-skill', ['coding'], '2026-11-18T01:00:00.000Z'),
  makeSkill('finance-skill', ['finance'], '2026-11-18T02:00:00.000Z'),
  makeSkill('creative-skill', ['creative'], '2026-11-18T03:00:00.000Z'),
  makeSkill('devops-skill', ['devops'], '2026-11-18T04:00:00.000Z'),
]

test('computeSuggestions with empty preferences falls back to all categories and sorts by popularity', () => {
  const result = computeSuggestions({}, SAMPLE_AGENTS, SAMPLE_SKILLS)
  assert.equal(result.few_matches, false)
  // All sample agents match a category; tie broken by views (coding-agent has 100 views)
  assert.equal(result.agents[0].id, 'coding-agent')
  assert.equal(result.agents.length, 6)
  // Skills tie broken by updated_at (devops-skill is newest)
  assert.equal(result.skills[0].id, 'devops-skill')
})

test('computeSuggestions maps work_role Software to coding and devops', () => {
  const result = computeSuggestions(
    { work_role: 'Software' },
    SAMPLE_AGENTS,
    SAMPLE_SKILLS,
  )
  const topAgentIds = result.agents.slice(0, 2).map((a) => a.id)
  assert.ok(topAgentIds.includes('coding-agent'))
  assert.ok(topAgentIds.includes('devops-agent'))
})

test('computeSuggestions maps work_role Data or finance to finance', () => {
  const result = computeSuggestions(
    { work_role: 'Data or finance' },
    SAMPLE_AGENTS,
    SAMPLE_SKILLS,
  )
  assert.equal(result.agents[0].id, 'finance-agent')
  assert.equal(result.skills[0].id, 'finance-skill')
})

test('computeSuggestions maps use_for answers to their categories', () => {
  const schoolResult = computeSuggestions(
    { use_for: ['School'] },
    SAMPLE_AGENTS,
    SAMPLE_SKILLS,
  )
  const schoolAgentIds = schoolResult.agents.slice(0, 2).map((a) => a.id)
  assert.ok(schoolAgentIds.includes('research-agent'))
  assert.ok(schoolAgentIds.includes('creative-agent'))
  assert.equal(schoolResult.skills[0].id, 'creative-skill')

  const codingResult = computeSuggestions(
    { use_for: ['Coding projects'] },
    SAMPLE_AGENTS,
    SAMPLE_SKILLS,
  )
  const codingAgentIds = codingResult.agents.slice(0, 2).map((a) => a.id)
  assert.ok(codingAgentIds.includes('coding-agent'))
  assert.ok(codingAgentIds.includes('devops-agent'))
})

test('computeSuggestions still maps legacy work_role answers', () => {
  const result = computeSuggestions(
    { work_role: 'Data or finance' },
    SAMPLE_AGENTS,
    SAMPLE_SKILLS,
  )
  assert.equal(result.agents[0].id, 'finance-agent')
  assert.equal(result.skills[0].id, 'finance-skill')
})

test('computeSuggestions maps help_topics Coding and Writing to coding and creative', () => {
  const result = computeSuggestions(
    { help_topics: ['Coding', 'Writing'] },
    SAMPLE_AGENTS,
    SAMPLE_SKILLS,
  )
  const topAgentIds = result.agents.slice(0, 2).map((a) => a.id)
  assert.ok(topAgentIds.includes('coding-agent'))
  assert.ok(topAgentIds.includes('creative-agent'))
})

test('computeSuggestions flags few_matches when total matches are less than 5', () => {
  const fewAgents = [makeAgent('single-agent', ['coding'], 10)]
  const fewSkills = [makeSkill('single-skill', ['coding'])]
  const result = computeSuggestions(
    { work_role: 'Software' },
    fewAgents,
    fewSkills,
  )
  assert.equal(result.few_matches, true)
  assert.equal(result.agents.length, 1)
  assert.equal(result.skills.length, 1)
})

test('computeSuggestions caps returned agents and skills to 20', () => {
  const manyAgents = Array.from({ length: 30 }, (_, i) =>
    makeAgent(`agent-${i}`, ['coding'], i),
  )
  const manySkills = Array.from({ length: 30 }, (_, i) =>
    makeSkill(
      `skill-${i}`,
      ['coding'],
      `2026-11-18T00:${i.toString().padStart(2, '0')}:00.000Z`,
    ),
  )
  const result = computeSuggestions(
    { help_topics: ['Coding'] },
    manyAgents,
    manySkills,
  )
  assert.equal(result.agents.length, 20)
  assert.equal(result.skills.length, 20)
  assert.equal(result.few_matches, false)
})

test('computeSuggestions handles arbitrary Other text answers gracefully', () => {
  const result = computeSuggestions(
    {
      work_role: 'Architect / Space engineer',
      goals: ['Explore new possibilities'],
      ai_apps: ['Custom CLI tool'],
      help_topics: ['Quantum computing'],
    },
    SAMPLE_AGENTS,
    SAMPLE_SKILLS,
  )
  // When no category matches, falls back safely to all categories
  assert.ok(result.agents.length > 0)
  assert.ok(result.skills.length > 0)
})

test('changing answers changes which agents are suggested, not just their order', () => {
  const agents = [
    makeAgent('code-a', ['coding']),
    makeAgent('money-b', ['finance']),
    makeAgent('story-c', ['creative']),
  ]
  const coding = computeSuggestions(
    { use_for: ['Coding projects'] },
    agents,
    [],
  )
  const writing = computeSuggestions({ use_for: ['Writing'] }, agents, [])
  assert.deepEqual(
    coding.agents.map((a) => a.id),
    ['code-a'],
  )
  assert.deepEqual(
    writing.agents.map((a) => a.id),
    ['story-c'],
  )
  assert.equal(coding.few_matches, true)
})
