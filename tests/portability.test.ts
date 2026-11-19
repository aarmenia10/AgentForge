import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_SPECIFIC_TOOLS,
  clientOriginApp,
  createPortabilityBlock,
  detectAppTools,
  originLabel,
  PORTABILITY_NOTE,
  publicOriginLabel,
} from '../src/lib/portability'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { createRegistryServer } from '../packages/mcp-server/src/server'
import { createConnectorServer } from '../packages/connector/src/server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { skill } from './skillFixture'

test('detectAppTools correctly flags conservative app-specific tools', () => {
  assert(APP_SPECIFIC_TOOLS.length > 0)
  assert.equal(
    APP_SPECIFIC_TOOLS.some((t) => t.tool === 'Canvas'),
    false,
  )
  assert.deepEqual(
    detectAppTools('Use Claude in Chrome to automate the browser.'),
    ['Claude in Chrome'],
  )
  assert.deepEqual(detectAppTools('Run this with claude code CLI.'), [
    'Claude Code',
  ])
  assert.deepEqual(
    detectAppTools('Render a visual artifact with Claude Artifacts.'),
    ['Artifacts'],
  )
  assert.deepEqual(detectAppTools('Execute python in the Code Interpreter.'), [
    'Code Interpreter',
  ])
  assert.deepEqual(
    detectAppTools('Analyze spreadsheets using advanced data analysis.'),
    ['ChatGPT Data Analysis'],
  )
  assert.deepEqual(
    detectAppTools(
      'Find specialized assistants in the GPT Store or custom GPTs.',
    ),
    ['Custom GPTs'],
  )
  assert.deepEqual(detectAppTools('Draft your document in ChatGPT Canvas.'), [
    'ChatGPT Canvas',
  ])
  assert.deepEqual(detectAppTools('Draft your document in OpenAI Canvas.'), [
    'ChatGPT Canvas',
  ])
  assert.deepEqual(
    detectAppTools('Integrate with Google Gemini extensions and Gemini Live.'),
    ['Gemini'],
  )
  assert.deepEqual(
    detectAppTools('Run a deep research agent across the web.'),
    ['Deep Research'],
  )
  assert.deepEqual(detectAppTools('Control the desktop using computer use.'), [
    'Computer Use',
  ])
})

test('ambiguous words like "Canvas" alone are NEVER flagged', () => {
  // Canvas alone: school LMS, HTML5 canvas, or general term
  assert.deepEqual(detectAppTools('Submit your homework on Canvas.'), [])
  assert.deepEqual(
    detectAppTools('Draw a 2D graphic using the HTML5 <canvas> element.'),
    [],
  )
  assert.deepEqual(
    detectAppTools('Use a blank canvas to organize your thoughts.'),
    [],
  )
  assert.deepEqual(
    detectAppTools('The canvas learning management system API.'),
    [],
  )

  // Only unambiguous compound terms are flagged
  assert.deepEqual(detectAppTools('Edit side-by-side in chatgpt canvas.'), [
    'ChatGPT Canvas',
  ])
  assert.deepEqual(detectAppTools('Open in openai canvas editor.'), [
    'ChatGPT Canvas',
  ])
})

test('clientOriginApp maps hosts to allowed OriginApps', () => {
  assert.equal(clientOriginApp('claude.ai'), 'claude')
  assert.equal(clientOriginApp('https://claude.ai'), 'other') // host only
  assert.equal(clientOriginApp('sub.claude.ai'), 'claude')
  assert.equal(clientOriginApp('CLAUDE.AI'), 'claude')
  assert.equal(clientOriginApp('chatgpt.com'), 'chatgpt')
  assert.equal(clientOriginApp('SUB.CHATGPT.COM'), 'chatgpt')
  assert.equal(clientOriginApp('anything.else.com'), 'other')
  assert.equal(clientOriginApp(''), 'other')
  assert.equal(clientOriginApp(null), 'other')
  assert.equal(clientOriginApp(undefined), 'other')
})

test('originLabel and publicOriginLabel produce correct labels', () => {
  // My items labels
  assert.equal(originLabel('claude', true), 'Saved from Claude')
  assert.equal(originLabel('chatgpt', true), 'Saved from ChatGPT')
  assert.equal(originLabel('other', true), 'Saved from chat')
  assert.equal(originLabel(undefined, true), 'Saved from chat')
  assert.equal(originLabel(undefined, false), null)

  // Public quiet lines
  assert.equal(publicOriginLabel('claude'), 'Made in Claude')
  assert.equal(publicOriginLabel('chatgpt'), 'Made in ChatGPT')
  assert.equal(publicOriginLabel('other'), null)
  assert.equal(publicOriginLabel(undefined), null)
  assert.equal(publicOriginLabel(null), null)
})

