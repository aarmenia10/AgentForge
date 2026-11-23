/**
 * Pure logic behind the council builder (My items, "New council"). No React,
 * no Firebase: the component keeps its state in these shapes and this file
 * decides what is allowed. Limits and checks come from councilSchema so the
 * builder and the store can never disagree.
 */
import {
  COUNCIL_MAX_MEMBERS,
  COUNCIL_MIN_MEMBERS,
  validateCouncilManifest,
} from './councilSchema'
import { formatItemRef } from './skillSchema'
import { COUNCIL_SCHEMA_VERSION, type CouncilManifest } from '../types/council'
import type { ItemKind, ItemRef } from '../types/skill'

export { COUNCIL_MAX_MEMBERS, COUNCIL_MIN_MEMBERS }

/** A council the builder saves starts at this version and stays private. */
export const NEW_COUNCIL_VERSION = '1.0.0'
/** The id is a slug; a long name is cut so the id stays readable. */
export const COUNCIL_ID_SUGGEST_MAX = 48

/** Something that can be picked as a member: current version only. */
export interface MemberCandidate {
  kind: ItemKind
  id: string
  /** The version the member will be pinned to: the item's current version. */
  version: string
  name: string
  description?: string
  /** Where it came from, shown beside the name. */
  source: 'mine' | 'public'
  /** Handle of the author, for public items. */
  handle?: string
}

/** A member as the builder holds it. `key` is stable across reordering. */
export interface DraftMember {
  key: number
  ref: ItemRef
  name: string
  source: MemberCandidate['source']
  role: string
  order: number
}

/** Everything the builder form holds, as typed by the person. */
export interface CouncilDraft {
  id: string
  name: string
  description: string
  /** Comma or space separated, as typed. */
  tags: string
  instructions: string
  members: DraftMember[]
}

export type FieldErrors = Record<string, string[]>

/* ---------- Text helpers ---------- */

/** Lowercase letters, digits, and single hyphens. May return an empty string. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The id suggested from a council name: its slug, kept short. */
export function suggestCouncilId(name: string): string {
  return slugify(name).slice(0, COUNCIL_ID_SUGGEST_MAX).replace(/-+$/, '')
}

/** Tags as typed (commas or spaces) to unique slugs. Empty entries vanish. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>()
  for (const part of text.split(/[,\s]+/)) {
    const tag = slugify(part)
    if (tag) seen.add(tag)
  }
  return [...seen]
}

/* ---------- Members ---------- */

/** The pin for a candidate. It always names the candidate's current version. */
export function pinCandidate(candidate: MemberCandidate): ItemRef {
  return {
    kind: candidate.kind,
    id: candidate.id,
    version: candidate.version,
  }
}

const itemKey = ({ kind, id }: ItemRef) => `${kind}:${id}`

/** True when the same agent or skill is already a member, at any version. */
export function hasMember(
  members: readonly DraftMember[],
  ref: ItemRef,
): boolean {
  return members.some((member) => itemKey(member.ref) === itemKey(ref))
}

/** Stable sort by stage, so the list always reads in running order. */
export function sortMembers(members: readonly DraftMember[]): DraftMember[] {
  return members
    .map((member, index) => ({ member, index }))
    .sort((a, b) => a.member.order - b.member.order || a.index - b.index)
    .map(({ member }) => member)
}

export type MemberChange =
  { ok: true; members: DraftMember[] } | { ok: false; error: string }

/**
 * Adds a candidate pinned to its current version. A new member goes in the
 * next stage after the last one; the person can give it the same stage as
 * another member to run them together.
 */
export function addMember(
  members: readonly DraftMember[],
  candidate: MemberCandidate,
): MemberChange {
  if (members.length >= COUNCIL_MAX_MEMBERS)
    return {
      ok: false,
      error: `A council holds at most ${COUNCIL_MAX_MEMBERS} members.`,
    }
  const ref = pinCandidate(candidate)
  if (hasMember(members, ref))
    return {
      ok: false,
      error: `${candidate.name} is already a member (${formatItemRef(ref)}).`,
    }
  const key = members.reduce((max, member) => Math.max(max, member.key), 0) + 1
  const order = members.reduce((max, member) => Math.max(max, member.order), 0)
  return {
    ok: true,
    members: sortMembers([
      ...members,
      {
        key,
        ref,
        name: candidate.name,
        source: candidate.source,
        role: '',
        order: order + 1,
      },
    ]),
  }
}

export function removeMember(
  members: readonly DraftMember[],
  key: number,
): DraftMember[] {
  return members.filter((member) => member.key !== key)
}

/** Stage numbers are whole numbers from 1. Anything else becomes 1. */
export function cleanOrder(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1
}

export function setMemberOrder(
  members: readonly DraftMember[],
  key: number,
  order: number,
): DraftMember[] {
  return sortMembers(
    members.map((member) =>
      member.key === key ? { ...member, order: cleanOrder(order) } : member,
    ),
  )
}

export function setMemberRole(
  members: readonly DraftMember[],
  key: number,
  role: string,
): DraftMember[] {
  return members.map((member) =>
    member.key === key ? { ...member, role } : member,
  )
}

/**
 * Moves a member one place up or down the running order. Two members in
 * different stages trade stage numbers, so the list stays sorted and the
 * move changes who runs first. Two in the same stage only trade places in
 * the list, which changes nothing about the run.
 */
