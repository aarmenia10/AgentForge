import {
  councilManifestSchema,
  formatCouncilRef as formatCouncilItem,
  validateCouncilRecord,
} from '../../../src/lib/councilSchema'
import { lintCouncil } from '../../../src/services/councilSafety'
import { formatItemRef } from '../../../src/lib/skillSchema'
import type { ItemRef } from '../../../src/types/skill'
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
import type { Grant } from './grants'
import {
  clientOriginApp,
  createPortabilityBlock,
  type OriginApp,
} from '../../../src/lib/portability'
import {
  checkSelfContained,
  type SelfContainedWarning,
} from '../../../src/lib/selfContained'

const kind = z.enum(['agent', 'skill', 'council'])
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
const save_anyway = z.boolean().optional()
const memberAgentArgs = z.strictObject({ manifest: agentInput })
const memberSkillArgs = z.strictObject({ skill: skillInput })
const saveAgentArgs = memberAgentArgs.extend({ save_anyway })
const saveSkillArgs = memberSkillArgs.extend({ save_anyway })
const saveCouncilArgs = z.strictObject({
  save_anyway,
  manifest: councilManifestSchema
    .omit({ origin_app: true })
    .partial({ author: true, visibility: true, stats: true }),
  member_items: z
    .array(
      z.discriminatedUnion('kind', [
        memberAgentArgs.extend({ kind: z.literal('agent') }),
        memberSkillArgs.extend({ kind: z.literal('skill') }),
      ]),
    )
    .max(20)
    .optional(),
})
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
  'saved_from_chat',
  'origin_app',
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
  'Call only when the user asks to save or export. That request is confirmation. Include the full item and every file it uses as text. AgentLemon checks before saving. If it returns saved: false, fix the warnings yourself and call again. Use save_anyway: true only for gaps you cannot fix. After saving, say in a sentence or two what was saved and whether it is ready for other AIs. Saving creates a new private item and cannot replace an existing one.'
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
    'List only your own items and their review status. With no kind filter, pages cover agents, then skills, then councils. Follow next_cursor until it is null, including after an empty page.',
    listArgs,
  ),
  tool(
    'get_item',
    'Get an AgentLemon item',
    READ,
    'Read a full agent blueprint, skill or council you can access, including your own private and friends items, which the public tools (search_*, get_skill, get_agent, get_council) cannot see. Accepts an ID and an optional exact version.',
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
  tool(
    'save_council',
    'Save a private council',
    WRITE,
    saveDescription +
      ' Pin exact member versions and include the full content of missing members in member_items. The check covers the council and all supplied members. The council and missing members save together.',
    saveCouncilArgs,
  ),
]
export const accountToolNames = new Set(accountTools.map(({ name }) => name))
export const writeToolNames = new Set([
  'save_agent',
  'save_skill',
  'save_council',
])

interface Context {
  access: Access
  db: Firestore
  now: () => number
  publicAgent: (id: string, version?: string) => Promise<AgentManifest | null>
  publicSkill: (id: string, version?: string) => Promise<SkillManifest | null>
  grant?: Grant
  publicOrigins?:
    Record<string, OriginApp> | (() => Promise<Record<string, OriginApp>>)
}

const profileSchema = z.object({
  handle: manifestSchema.shape.author.shape.handle,
  display_name: z.string().min(1),
})
async function profile({ db, access }: Context) {
  const doc = await db.get(`users/${access.uid}`)
  return doc ? profileSchema.parse(doc.fields) : null
}