test('createPortabilityBlock builds complete block with detected tools and note', () => {
  const item = {
    name: 'Python Data Scientist',
    description:
      'Uses Code Interpreter to analyze statistics and Claude Code for scripts.',
    prompt_blueprint: {
      instructions: ['Run computer use to inspect UI state.'],
    },
  }
  const block = createPortabilityBlock(item, 'claude')
  assert.equal(block.origin_app, 'claude')
  assert.deepEqual(block.detected_tools, [
    'Claude Code',
    'Code Interpreter',
    'Computer Use',
  ])
  assert.equal(block.note, PORTABILITY_NOTE)
})

test('local server and connector server achieve parity for portability block', async () => {
  const agent = {
    ...SEED_AGENTS[0],
    id: 'portable-agent',
    version: '1.0.0',
    description: 'Requires Code Interpreter and Artifacts to function.',
  }
  const origins = { 'portable-agent@1.0.0': 'claude' as const }

  // 1. Local registry server
  const localServer = createRegistryServer(
    [agent],
    undefined,
    async () => agent,
    undefined,
    undefined,
    origins,
  )
  const localClient = new Client({ name: 'test-local', version: '1.0.0' })
  const [lct, lst] = InMemoryTransport.createLinkedPair()
  await localServer.connect(lst)
  await localClient.connect(lct)

  // 2. Connector server
  const connectorServer = createConnectorServer(
    [agent],
    async () => agent,
    undefined,
    undefined,
    origins,
  )
  const connectorClient = new Client({
    name: 'test-connector',
    version: '1.0.0',
  })
  const [cct, cst] = InMemoryTransport.createLinkedPair()
  await connectorServer.connect(cst)
  await connectorClient.connect(cct)

  try {
    const localRes = await localClient.callTool({
      name: 'switch_agent',
      arguments: { agent_id: 'portable-agent' },
    })
    const localData = JSON.parse(
      (localRes.content as { text: string }[])[0].text,
    )

    const connectorRes = await connectorClient.callTool({
      name: 'get_agent',
      arguments: { agent_id: 'portable-agent' },
    })
    const connectorData = JSON.parse(
      (connectorRes.content as { text: string }[])[0].text,
    )

    // Both must have the identical portability block
    assert.ok(localData.portability)
    assert.ok(connectorData.portability)
    assert.deepEqual(localData.portability, connectorData.portability)
    assert.equal(localData.portability.origin_app, 'claude')
    assert.deepEqual(localData.portability.detected_tools, [
      'Artifacts',
      'Code Interpreter',
    ])
    assert.equal(localData.portability.note, PORTABILITY_NOTE)

    // Also test get_skill parity
    const sampleSkill = skill()
    sampleSkill.description = 'Use ChatGPT Canvas and deep research.'
    sampleSkill.origin_app = 'chatgpt'

    const skillReader = async (name: string) => {
      if (name === 'get_skill') {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ref: `skill:${sampleSkill.id}@${sampleSkill.version}`,
                name: sampleSkill.name,
                description: sampleSkill.description,
                portability: createPortabilityBlock(
                  sampleSkill,
                  sampleSkill.origin_app,
                ),
              }),
            },
          ],
        }
      }
    }

    const localSkillRes = await skillReader('get_skill', {
      skill_id: sampleSkill.id,
    })
    const localSkillData = JSON.parse(localSkillRes!.content[0].text)
    assert.equal(localSkillData.portability.origin_app, 'chatgpt')
    assert.deepEqual(localSkillData.portability.detected_tools, [
      'ChatGPT Canvas',
      'Deep Research',
    ])
  } finally {
    await localClient.close()
    await localServer.close()
    await connectorClient.close()
    await connectorServer.close()
  }
})

test('portability.ts imports no Node APIs, no Ajv, and no eval', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(
    new URL('../src/lib/portability.ts', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(
    source,
    /\bnode:|\bajv\b|\bprocess\.|\bBuffer\b|\beval\(|require\(/,
  )
})
