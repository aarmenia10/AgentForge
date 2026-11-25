/**
 * Self-contained exports (brief prompts/export-fix-worker.md, W6).
 *
 * The cams45 audit found ten problems (F1 to F10) and the orchestrator five
 * more (R1 to R5). Each has a regression test here, named after it. R1
 * (private pins drift) is deferred by decision D4; its demonstration is the
 * emulator test in tests/connector.emulator.ts, and its message is checked
 * below.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
  checkSelfContained,
  inferItemKind,
  MAX_SELF_CONTAINED_WARNINGS,
  type SelfContainedWarning,
} from '../src/lib/selfContained'
import {
  createPortabilityBlock,
  PORTABILITY_NOTE,
} from '../src/lib/portability'
import { prepareChatSave } from '../packages/connector/src/accountTools'
import { createRegistryServer } from '../packages/mcp-server/src/server'
import { hostedSkillReader } from '../packages/mcp-server/src/skills'
import { hostedCouncilReader } from '../packages/mcp-server/src/councils'
import { resolveAgent } from '../packages/mcp-server/src/versions'
import {
  CONDENSED_GUIDE,
  CONNECTOR_CONDENSED_GUIDE,
  REGISTRY_GUIDE,
} from '../packages/mcp-server/src/guide'
import { UNREACHABLE_MESSAGE } from '../packages/mcp-server/src/shared'
import { ACCOUNT_RESOURCE } from '../src/services/connectorConfig'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { validateSkillManifest } from '../src/lib/skillSchema'
import { manifestSchema } from '../src/lib/manifestSchema'
import type { AgentManifest } from '../src/types/agent'
import type { SkillManifest } from '../src/types/skill'
import { skill as fixtureSkill } from './skillFixture'
import {
  accountFixture,
  connectorClient,
  rpc,
  toolBody,
} from './connectorFixture'

const CATALOG_URL = 'https://agentlemon.web.app/catalog.json'

async function fixture(name: string): Promise<SkillManifest> {
  return JSON.parse(await readFile(`tests/fixtures/${name}.json`, 'utf8'))
}
const original = () => fixture('cams45-original')
const selfContained = () => fixture('cams45-selfcontained')
const file = (skill: SkillManifest, path: string) =>
  skill.files.find((f) => f.path === path)!.content
const codes = (warnings: readonly SelfContainedWarning[]) =>
  [...new Set(warnings.map(({ code }) => code))].sort()
const matches = (warnings: readonly SelfContainedWarning[], code: string) =>
  warnings.filter((w) => w.code === code).map((w) => w.match)
const person = { handle: 'test-author', display_name: 'Test Author' }

/* ---------- Fixtures ---------- */

test('fixtures: both cams45 fixtures are valid skills with a fake author and no personal data', async () => {
  for (const item of [await original(), await selfContained()]) {
    const result = validateSkillManifest(item)
    assert.ok(result.ok, JSON.stringify(!result.ok && result.issues))
    assert.deepEqual(item.author, {
      uid: 'test-author-uid',
      name: 'Test Author',
      handle: 'test-author',
      verified: false,
    })
    const text = JSON.stringify(item)
    assert.doesNotMatch(text, /aarmenia|Armenia|@gmail|psu\.instructure/i)
  }
  const skillMd = file(await original(), 'SKILL.md')
  assert.equal(
    (await original()).files.length,
    1,
    'the export carried only SKILL.md',
  )
  // The brief's Appendix A is the same text with blank lines added by a formatter.
  const brief = await readFile('prompts/export-fix-worker.md', 'utf8')
  const start =
    brief.indexOf('```markdown\n', brief.indexOf('## Appendix A')) + 12
  const appendix = brief.slice(start, brief.lastIndexOf('\n```')) + '\n'
  const squash = (text: string) => text.replace(/\n+/g, '\n')
  assert.equal(squash(appendix), squash(skillMd))
  assert.deepEqual(
    (await selfContained()).files.map(({ path }) => path),
    ['SKILL.md', 'format-spec.md', 'example-output.md', 'inputs.md'],
  )
})

/* ---------- F1 to F10 ---------- */