const collections = {
  agent: 'agents',
  skill: 'skills',
  council: 'councils',
} as const
const itemCollection = (kind: keyof typeof collections) => collections[kind]

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
  const limit = Math.min(args.limit ?? 20, itemKind === 'agent' ? 25 : 20)
  const items = await db.list(
    itemCollection(itemKind),
    access.uid,
    metadataFields,
    limit,
    args.visibility,
    cursor?.after,
  )
  const last = items.at(-1)
  const next = (kind: z.infer<typeof cursorSchema>['kind'], after?: unknown) =>
    JSON.stringify({
      kind,
      after,
      filter: args.kind,
      visibility: args.visibility,
    })
  const next_cursor =
    items.length === limit
      ? next(itemKind, last?.id)
      : !args.kind && itemKind !== 'council'
        ? next(itemKind === 'agent' ? 'skill' : 'council')
        : null
  const sanitizedItems = items.map((item) => {
    const base = { kind: itemKind, ...item } as Record<string, unknown> & {
      kind: typeof itemKind
      visibility?: unknown
    }
    if (base.visibility === 'private') {
      const rest = { ...base }
      delete (rest as Record<string, unknown>).review_status
      return {
        ...rest,
        review: 'Not needed: private items are visible only to you.',
      }
    }
    if (base.visibility === 'friends') {
      const rest = { ...base }
      delete (rest as Record<string, unknown>).review_status
      return {
        ...rest,
        review: 'Not needed: friends items are visible only to your friends.',
      }
    }
    return base
  })
  return jsonResult({
    items: sanitizedItems,
    next_cursor,
  })
}

/**
 * get_item errors. "Not found" and "someone else's private item" read the
 * same, so the error never reveals whether another person's item exists.
 */
const notVisible = (kind: string, id: string) =>
  `This ${kind} is unavailable: "${id}" was not found or is not visible to your account. Check the ID with list_my_items.`
const versionDiffers = (
  kind: string,
  id: string,
  requested: string,
  current: string,
) =>
  `This ${kind} version is unavailable: "${id}" is at version ${current}, not ${requested}. Private and friends items keep only their current version, so a council pinned to an older version cannot load it. Read the current version, or ask the owner to save the old one under a new ID.`

async function getItem(
  input: unknown,
  { db, publicAgent, publicSkill, publicOrigins }: Context,
) {
  const { kind, id, version } = getArgs.parse(input)
  if (kind === 'council') {
    const doc = await readableItem(db, 'councils/' + id)
    const parsed = validateCouncilRecord(doc?.fields)
    if (!parsed.ok || parsed.value.id !== id)
      throw new Error(notVisible('council', id))
    if (version && parsed.value.version !== version)
      throw new Error(
        versionDiffers('council', id, version, parsed.value.version),
      )
    const { review_status } = parsed.value
    const council = councilManifestSchema.strip().parse(parsed.value)
    return jsonResult({
      notice: BLUEPRINT_NOTICE,
      kind,
      council,
      review_status,
      portability: createPortabilityBlock(
        council.instructions,
        council.origin_app as OriginApp | undefined,
        council,
      ),
    })
  }
  let item = await (kind === 'agent' ? publicAgent : publicSkill)(
    id,
    version,
  ).catch(() => null)
  let docFields: Record<string, unknown> | undefined
  if (!item) {
    const unavailable = () => new Error(notVisible(kind, id))
    const doc = await db.get(`${itemCollection(kind)}/${id}`).catch((error) => {
      if (error instanceof FirestoreError && error.status === 403)
        throw unavailable()
      throw error
    })
    if (!doc || doc.fields.id !== id) throw unavailable()
    if (version && doc.fields.version !== version)
      throw new Error(
        versionDiffers(kind, id, version, String(doc.fields.version)),
      )
    docFields = doc.fields
    if (kind === 'agent') item = manifestSchema.strip().parse(doc.fields)
    else {
      const parsed = validateSkillManifest(
        skillManifestSchema.strip().parse(doc.fields),
      )
      if (!parsed.ok) throw unavailable()
      item = parsed.value
    }
  }
  const reviewField =
    item.visibility === 'private'
      ? { review: 'Not needed: private items are visible only to you.' }
      : item.visibility === 'friends'
        ? {
            review:
              'Not needed: friends items are visible only to your friends.',
          }
        : { review_status: (docFields?.review_status as string) ?? 'approved' }

  const originsMap =
    typeof publicOrigins === 'function' ? await publicOrigins() : publicOrigins
  const originApp: OriginApp | undefined =
    (docFields?.origin_app as OriginApp | undefined) ??
    (kind === 'agent'
      ? originsMap?.[`${item.id}@${item.version}`]
      : (item as SkillManifest).origin_app)

  const portability = createPortabilityBlock(item, originApp)

  return 'prompt_blueprint' in item
    ? jsonResult({
        notice: BLUEPRINT_NOTICE,
        kind,
        agent: item,
        blueprint: renderBlueprint(item),
        ...reviewField,
        portability,
      })
    : jsonResult({
        notice: `${BLUEPRINT_NOTICE} Do not run skill scripts without the user’s explicit request.`,
        kind,
        skill: item,
        ...reviewField,
        portability,
      })
}

