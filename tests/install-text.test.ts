import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEED_AGENTS } from '../src/data/seedAgents'
import {
  agentInstallText,
  councilInstallText,
  skillInstallText,
} from '../src/lib/installText'
import type { CouncilManifest } from '../src/types/council'
import { skill } from './skillFixture'

test('direct agent copy includes the complete blueprint and contracts', () => {
  const agent = SEED_AGENTS[0]
  const text = agentInstallText(agent)
  assert.ok(text.includes(agent.prompt_blueprint.system_prompt))
  for (const instruction of agent.prompt_blueprint.instructions)
    assert.ok(text.includes(instruction))
  for (const rule of agent.prompt_blueprint.verification_rules)
    assert.ok(text.includes(rule))
  assert.ok(text.includes(JSON.stringify(agent.input_schema, null, 2)))
  assert.ok(text.includes(JSON.stringify(agent.output_schema, null, 2)))
})

test('direct skill copy includes every file, not a retrieval command', () => {
  const member = skill({ visibility: 'public' })
  const text = skillInstallText(member)!
  for (const file of member.files) {
    assert.ok(text.includes(file.path))
    assert.ok(text.includes(file.content))
  }
  assert.equal(skillInstallText({ ...member, files: [] }), null)
})

test('direct council copy requires every exact pin and includes coordination', () => {
  const agent = SEED_AGENTS[0]
  const member = skill({ visibility: 'public' })
  const council: CouncilManifest = {
    council_schema_version: 1,
    id: 'test-council',
    version: '1.0.0',
    visibility: 'public',
    author: agent.author,
    name: 'Test council',
    description: 'Review a report.',
    tags: ['writing'],
    stats: { updated_at: agent.stats.updated_at },
    instructions: 'Coordinate the report review.',
    members: [
      {
        ref: { kind: 'agent', id: agent.id, version: agent.version },
        role: 'Reviewer',
        order: 1,
      },
      {
        ref: { kind: 'skill', id: member.id, version: member.version },
        role: 'Writer',
        order: 2,
      },
    ],
  }
  const text = councilInstallText(council, [
    { kind: 'agent', item: agent },
    { kind: 'skill', item: member },
  ])!
  assert.ok(text.includes(council.instructions))
  assert.ok(text.includes(agentInstallText(agent)))
  assert.ok(text.includes(skillInstallText(member)!))
  assert.match(text, /Stage 1: Reviewer/)
  assert.match(text, /Stage 2: Writer/)
  assert.equal(councilInstallText(council, []), null)
  assert.equal(
    councilInstallText(council, [
      { kind: 'agent', item: { ...agent, version: '99.0.0' } },
      { kind: 'skill', item: member },
    ]),
    null,
  )
})
