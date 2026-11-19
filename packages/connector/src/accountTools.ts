import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
  agentIdSchema,
  manifestSchema,
  versionSchema,
} from '../../../src/lib/manifestSchema'
import {
  skillManifestSchema,
  validateSkillManifest,
} from '../../../src/lib/skillSchema'
import { lintManifest, lintSkill } from '../../../src/lib/safetyLinter'
import { READ, SITE_ORIGIN, WRITE } from '../../../src/services/connectorConfig'
import type { AgentManifest } from '../../../src/types/agent'
import type { SkillManifest } from '../../../src/types/skill'
import {
  BLUEPRINT_NOTICE,
  jsonResult,
  renderBlueprint,
} from '../../mcp-server/src/shared'
import { FirestoreError, identity, type Firestore } from './firebase'
import type { Access } from './oauth'

const kind = z.enum(['agent', 'skill'])
const visibility = z.enum(['public', 'friends', 'private'])
const empty = z.strictObject({})
const listArgs = z.strictObject({
  kind: kind.optional(),
  visibility: visibility.optional(),
  cursor: z.string().max(1600).optional(),
  limit: z.number().int().min(1).max(25).optional(),
})
const getArgs = z.strictObject({
  kind,
  id: agentIdSchema,
  version: versionSchema.optional(),
})
const agentInput = manifestSchema.partial({
  author: true,
  visibility: true,
  stats: true,
})
const skillInput = skillManifestSchema.partial({
  author: true,
  visibility: true,
  stats: true,
})
const saveAgentArgs = z.strictObject({ manifest: agentInput })
const saveSkillArgs = z.strictObject({ skill: skillInput })
const cursorSchema = z.strictObject({
  kind,
  after: agentIdSchema.optional(),
  filter: kind.optional(),
  visibility: visibility.optional(),
})
const metadataFields = [
  'id',
  'name',
  'version',
  'description',
  'visibility',
  'review_status',
  'stats.updated_at',
]
export const MAX_AGENT_BYTES = 200 * 1024
export const INLINE_LINT_BYTES = 12 * 1024
const encoder = new TextEncoder()

function tool(
  name: string,
  title: string,
  scope: string,
  description: string,
  schema: z.ZodObject,
): Tool & { securitySchemes: { type: string; scopes: string[] }[] } {
  const writes = scope === WRITE
  const securitySchemes = [{ type: 'oauth2', scopes: [scope] }]
  return {
    name,
    title,
    description,
    inputSchema: z.toJSONSchema(schema) as Tool['inputSchema'],
    annotations: {
      title,
      readOnlyHint: !writes,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: !writes,
    },
    securitySchemes,
    _meta: { securitySchemes },
  }
}

const saveDescription =
  'Only call on the user’s explicit request after showing them the content. This creates one new private item. AgentLemon supplies the author and visibility.'
export const accountTools = [
  tool(
    'account_status',
    'Check AgentLemon account',
    READ,
    'Check your username, email confirmation, and which account tools you can use.',
    empty,
  ),
  tool(
    'list_my_items',
    'List my items',
    READ,
    'List only your own items and their review status. With no kind filter, pages cover agents first and then skills. Follow next_cursor until it is null, including after an empty page.',
    listArgs,
  ),
  tool(
    'get_item',
    'Get an AgentLemon item',
    READ,
    'Read a full agent blueprint or skill you can access. Accepts an ID and an optional exact version.',
    getArgs,
  ),
  tool(
    'save_agent',
    'Save a private agent',
    WRITE,
    saveDescription,
    saveAgentArgs,
  ),
  tool(
    'save_skill',
    'Save a private skill',
    WRITE,
    saveDescription,
    saveSkillArgs,
  ),
]
export const accountToolNames = new Set(accountTools.map(({ name }) => name))
export const writeToolNames = new Set(['save_agent', 'save_skill'])

interface Context {
  access: Access
  db: Firestore
  now: () => number
  publicAgent: (id: string, version?: string) => Promise<AgentManifest | null>
  publicSkill: (id: string, version?: string) => Promise<SkillManifest | null>
}

const profileSchema = z.object({
  handle: manifestSchema.shape.author.shape.handle,
  display_name: z.string().min(1),
})
async function profile({ db, access }: Context) {
  const doc = await db.get(`users/${access.uid}`)
  return doc ? profileSchema.parse(doc.fields) : null
}

function itemCollection(itemKind: 'agent' | 'skill') {
  return itemKind === 'agent' ? 'agents' : 'skills'
}

async function listItems(input: unknown, { db, access }: Context) {
  const args = listArgs.parse(input)
  const cursor = args.cursor
    ? cursorSchema.parse(JSON.parse(args.cursor))
    : null
  if (
    cursor &&
    (cursor.filter !== args.kind ||
      cursor.visibility !== args.visibility ||
      (args.kind && cursor.kind !== args.kind))
  )
    throw new Error('The cursor does not match these filters.')
  const itemKind = cursor?.kind ?? args.kind ?? 'agent'
  // The skill rules cap each query at 20. A single query per page keeps the
  // read budget predictable and works without a cross-collection index.
  const limit = Math.min(args.limit ?? 20, itemKind === 'skill' ? 20 : 25)
  const items = await db.list(
    itemCollection(itemKind),
    access.uid,
    metadataFields,
    limit,
    args.visibility,
    cursor?.after,
  )
  const last = items.at(-1)
  const next = (kind: 'agent' | 'skill', after?: unknown) =>
    JSON.stringify({
      kind,
      after,
      filter: args.kind,
      visibility: args.visibility,
    })
  const next_cursor =
    items.length === limit
      ? next(itemKind, last?.id)
      : !args.kind && itemKind === 'agent'
        ? next('skill')
        : null
  return jsonResult({
    items: items.map((item) => ({ kind: itemKind, ...item })),
    next_cursor,
  })
}