export function prepareChatSave(
  kind: 'agent' | 'skill',
  input: unknown,
  uid: string,
  person: z.infer<typeof profileSchema>,
  time: number,
  originApp?: OriginApp,
) {
  const args =
    kind === 'agent' ? saveAgentArgs.parse(input) : saveSkillArgs.parse(input)
  const data = 'manifest' in args ? args.manifest : args.skill
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
    ...(originApp && { origin_app: originApp }),
  }
  if (kind === 'agent') {
    const manifest = manifestSchema.parse(normalized)
    return {
      record: { ...manifest, ...metadata, shared_with: [] },
      findings: skipLint ? null : lintManifest(manifest).findings,
      saveAnyway: args.save_anyway,
      // Unlike the linter, always run, whatever the size (R4).
      warnings: checkSelfContained(manifest, 'agent'),
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
    saveAnyway: args.save_anyway,
    warnings: checkSelfContained(validated.value, 'skill'),
  }
}

const WARNINGS_NEXT_STEP =
  'Fix these warnings yourself using the files and context in this chat. Read every file the item mentions and include it as a text reference file for skills, or put the needed text in agent or council instructions. For a .docx or PDF, write a Markdown description of its layout and include a short example excerpt. Replace phrases like "this project" with the actual content. Describe what each tool does and give a fallback. Ask the user only for facts you cannot find, such as a web address. Call the same tool again with the corrected item and the same ID. If a gap truly cannot be fixed, call again with save_anyway: true and tell the user in one sentence what is still missing.'

type ExportWarning = SelfContainedWarning & { item?: string }

function needsRevision(warnings: ExportWarning[]) {
  return jsonResult({
    saved: false,
    self_contained_warnings: warnings,
    next_step: WARNINGS_NEXT_STEP,
  })
}

function savedStatus(warnings: ExportWarning[], nextStep: string) {
  return {
    saved: true,
    ready_for_other_ais: warnings.length === 0,
    self_contained_warnings: warnings,
    next_step: warnings.length
      ? `Tell the user in one sentence what is still missing. ${nextStep}`
      : nextStep,
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
  const originApp = clientOriginApp(context.grant?.app)
  const { record, findings, warnings, saveAnyway } = prepareChatSave(
    kind,
    input,
    access.uid,
    person,
    context.now(),
    originApp,
  )
  if (warnings.length && saveAnyway !== true) return needsRevision(warnings)
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
    ...savedStatus(
      warnings,
      'To make this item public, open My items and submit it for review.',
    ),
  })
}

async function readableItem(db: Firestore, path: string) {
  return db.get(path).catch((error: unknown) => {
    if (error instanceof FirestoreError && error.status === 403) return null
    throw error
  })
}