test('F1: an export that depends on an absent project file and "this project" is flagged; the fixed one bundles a format spec, example, and inputs', async () => {
  const warnings = checkSelfContained(await original())
  assert.deepEqual(matches(warnings, 'absent_file'), [
    'CAMS045_L02_Compiled_Reference.docx',
  ])
  assert.ok(matches(warnings, 'hidden_context').includes('this project'))
  assert.ok(matches(warnings, 'hidden_context').includes('we built'))
  const fixed = await selfContained()
  assert.deepEqual(checkSelfContained(fixed), [])
  const spec = file(fixed, 'format-spec.md')
  for (const part of [
    'Title',
    'Subtitle',
    'Heading 1',
    'Heading 2 and Heading 3',
    'block quote',
    'square brackets',
    'Video transcript',
    'Resources Used This Lesson',
    'Compile stamp',
  ])
    assert.ok(spec.includes(part), `format-spec.md lacks ${part}`)
  assert.match(
    file(fixed, 'inputs.md'),
    /Course Modules URL[\s\S]*Lesson number/,
  )
  assert.doesNotMatch(
    JSON.stringify(fixed),
    /already in this project|L02_Compiled_Reference\.docx/,
  )
})

test('F2: the fixed skill reads image descriptions from alt attributes, offers the Canvas pages API, and has a paste fallback', async () => {
  const skillMd = file(await selfContained(), 'SKILL.md')
  assert.match(skillMd, /alt attribute/)
  assert.match(skillMd, /tools\s+that return page text usually drop alt text/)
  assert.match(skillMd, /\/api\/v1\/courses\/123456\/pages\//)
  assert.match(skillMd, /Fallback when you have neither/)
  assert.match(skillMd, /\[No description in Canvas\]/)
})

test('F3: the fixed skill has fidelity rules, and the guide tells exporters to write them', async () => {
  const skillMd = file(await selfContained(), 'SKILL.md')
  for (const rule of [
    /Copy Canvas text verbatim/,
    /Mark any paraphrase/,
    /Label outside material/,
    /Never invent missing parts/,
    /Excellent, Average, Poor/,
    /Flag disagreements between sources/,
  ])
    assert.match(skillMd, rule)
  assert.match(
    REGISTRY_GUIDE,
    /When the workflow extracts text, quote sources verbatim, label paraphrases and outside material/,
  )
})

test('F4: video detection covers pages without a "Video N.N" label', async () => {
  const skillMd = file(await selfContained(), 'SKILL.md')
  assert.match(
    skillMd,
    /decide by page type and content, not by one title pattern/,
  )
  for (const variant of [
    '"Guest Video"',
    '"Video Analysis"',
    'embeds a player',
  ])
    assert.ok(skillMd.includes(variant), variant)
  assert.match(skillMd, /matches\s+neither[\s\S]*ask\s+the user/)
  assert.match(
    REGISTRY_GUIDE,
    /Explain how to handle unfamiliar source patterns/,
  )
})

test('F5: the output spec carries a compile stamp with date, source, and skill version', async () => {
  const fixed = await selfContained()
  assert.match(
    file(fixed, 'format-spec.md'),
    /Compiled YYYY-MM-DD from[\s\S]*skill\s+reference you loaded/,
  )
  assert.match(file(fixed, 'example-output.md'), /\*Compiled 2026-01-15 from/)
  assert.match(REGISTRY_GUIDE, /record the date, source, and item version/)
})

test('F6: hard-coded tool IDs and other skills are flagged; the fixed skill states its minimum capability and a fallback', async () => {
  const warnings = checkSelfContained(await original())
  const tools = matches(warnings, 'tool_id')
  for (const id of [
    'claude-in-chrome:*',
    'claude-in-chrome:navigate',
    'claude-in-chrome:get_page_text',
    'ask_user_input_v0',
    'tool_search',
    'web_fetch',
    'switch_browser',
  ])
    assert.ok(tools.includes(id), `missing ${id}`)
  assert.deepEqual(matches(warnings, 'skill_reference'), ['the docx skill'])
  assert.match(
    warnings.find((w) => w.code === 'tool_id')!.message,
    /by capability[\s\S]*fallback/,
  )
  const skillMd = file(await selfContained(), 'SKILL.md')
  assert.match(skillMd, /\*\*Minimum capability:\*\*/)
  assert.match(skillMd, /Claude in Chrome is one\s+example/)
})

test('F7: get_skill on a private-only ID says "not public" and names get_item; a fetch failure says "unreachable"', async () => {
  let reachable = true
  const fetchCatalog = async (url: string) => {
    if (!reachable) throw new TypeError('fetch failed')
    if (url === CATALOG_URL) return Response.json(SEED_AGENTS)
    if (url.endsWith('/skills.json'))
      return Response.json({ skill_schema_version: 1, skills: [] })
    if (url.endsWith('/councils.json'))
      return Response.json({ council_schema_version: 1, councils: [] })
    return new Response(null, { status: 404 })
  }
  const client = connectorClient({ fetchCatalog })
  const call = (path: string, name: string, args: object) =>
    client.send(rpc(name, args), path).then(toolBody)

  // Account connector: the client has get_item, so name it.
  await assert.rejects(
    call('/account/mcp', 'get_skill', { skill_id: 'cams45-claude' }),
    (error: Error) => {
      assert.equal(
        error.message,
        'Skill "cams45-claude" is not in the public registry. If it is your own private or friends-only skill, read it with get_item (kind "skill") on the AgentLemon account connector.',
      )
      return true
    },
  )
  // Public connector and local server: no get_item, so give the link instead.
  for (const message of [
    await call('/mcp', 'get_skill', { skill_id: 'cams45-claude' }).catch(
      (error: Error) => error.message,
    ),
  ]) {
    assert.match(
      message,
      /^Skill "cams45-claude" is not in the public registry\./,
    )
    assert.ok(message.includes(ACCOUNT_RESOURCE))
    assert.doesNotMatch(message, /get_item/)
  }
  const local = createRegistryServer(
    [...SEED_AGENTS],
    undefined,
    undefined,
    undefined,
    hostedSkillReader(CATALOG_URL, fetchCatalog),
    {},
    hostedCouncilReader(CATALOG_URL, fetchCatalog),
  )
  const localClient = new Client({ name: 'f7', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await local.connect(b)
  await localClient.connect(a)
  try {
    const localError = async (name: string, args: object) => {
      const result = await localClient.callTool({ name, arguments: args })
      assert.equal(result.isError, true)
      return (result.content as { text: string }[])[0].text
    }
    for (const [name, args, kind] of [
      ['get_skill', { skill_id: 'cams45-claude' }, 'Skill'],
      ['switch_agent', { agent_id: 'my-private-agent' }, 'Agent'],
      ['get_council', { council_id: 'my-private-council' }, 'Council'],
    ] as const) {
      const text = await localError(name, args)
      assert.match(
        text,
        new RegExp(`${kind} "[a-z0-9-]+" is not in the public registry`),
      )
      assert.ok(text.includes(ACCOUNT_RESOURCE), text)
      assert.doesNotMatch(text, /get_item/)
    }
    // Agents and councils on the account connector name get_item.
    await assert.rejects(
      call('/account/mcp', 'get_agent', { agent_id: 'my-private-agent' }),
      /Agent "my-private-agent" is not in the public registry\. .*get_item \(kind "agent"\)/,
    )
    await assert.rejects(
      call('/account/mcp', 'get_council', { council_id: 'my-private-council' }),
      /Council "my-private-council" is not in the public registry\. .*get_item \(kind "council"\)/,
    )
    // A network failure never reads like "not public". Fresh readers, so no
    // cached index from the calls above hides the failure.
    reachable = false
    await assert.rejects(
      connectorClient({ fetchCatalog })
        .send(rpc('get_skill', { skill_id: 'cams45-claude' }), '/account/mcp')
        .then(toolBody),
      (error: Error) => {
        assert.equal(error.message, UNREACHABLE_MESSAGE)
        assert.doesNotMatch(error.message, /not in the public registry/)
        return true
      },
    )
    const freshLocal = hostedSkillReader(CATALOG_URL, fetchCatalog)
    await assert.rejects(
      freshLocal('get_skill', { skill_id: 'cams45-claude' })!,
      (error: Error) => error.message === UNREACHABLE_MESSAGE,
    )
  } finally {
    await localClient.close()
    await local.close()
  }
})

test('F7: a public agent pinned to an unpublished version names the current version; a server error is "unreachable"', async () => {
  const [agent] = SEED_AGENTS
  const missing = async () => {
    const { PublicFileMissing } =
      await import('../packages/mcp-server/src/shared')
    throw new PublicFileMissing('agents/x/9.9.9.json')
  }
  await assert.rejects(
    resolveAgent(SEED_AGENTS, `${agent.id}@9.9.9`, missing, 'get_item'),
    new RegExp(
      `version 9\\.9\\.9 is not in the public registry \\(the current public version is ${agent.version.replaceAll('.', '\\.')}\\); no version substitution was made\\. .*get_item`,
    ),
  )
  await assert.rejects(
    resolveAgent(SEED_AGENTS, `${agent.id}@9.9.9`, async () => {
      throw new Error(UNREACHABLE_MESSAGE)
    }),
    (error: Error) => error.message === UNREACHABLE_MESSAGE,
  )
})

test('F7 and R5: public read tools say they cover the public registry and point to get_item', async () => {
  const client = connectorClient()
  const response = await client.send(
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    '/mcp',
  )
  const { tools } = (await response.json()).result as {
    tools: { name: string; description: string }[]
  }
  for (const name of [
    'search_registry',
    'compare_agents',
    'get_agent',
    'search_skills',
    'get_skill',
    'get_skill_file',
    'search_councils',
    'get_council',
  ]) {
    const tool = tools.find((t) => t.name === name)!
    assert.match(tool.description, /public/i, name)
    assert.ok(
      /get_item/.test(tool.description) || name === 'compare_agents',
      `${name} does not point to get_item`,
    )
  }
})

test('F8 and R5: the full and condensed guides explain how to retry an export and use the account connector', () => {
  assert.match(REGISTRY_GUIDE, /## 13\. Exporting a skill, agent, or council/)
  const section = REGISTRY_GUIDE.slice(REGISTRY_GUIDE.indexOf('## 13.'))
  for (const phrase of [
    'The request is confirmation.',
    'a Markdown description of its layout',
    'If it returns `saved: false`, nothing was written.',
    'Ask the user only for facts you cannot find.',
    'call the same tool again with the corrected item and the same ID.',
    'save_anyway: true',
    'ready_for_other_ais',
    'Saving creates a new item and never replaces one.',
    'self_contained_warnings',
  ])
    assert.ok(section.toLowerCase().includes(phrase.toLowerCase()), phrase)
  // R5: the connector's tools are listed, and the public-only rule is plain.
  for (const tool of [
    '`get_item`',
    '`get_agent`',
    '`save_agent`, `save_skill`, `save_council`',
    '`list_my_items`',
  ])
    assert.ok(REGISTRY_GUIDE.includes(tool), tool)
  assert.match(
    REGISTRY_GUIDE,
    /\*\*Public tools read only the public registry\.\*\*/,
  )
  assert.match(
    REGISTRY_GUIDE,
    /use `get_item` with kind `skill` on the account connector/,
  )
  for (const guide of [CONDENSED_GUIDE, CONNECTOR_CONDENSED_GUIDE]) {
    assert.match(guide, /public registry only/)
    assert.match(guide, /get_item/)
    assert.match(guide, /never replaces one/)
    assert.match(guide, /checks before writing/)
    assert.match(guide, /saved: false.*fix the warnings yourself/)
    assert.match(guide, /save_anyway: true/)
  }
})

test('F9 and R4: prepareChatSave returns specific warnings for the original and none for the fixed skill, at any size', async () => {
  const saved = prepareChatSave(
    'skill',
    { skill: await original() },
    'uid',
    person,
    0,
    'claude',
  )
  assert.deepEqual(codes(saved.warnings), [
    'absent_file',
    'hidden_context',
    'skill_reference',
    'tool_id',
    'vague_location',
  ])
  assert.ok(saved.findings, 'small saves are linted inline')
  for (const warning of saved.warnings) {
    assert.ok(warning.message.length > 40, 'messages say what to do')
    assert.equal(warning.where, 'SKILL.md')
    assert.ok(file(await original(), 'SKILL.md').includes(warning.match))
  }
  assert.deepEqual(
    prepareChatSave('skill', { skill: await selfContained() }, 'uid', person, 0)
      .warnings,
    [],
  )
  // R4: above 12 KiB the linter is skipped, the self-containment check is not.
  const large = await original()
  large.files.push({
    path: 'notes.md',
    kind: 'reference',
    content: 'x'.repeat(13 * 1024),
  })
  const big = prepareChatSave('skill', { skill: large }, 'uid', person, 0)
  assert.equal(big.findings, null)
  assert.deepEqual(codes(big.warnings), codes(saved.warnings))
  // Never stored: the record has no new field.
  assert.ok(
    !('warnings' in saved.record) &&
      !('self_contained_warnings' in saved.record),
  )
})

test('F10: read-time portability adds context_warnings beside an unchanged detected_tools', async () => {
  const item = await original()
  const block = createPortabilityBlock(item, 'claude')
  assert.deepEqual(block.detected_tools, ['Claude in Chrome'])
  assert.deepEqual(codes(block.context_warnings!), [
    'absent_file',
    'hidden_context',
    'skill_reference',
    'tool_id',
    'vague_location',
  ])
  assert.ok(block.note.startsWith(PORTABILITY_NOTE))
  const fixedBlock = createPortabilityBlock(await selfContained(), 'claude')
  assert.equal('context_warnings' in fixedBlock, false)
  assert.equal(fixedBlock.note, PORTABILITY_NOTE)
  // Bare "Canvas" stays unflagged in both lists.
  assert.ok(!block.detected_tools.some((name) => /canvas/i.test(name)))
  assert.ok(!block.context_warnings!.some((w) => /^canvas$/i.test(w.match)))
})

/* ---------- Round trip ---------- */

test('round trip: save_skill checks before writing, allows an override, and preserves both cams45 fixtures byte for byte', async () => {
  const client = accountFixture()
  const { access_token } = await client.connect()
  const call = (name: string, args: object) =>
    client.send(rpc(name, args), '/account/mcp', access_token).then(toolBody)

  for (const [item, expectWarnings] of [
    [await original(), true],
    [await selfContained(), false],
  ] as const) {
    const path = `${client.projectRoot}skills/${item.id}`
    let checked
    if (expectWarnings) {
      checked = await call('save_skill', { skill: item })
      assert.equal(checked.saved, false)
      assert.equal(client.documents.has(path), false)
      assert.deepEqual(codes(checked.self_contained_warnings), [
        'absent_file',
        'hidden_context',
        'skill_reference',
        'tool_id',
        'vague_location',
      ])
      assert.match(checked.next_step, /Fix these warnings yourself/)
      assert.match(checked.next_step, /with the corrected item and the same ID/)
      assert.match(checked.next_step, /save_anyway: true/)
    }
    const saved = await call(
      'save_skill',
      expectWarnings ? { skill: item, save_anyway: true } : { skill: item },
    )
    assert.equal(saved.saved, true)
    assert.equal(saved.ready_for_other_ais, !expectWarnings)
    assert.equal(saved.visibility, 'private')
    if (expectWarnings) {
      assert.deepEqual(
        saved.self_contained_warnings,
        checked!.self_contained_warnings,
      )
      assert.match(saved.next_step, /in one sentence what is still missing/)
    } else {
      assert.deepEqual(saved.self_contained_warnings, [])
      assert.doesNotMatch(saved.next_step, /self_contained_warnings/)
    }
    const read = await call('get_item', { kind: 'skill', id: item.id })
    assert.deepEqual(
      read.skill.files,
      item.files,
      'every file survives byte for byte',
    )
    for (const [index, stored] of read.skill.files.entries())
      assert.equal(stored.content, item.files[index].content)
    assert.equal('context_warnings' in read.portability, expectWarnings)
    if (expectWarnings)
      assert.ok(
        read.portability.context_warnings.some(
          (w: SelfContainedWarning) =>
            w.match === 'CAMS045_L02_Compiled_Reference.docx',
        ),
      )
    // The stored record carries no warning field.
    const stored = client.documents.get(path)!.fields as Record<string, unknown>
    assert.ok(
      !('self_contained_warnings' in stored) && !('context_warnings' in stored),
    )
  }
})

test("R1 (deferred, D4) and get_item errors: not found, version differs with the current version, never revealing others' items", async () => {
  const client = accountFixture()
  const { access_token } = await client.connect()
  const call = (name: string, args: object) =>
    client.send(rpc(name, args), '/account/mcp', access_token).then(toolBody)
  await call('save_skill', { skill: fixtureSkill({ id: 'pinned-skill' }) })
  await assert.rejects(
    call('get_item', { kind: 'skill', id: 'pinned-skill', version: '0.9.0' }),
    /This skill version is unavailable: "pinned-skill" is at version 1\.0\.0, not 0\.9\.0\. .*council pinned to an older version/,
  )
  await assert.rejects(
    call('get_item', { kind: 'agent', id: 'someone-elses-agent' }),
    /This agent is unavailable: "someone-elses-agent" was not found or is not visible to your account\./,
  )
  await assert.rejects(
    call('get_item', { kind: 'council', id: 'no-such-council' }),
    /This council is unavailable: "no-such-council" was not found or is not visible to your account\./,
  )
})

/* ---------- R2, R3 ---------- */

test('R2: save tools tell the AI to check, fix, and retry without a separate confirmation or replacement', async () => {
  const client = accountFixture()
  const { access_token } = await client.connect()
  const send = (name: string, args: object) =>
    client.send(rpc(name, args), '/account/mcp', access_token).then(toolBody)
  const list = await client
    .send(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      '/account/mcp',
    )
    .then((r) => r.json())
  const tools = list.result.tools as {
    name: string
    description: string
    inputSchema: { properties: Record<string, unknown>; required: string[] }
  }[]
  for (const name of ['save_agent', 'save_skill', 'save_council']) {
    const { description, inputSchema } = tools.find((t) => t.name === name)!
    assert.match(description, /request is confirmation/)
    assert.match(
      description,
      /checks before saving.*fix the warnings yourself and call again/,
    )
    assert.match(description, /save_anyway: true/)
    assert.match(description, /cannot replace/)
    assert.deepEqual(inputSchema.properties.save_anyway, { type: 'boolean' })
    assert.ok(!inputSchema.required.includes('save_anyway'))
  }
  const skill = await original()
  const corrected = { ...(await selfContained()), id: skill.id }
  assert.equal(
    (await send('save_skill', { skill, save_anyway: false })).saved,
    false,
  )
  const saved = await send('save_skill', { skill: corrected })
  assert.equal(saved.saved, true)
  assert.equal(saved.ready_for_other_ais, true)
  await assert.rejects(
    send('save_skill', { skill: corrected }),
    /already taken/,
  )
  assert.match(
    REGISTRY_GUIDE,
    /never replaces one\. To revise a saved item, use a new ID or edit it on the site\./,
  )
})

test('R3: save_council checks its own instructions and every supplied member before writing anything', async () => {
  const sample =
    'Check sources and gather papers in parallel, then build an evidence review.'
  const council = {
    council_schema_version: 1,
    id: 'chat-research-desk',
    version: '1.0.0',
    name: 'Chat research desk',
    description: 'Check sources and write an evidence review.',
    tags: ['research'],
    instructions: sample,
    members: [
      {
        ref: { kind: 'agent', id: 'desk-checker', version: '1.0.0' },
        role: 'Source checker',
        order: 1,
      },
      {
        ref: { kind: 'skill', id: 'cams45-claude', version: '1.0.0' },
        role: 'Compiler',
        order: 2,
      },
    ],
  }
  assert.equal(inferItemKind(council), 'council')
  assert.deepEqual(codes(checkSelfContained(council)), [
    'council_no_handoff',
    'council_short_instructions',
  ])
  const good = {
    ...council,
    instructions:
      'Stage 1: the source checker returns a table of claims, each with the source, the quoted line, and a confidence rating. Stage 2: the compiler takes that table and the lesson pages and writes the reference document, citing table rows where a claim is used.',
  }
  assert.deepEqual(checkSelfContained(good), [])

  const client = accountFixture()
  const { access_token } = await client.connect()
  const call = (args: object) =>
    client
      .send(rpc('save_council', args), '/account/mcp', access_token)
      .then(toolBody)
  const agent = {
    ...SEED_AGENTS[0],
    id: 'desk-checker',
    version: '1.0.0',
    prompt_blueprint: {
      ...SEED_AGENTS[0].prompt_blueprint,
      instructions: [
        ...SEED_AGENTS[0].prompt_blueprint.instructions,
        `Use each input: ${SEED_AGENTS[0].input_schema.required?.join(', ')}.`,
      ],
    },
  }
  const member_items = [
    { kind: 'agent', manifest: agent },
    { kind: 'skill', skill: await original() },
  ]
  const args = { manifest: good, member_items }
  const checked = await call(args)
  assert.equal(checked.saved, false)
  assert.deepEqual(
    [
      ...new Set(
        checked.self_contained_warnings.map((w: { item: string }) => w.item),
      ),
    ],
    ['skill:cams45-claude@1.0.0'],
  )
  assert.ok(
    checked.self_contained_warnings.some(
      (w: SelfContainedWarning) => w.code === 'absent_file',
    ),
  )
  const paths = [
    'councils/chat-research-desk',
    'agents/desk-checker',
    'skills/cams45-claude',
  ].map((path) => client.projectRoot + path)
  for (const path of paths)
    assert.equal(client.documents.has(path), false, path)

  const short = await call({ ...args, manifest: council })
  assert.equal(short.saved, false)
  assert.deepEqual(
    codes(
      short.self_contained_warnings.filter(
        (w: { item: string }) => w.item === 'council:chat-research-desk@1.0.0',
      ),
    ),
    ['council_no_handoff', 'council_short_instructions'],
  )
  const saved = await call({ ...args, save_anyway: true })
  assert.equal(saved.saved, true)
  assert.equal(saved.ready_for_other_ais, false)
  assert.deepEqual(
    saved.self_contained_warnings,
    checked.self_contained_warnings,
  )
  for (const path of paths) assert.equal(client.documents.has(path), true, path)
  assert.match(
    saved.next_step,
    /Editing or deleting a private member later can break this council/,
  )
})

/* ---------- Existing items ---------- */

test('existing items: no catalog agent, sample skill, or existing fixture gets read-time context_warnings', async () => {
  const catalog = manifestSchema
    .array()
    .parse(JSON.parse(await readFile('public/catalog.json', 'utf8')))
  assert.equal(catalog.length, 14)
  for (const agent of [...catalog, ...SEED_AGENTS]) {
    const block = createPortabilityBlock(agent)
    assert.equal('context_warnings' in block, false, agent.id)
    assert.equal(block.note, PORTABILITY_NOTE)
    assert.deepEqual(
      checkSelfContained(agent, 'agent', { phase: 'read' }),
      [],
      agent.id,
    )
  }
  const samples: SkillManifest[] = JSON.parse(
    await readFile('tests/fixtures/sample-skills.json', 'utf8'),
  )
  assert.equal(samples.length, 5)
  for (const sample of [...samples, fixtureSkill()])
    assert.deepEqual(checkSelfContained(sample), [], sample.id)

  // get_agent over the connector carries the same unchanged block.
  const client = connectorClient()
  for (const agent of catalog) {
    const loaded = await client
      .send(
        rpc('get_agent', { agent_id: `${agent.id}@${agent.version}` }),
        '/mcp',
      )
      .then(toolBody)
    assert.equal('context_warnings' in loaded.portability, false, agent.id)
  }
})

test('existing items: at save time catalog agents get only unused_input warnings, listed and justified here', async () => {
  // Justified: these seed prompts use their inputs by meaning ("server
  // version", "SQL semantics") and receive them as validated JSON, so none of
  // these names appears in the prompt text. The warning is real advice for a
  // new author, so it stays at save time; it is skipped at read time, where a
  // reader cannot act on it (selfContained.ts, phase "read").
  const expected: Record<string, string[]> = {
    'academic-paper-synthesizer': ['inclusion_criteria', 'papers'],
    'campaign-brief-crew': ['channels', 'deliverables'],
    'churn-risk-forecaster': ['data_dictionary', 'observation_window'],
    'corpus-evidence-reviewer': [],
    'executive-strategy-memo': ['context', 'options'],
    'fastapi-mcp-scaffolder': ['requirements'],
    'incident-hypothesis-review': ['observations', 'constraints'],
    'k8s-manifest-hardening': ['network_requirements', 'workload_constraints'],
    'postgres-index-tuner': ['query'],
    'python-regex-deobfuscator': ['examples'],
    'react19-tailwind-modernizer': [
      'files',
      'package_json',
      'tsconfig',
      'goals',
    ],
    'sec-10k-auditor': ['cik'],
    'solidity-reentrancy-guard': ['files', 'compiler_version'],
    'story-continuity-editor': ['scenes'],
  }
  const catalog: AgentManifest[] = JSON.parse(
    await readFile('public/catalog.json', 'utf8'),
  )
  const actual = Object.fromEntries(
    catalog.map((agent) => {
      const warnings = checkSelfContained(agent, 'agent')
      assert.ok(
        warnings.every((w) => w.code === 'unused_input'),
        agent.id,
      )
      return [agent.id, warnings.map((w) => w.match)]
    }),
  )
  assert.deepEqual(actual, expected)
})

/* ---------- Pattern behavior ---------- */

const skillWith = (
  content: string,
  extra: { path: string; content: string }[] = [],
) => ({
  files: [
    { path: 'SKILL.md', kind: 'instructions', content },
    ...extra.map((f) => ({ ...f, kind: 'reference' })),
  ],
})

test('patterns: each warning code fires on its target text', () => {
  const cases: [string, string][] = [
    ['absent_file', 'Match the layout of style-guide.pdf.'],
    ['absent_file', 'Save it in the same format as L02_Reference.docx.'],
    [
      'vague_location',
      'Ask the user which lesson, then go to the course page.',
    ],
    ['hidden_context', 'Use the attached spreadsheet.'],
    ['hidden_context', 'Read C:\\Users\\me\\notes.txt first.'],
    ['hidden_context', 'Format it as we did last week.'],
    ['hidden_context', 'Reuse the outline from earlier in this chat.'],
    ['vague_location', 'Go to the team Settings page and copy the key.'],
    ['tool_id', 'Call `mcp__drive__search` for the folder.'],
    ['tool_id', 'Open it with browser-tools:open_tab.'],
    ['skill_reference', 'Use the pdf skill to render it.'],
    ['placeholder', 'The deadline is TBD.'],
    ['placeholder', 'Send it to <TEAM_EMAIL>.'],
    ['placeholder', 'Start with [insert greeting].'],
  ]
  for (const [code, text] of cases)
    assert.deepEqual(
      codes(checkSelfContained(skillWith(text), 'skill')),
      [code],
      text,
    )
  const agent = {
    ...SEED_AGENTS[0],
    input_schema: {
      type: 'object',
      properties: { target_url: { type: 'string' } },
      required: ['target_url'],
    },
    prompt_blueprint: {
      system_prompt: 'Review the page.',
      instructions: ['Summarize.'],
      verification_rules: [],
    },
  }
  assert.deepEqual(codes(checkSelfContained(agent)), ['unused_input'])
  assert.deepEqual(
    checkSelfContained({
      ...agent,
      prompt_blueprint: {
        ...agent.prompt_blueprint,
        system_prompt: 'Review the page at the target URL.',
      },
    }),
    [],
  )
  assert.deepEqual(
    codes(checkSelfContained({ ...agent, description: 'Read report.docx.' })),
    ['absent_file', 'unused_input'],
  )
})

test('patterns: low false positives on ordinary text', () => {
  for (const text of [
    'Log in to Canvas and open the course. Canvas pages need a session.',
    'Build it with Node.js or Next.js.',
    'Save the result as CAMS045_L{NN}_Compiled_Reference.docx.',
    'The sample is at https://example.com/files/report.pdf for reference.',
    'Mark absent owners as TBD.',
    'Load skill:pdf-forms@1.0.0 and then agent:x@1.0.0.',
    'This skill only reads. Use the same skill for every lesson.',
    'Write the time as 10:30 and the ratio as 3:2.',
    'Read references/fields.md before filling a form.',
    'Mark any placeholder the user must fill in with square brackets, like [date].',
    'Use `snake_case` names for columns like `created_at`.',
    'Go to the Overview page. The URL is https://canvas.example.edu/courses/1.',
    // Output files the item creates are not missing files.
    'Save the result as CAMS045_L03_Compiled_Reference.docx and present it.',
    'Name the output file CAMS045_LNN_Compiled_Reference.docx, where NN is the lesson number.',
    // A place whose address the AI is told to ask for is not vague.
    'Ask the user for the Canvas course Modules page URL, then go to the course Modules page.',
    'Go to the course Modules page at the URL the user gives you.',
  ])
    assert.deepEqual(
      checkSelfContained(
        skillWith(text, [
          { path: 'references/fields.md', content: '# Fields\n' },
        ]),
        'skill',
      ),
      [],
      text,
    )
  // Scripts are code, not instructions; they are not scanned.
  assert.deepEqual(
    checkSelfContained({
      files: [
        { path: 'SKILL.md', kind: 'instructions', content: 'Run the script.' },
        {
          path: 'run.sh',
          kind: 'script',
          content: '#!/bin/sh\ncat ~/notes.txt # TODO',
        },
      ],
    }),
    [],
  )
  // Declared tools and schema fields are not hidden tool IDs.
  const agent = {
    ...SEED_AGENTS[0],
    tools_required: [
      { name: 'run_query', type: 'mcp_tool', description: 'Runs SQL.' },
    ],
    prompt_blueprint: {
      system_prompt: 'Call `run_query` with the query.',
      instructions: ['x'],
      verification_rules: [],
    },
  }
  assert.ok(!checkSelfContained(agent).some((w) => w.code === 'tool_id'))
  // Not items yield nothing; the list is capped.
  assert.deepEqual(checkSelfContained('this project'), [])
  assert.deepEqual(checkSelfContained(null), [])
  const noisy = skillWith(
    Array.from({ length: 60 }, (_, i) => `See file-${i}.pdf.`).join('\n'),
  )
  assert.equal(checkSelfContained(noisy).length, MAX_SELF_CONTAINED_WARNINGS)
})

test('selfContained.ts imports nothing a Worker cannot run', async () => {
  const source = await readFile('src/lib/selfContained.ts', 'utf8')
  assert.doesNotMatch(source, /^import /m)
  assert.doesNotMatch(
    source,
    /\bnode:|\bajv\b|\bprocess\.|\bBuffer\b|\beval\(|require\(/,
  )
})

test('the checks run in linear time on 200 KiB adversarial text, so a large save stays inside the Worker CPU budget', () => {
  // A regex like `[\w.-]*\.md` once took minutes on 100 KiB of "a" in the
  // connector benchmark. Every input here must finish well under a second.
  const size = 200 * 1024
  const inputs = {
    letters: 'a'.repeat(size),
    dots: '.md'.repeat(size / 3),
    names: 'a.md'.repeat(size / 4),
    hyphens: 'a-'.repeat(size / 2),
    underscores: '_'.repeat(size),
    backticks: '`a_b'.repeat(size / 4),
    articles: 'the A'.repeat(size / 5),
    goTo: 'go to the '.repeat(size / 10),
    namespaces: 'a-b:'.repeat(size / 4),
    angles: '<A'.repeat(size / 2),
    mcp: 'mcp__' + '_'.repeat(size),
  }
  for (const [name, content] of Object.entries(inputs))
    for (const item of [
      skillWith(content),
      {
        ...SEED_AGENTS[0],
        description: content,
        prompt_blueprint: {
          system_prompt: content,
          instructions: [content],
          verification_rules: [],
        },
      },
      { instructions: content, members: [] },
    ]) {
      const start = performance.now()
      checkSelfContained(item)
      const elapsed = performance.now() - start
      assert.ok(elapsed < 1000, `${name} took ${elapsed.toFixed(0)} ms`)
    }
})