async function getItem(
  input: unknown,
  { db, publicAgent, publicSkill }: Context,
) {
  const { kind, id, version } = getArgs.parse(input)
  let item = await (kind === 'agent' ? publicAgent : publicSkill)(
    id,
    version,
  ).catch(() => null)
  if (!item) {
    const unavailable = () =>
      new Error('This item or version is unavailable to your account.')
    const doc = await db.get(`${itemCollection(kind)}/${id}`).catch((error) => {
      if (error instanceof FirestoreError && error.status === 403)
        throw unavailable()
      throw error
    })
    if (
      !doc ||
      doc.fields.id !== id ||
      (version && doc.fields.version !== version)
    )
      throw unavailable()
    if (kind === 'agent') item = manifestSchema.strip().parse(doc.fields)
    else {
      const parsed = validateSkillManifest(
        skillManifestSchema.strip().parse(doc.fields),
      )
      if (!parsed.ok) throw unavailable()
      item = parsed.value
    }
  }
  return 'prompt_blueprint' in item
    ? jsonResult({
        notice: BLUEPRINT_NOTICE,
        kind,
        agent: item,
        blueprint: renderBlueprint(item),
      })
    : jsonResult({
        notice: `${BLUEPRINT_NOTICE} Do not run skill scripts without the user’s explicit request.`,
        kind,
        skill: item,
      })
}

export function prepareChatSave(
  kind: 'agent' | 'skill',
  input: unknown,
  uid: string,
  person: z.infer<typeof profileSchema>,
  time: number,
) {
  const data =
    kind === 'agent'
      ? saveAgentArgs.parse(input).manifest
      : saveSkillArgs.parse(input).skill
  if (data.id.length > 1500) throw new Error('The item ID is too long.')
  if (kind === 'skill' && data.id === 'new')
    throw new Error('The skill ID "new" is reserved. Choose a different ID.')
  const bytes = encoder.encode(JSON.stringify(data)).byteLength
  if (kind === 'agent' && bytes > MAX_AGENT_BYTES)
    throw new Error('The agent manifest must be at most 200 KiB.')
  const normalized = {
    ...data,
    author: {
      uid,
      name: person.display_name,
      handle: person.handle,
      verified: false,
    },
    visibility: 'private',
    stats: {
      updated_at: new Date(time).toISOString(),
      ...(kind === 'agent' && { stars: 0, views: 0 }),
    },
  }
  const skipLint = bytes > INLINE_LINT_BYTES
  const metadata = {
    owner_uid: uid,
    review_status: 'pending',
    saved_from_chat: true,
  }
  if (kind === 'agent') {
    const manifest = manifestSchema.parse(normalized)
    return {
      record: { ...manifest, ...metadata, shared_with: [] },
      findings: skipLint ? null : lintManifest(manifest).findings,
    }
  }
  const validated = validateSkillManifest(normalized)
  if (!validated.ok)
    throw new Error(
      validated.issues
        .map(({ path, message }) => `${path}: ${message}`)
        .join(', '),
    )
  return {
    record: { ...validated.value, ...metadata },
    findings: skipLint ? null : lintSkill(validated.value).findings,
  }
}

async function saveItem(
  kind: 'agent' | 'skill',
  input: unknown,
  context: Context,
) {
  const { access, db } = context
  if (!identity(access.idToken).verified)
    throw new Error(
      'Confirm your AgentLemon email address before saving items.',
    )
  const person = await profile(context)
  if (!person)
    throw new Error(
      `Choose your username at ${SITE_ORIGIN}/settings before saving items.`,
    )
  const { record, findings } = prepareChatSave(
    kind,
    input,
    access.uid,
    person,
    context.now(),
  )
  try {
    await db.put(`${itemCollection(kind)}/${record.id}`, record)
  } catch (error) {
    if (error instanceof FirestoreError && error.conflict)
      throw new Error('This ID is already taken. Choose a new item ID.', {
        cause: error,
      })
    throw error
  }
  return jsonResult({
    id: record.id,
    kind,
    visibility: record.visibility,
    review: 'Not needed: private items are visible only to you.',
    url: `${SITE_ORIGIN}/me`,
    findings,
    ...(findings === null && {
      lint_note: 'This item will be linted when opened on AgentLemon.',
    }),
    next_step:
      'To make this item public, open My items and submit it for review.',
  })
}

export async function runAccountTool(
  name: string,
  args: unknown,
  context: Context,
) {
  switch (name) {
    case 'account_status': {
      empty.parse(args)
      const person = await profile(context)
      const confirmed = identity(context.access.idToken).verified
      const canSave =
        confirmed && !!person && context.access.scopes.includes(WRITE)
      return jsonResult({
        handle: person?.handle ?? null,
        email_confirmed: confirmed,
        tools: accountTools
          .filter(({ name }) => !writeToolNames.has(name) || canSave)
          .map(({ name }) => name),
      })
    }
    case 'list_my_items':
      return listItems(args, context)
    case 'get_item':
      return getItem(args, context)
    case 'save_agent':
      return saveItem('agent', args, context)
    case 'save_skill':
      return saveItem('skill', args, context)
    default:
      throw new Error('Unknown account tool.')
  }
}