async function saveCouncil(input: unknown, context: Context) {
  const { access, db } = context
  if (!identity(access.idToken).verified)
    throw new Error(
      'Confirm your AgentLemon email address before saving items.',
    )
  const person = await profile(context)
  if (!person)
    throw new Error('Choose your AgentLemon username before saving items.')
  const {
    manifest,
    member_items = [],
    save_anyway,
  } = saveCouncilArgs.parse(input)
  const time = context.now()
  const origin = clientOriginApp(context.grant?.app)
  const result = validateCouncilRecord({
    ...manifest,
    visibility: 'private',
    owner_uid: access.uid,
    author: {
      uid: access.uid,
      name: person.display_name,
      handle: person.handle,
      verified: false,
    },
    review_status: 'pending',
    saved_from_chat: true,
    origin_app: origin,
    stats: { updated_at: new Date(time).toISOString() },
  })
  if (!result.ok)
    throw new Error(
      result.issues
        .map(({ path, message }) => path + ': ' + message)
        .join(', '),
    )
  const council = result.value
  const pins = new Set(council.members.map(({ ref }) => formatItemRef(ref)))
  const supplied = new Map<string, (typeof member_items)[number]>()
  for (const { kind, ...input } of member_items) {
    const item = 'manifest' in input ? input.manifest : input.skill
    const ref = formatItemRef({ kind, id: item.id, version: item.version })
    if (!pins.has(ref) || supplied.has(ref))
      throw new Error('Unexpected or repeated payload for ' + ref)
    supplied.set(ref, { kind, ...input } as (typeof member_items)[number])
  }
  // Always check the council and every supplied member, even for existing pins.
  const warnings = checkSelfContained(council, 'council').map((warning) => ({
    item: formatCouncilItem(council.id, council.version),
    ...warning,
  }))
  for (const [ref, payload] of supplied) {
    const item = 'manifest' in payload ? payload.manifest : payload.skill
    warnings.push(
      ...checkSelfContained(item, payload.kind).map((warning) => ({
        item: ref,
        ...warning,
      })),
    )
  }
  if (warnings.length && save_anyway !== true) return needsRevision(warnings)

  const prepare = async ({ kind, id, version }: ItemRef) => {
    const path = itemCollection(kind) + '/' + id
    const existing = await readableItem(db, path)
    if (
      existing?.fields.owner_uid === access.uid &&
      existing.fields.version === version
    )
      return
    const published = await (
      kind === 'agent' ? context.publicAgent : context.publicSkill
    )(id, version).catch(() => null)
    if (
      published?.id === id &&
      published.version === version &&
      published.visibility === 'public'
    )
      return
    const pin = formatItemRef({ kind, id, version })
    if (existing)
      throw new Error(
        'The exact version is unavailable and the ID is already in use: ' + pin,
      )
    const payload = supplied.get(pin)
    if (!payload)
      throw new Error(
        'Provide the full member content or an available exact pin for ' + pin,
      )
    const fields = prepareChatSave(
      payload.kind,
      payload.kind === 'agent'
        ? { manifest: payload.manifest }
        : { skill: payload.skill },
      access.uid,
      person,
      time,
      origin,
    ).record
    return { path, fields }
  }
  const writes: { path: string; fields: object }[] = []
  const missing = []
  for (let start = 0; start < council.members.length; start += 4) {
    const prepared = await Promise.all(
      council.members.slice(start, start + 4).map(({ ref }) => prepare(ref)),
    )
    for (const item of prepared)
      if (item) {
        if (writes.some(({ path }) => path === item.path))
          throw new Error(
            'Multiple unpublished versions share the same member ID.',
          )
        writes.push(item)
        missing.push(item.path)
      }
  }
  const findings =
    encoder.encode(council.instructions).byteLength <= INLINE_LINT_BYTES
      ? lintCouncil(council).findings
      : null
  if (council.members.length > 8) {
    const prefix =
      'councils/' + council.id + '/member_checks/' + access.uid + '/groups/'
    await Promise.all(
      Array.from(
        { length: Math.ceil(council.members.length / 5) },
        (_, group) =>
          db.setWithRequestTime(
            prefix + group,
            {
              owner_uid: access.uid,
              mode: 'private',
              members: council.members,
            },
            'checked_at',
          ),
      ),
    )
  }
  try {
    await db.createItems([
      ...writes,
      { path: 'councils/' + council.id, fields: council },
    ])
  } catch (error) {
    if (error instanceof FirestoreError && error.conflict)
      throw new Error(
        'A council or missing member ID is already in use. Refresh the exact pins and retry.',
        { cause: error },
      )
    throw error
  }
  return jsonResult({
    id: council.id,
    kind: 'council',
    visibility: 'private',
    url: SITE_ORIGIN + '/me',
    members_saved: missing,
    findings,
    ...(findings === null && {
      lint_note: 'AgentLemon will lint the council before sharing.',
    }),
    ...savedStatus(
      warnings,
      'Editing or deleting a private member later can break this council, because private items keep only their current version. To share the council, open My items and choose its visibility.',
    ),
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
    case 'save_council':
      return saveCouncil(args, context)
    default:
      throw new Error('Unknown account tool.')
  }
}