export function moveMember(
  members: readonly DraftMember[],
  key: number,
  direction: -1 | 1,
): DraftMember[] {
  const list = sortMembers(members)
  const from = list.findIndex((member) => member.key === key)
  const to = from + direction
  if (from < 0 || to < 0 || to >= list.length) return list
  const next = [...list]
  const a = next[from]!
  const b = next[to]!
  next[from] = { ...b, order: a.order }
  next[to] = { ...a, order: b.order }
  // Same stage: orders already equal, only the positions changed.
  return next
}

/* ---------- Search ---------- */

/** Keeps candidates that match every word typed, in the order given. */
export function filterCandidates(
  candidates: readonly MemberCandidate[],
  keyword: string,
  limit = 8,
): MemberCandidate[] {
  const terms = keyword.toLowerCase().split(/\s+/).filter(Boolean)
  const found = candidates.filter((candidate) => {
    const haystack = [
      candidate.name,
      candidate.id,
      candidate.description ?? '',
      candidate.handle ?? '',
      candidate.kind,
    ]
      .join(' ')
      .toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
  return found.slice(0, limit)
}

/* ---------- Validation and the save input ---------- */

/** The input councilStore.create takes (no author, no stats). */
export type NewCouncilInput = Omit<CouncilManifest, 'author' | 'stats'>

export function toCouncilInput(draft: CouncilDraft): NewCouncilInput {
  return {
    council_schema_version: COUNCIL_SCHEMA_VERSION,
    visibility: 'private',
    id: draft.id.trim(),
    version: NEW_COUNCIL_VERSION,
    name: draft.name.trim(),
    description: draft.description.trim(),
    tags: parseTags(draft.tags),
    instructions: draft.instructions.trim(),
    members: sortMembers(draft.members).map(({ ref, role, order }) => ({
      ref,
      role: role.trim(),
      order,
    })),
  }
}

/** Stand-ins for what the store fills in, so the full manifest check runs. */
const PLACEHOLDER_AUTHOR = {
  uid: 'builder',
  name: 'Builder',
  handle: 'builder',
  verified: false,
} as const

const SINGLE_FIELDS = ['id', 'name', 'description', 'instructions', 'tags']
const ID_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Where each issue path is shown: the field it belongs to. */
function fieldFor(path: string): string {
  const parts = path.split('.')
  if (parts[0] === 'members' && parts[1] !== undefined)
    return `members.${parts[1]}.${parts[2] ?? 'ref'}`
  if (parts[0] === 'tags') return 'tags'
  return parts[0] === '(root)' ? 'form' : parts[0]!
}

/**
 * Runs validateCouncilManifest over the draft and files each problem under
 * the field it belongs to: `id`, `name`, `description`, `tags`,
 * `instructions`, `members` (the list as a whole), `members.<n>.role`,
 * `members.<n>.order`, `members.<n>.ref` (n counts the members in running
 * order), and `form` for anything else. Empty means ready to save.
 */
export function validateDraft(draft: CouncilDraft): FieldErrors {
  const errors: FieldErrors = {}
  const add = (field: string, message: string) => {
    const list = (errors[field] ??= [])
    if (!list.includes(message)) list.push(message)
  }

  const input = toCouncilInput(draft)
  if (!input.id) add('id', 'Give the council an ID.')
  else if (!ID_SHAPE.test(input.id))
    add('id', 'Use lowercase letters, digits, and single hyphens.')
  if (!input.name) add('name', 'Give the council a name.')
  if (!input.description) add('description', 'Describe what it does.')
  if (!input.instructions)
    add('instructions', 'Say how the members work together.')
  if (!input.tags.length) add('tags', 'Add at least one tag.')

  // The schema only reaches its member-count check once every shape rule
  // passes, so say it here too (same words, so it is never listed twice).
  if (input.members.length < COUNCIL_MIN_MEMBERS)
    add('members', `Council must have at least ${COUNCIL_MIN_MEMBERS} members`)
  if (input.members.length > COUNCIL_MAX_MEMBERS)
    add(
      'members',
      `Council cannot have more than ${COUNCIL_MAX_MEMBERS} members`,
    )
  const result = validateCouncilManifest({
    ...input,
    author: PLACEHOLDER_AUTHOR,
    stats: { updated_at: new Date(0).toISOString() },
  })
  if (!result.ok)
    for (const { path, message } of result.issues) {
      const field = fieldFor(path)
      // A blank or missing field already has a plainer message above.
      if (SINGLE_FIELDS.includes(field) && errors[field]) continue
      add(field, message)
    }
  return errors
}

export const hasErrors = (errors: FieldErrors) => Object.keys(errors).length > 0

/* ---------- Save errors ---------- */

export interface SaveProblem {
  /** The field to show it beside, when it belongs to one. */
  field?: string
  message: string
}

/**
 * Turns whatever councilStore.create threw into words for the person.
 * Firestore and network errors keep their raw text out of the screen.
 */
export function describeSaveError(error: unknown): SaveProblem {
  const code = (error as { code?: string } | null)?.code
  const message = error instanceof Error ? error.message : ''
  if (/council id is taken/i.test(message))
    return {
      field: 'id',
      message: 'That ID is taken. Pick a different one.',
    }
  if (/choose your username/i.test(message))
    return {
      message: 'Choose your username in Settings before saving a council.',
    }
  if (/sign in/i.test(message))
    return { message: 'Sign in again, then save the council.' }
  if (code === 'permission-denied')
    return {
      message:
        'The council was not saved. Confirm your email, and check that every member is yours or public.',
    }
  if (code === 'unavailable' || code === 'deadline-exceeded')
    return { message: 'Could not reach the server. Try again in a moment.' }
  // Validation text from the store ("path: message" lines) is already plain.
  if (/^(\(root\)|[a-z][\w.]*): /.test(message)) return { message }
  return { message: 'Could not save the council. Try again.' }
}
