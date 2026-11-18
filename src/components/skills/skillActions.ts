/**
 * The skill screens' calls to src/services/skills.ts, written against an
 * injected API so tests can drive them with fakes. Components pass the real
 * module (`import * as skillsApi from '@/services/skills'`). Every error that
 * reaches a screen goes through describeServiceError.
 */
import { validateSkillManifest, validateSkillRecord } from '@/lib/skillSchema'
import { describeServiceError, type ServiceAction } from '@/lib/studioErrors'
import type { Page } from '@/services/profiles'
import type { SkillManifest, SkillRecord } from '@/types/skill'
import { draftFromRecord, savedMessage, type SkillDraft } from './skillDraft'

export interface SkillsApi {
  createSkill(manifest: SkillManifest): Promise<void>
  updateSkill(manifest: SkillManifest): Promise<{ staged: boolean }>
  setSkillVisibility(
    id: string,
    visibility: SkillManifest['visibility'],
  ): Promise<void>
  getSkillRecord(id: string): Promise<SkillRecord | null>
  getPendingSkillEdit(id: string): Promise<SkillRecord | null>
  withdrawPendingSkillEdit(id: string): Promise<void>
  listMySkills(pageSize?: number, afterId?: string): Promise<Page<SkillRecord>>
  listMyPendingSkillEdits(
    pageSize?: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  listSharedSkills(
    ownerUid: string,
    pageSize?: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  listSkillReviewQueue(
    status?: SkillRecord['review_status'],
    pageSize?: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  listSkillEditQueue(
    status?: 'pending' | 'rejected',
    pageSize?: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  reviewSkill(id: string, status: SkillRecord['review_status']): Promise<void>
  reviewSkillEdit(id: string, status: 'approved' | 'rejected'): Promise<void>
  setSkillAuthorVerified(id: string, verified: boolean): Promise<void>
}

/** A failure already turned into a sentence for the page. */
export class ScreenError extends Error {}

function fail(error: unknown, action: ServiceAction): never {
  throw new ScreenError(describeServiceError(error, action, 'skill'))
}

/* ---------- Upload and edit ---------- */

export type EditLoad =
  | {
      ok: true
      live: SkillRecord
      pendingEdit: SkillRecord | null
      draft: SkillDraft
    }
  | { ok: false; message: string }

export async function loadSkillForEdit(
  api: SkillsApi,
  id: string,
  uid: string,
): Promise<EditLoad> {
  let record: SkillRecord | null
  let edit: SkillRecord | null
  try {
    ;[record, edit] = await Promise.all([
      api.getSkillRecord(id),
      api.getPendingSkillEdit(id),
    ])
  } catch (error) {
    return {
      ok: false,
      message: describeServiceError(error, 'load', 'skill'),
    }
  }
  if (!record)
    return {
      ok: false,
      message: 'There is no skill with that id that you can edit.',
    }
  if (record.owner_uid !== uid)
    return { ok: false, message: 'You can only edit your own skills.' }
  return {
    ok: true,
    live: record,
    pendingEdit: edit,
    draft: draftFromRecord(edit ?? record),
  }
}

export type SaveResult =
  | { kind: 'created'; id: string; message: string }
  | {
      kind: 'updated'
      message: string
      live: SkillRecord | null
      pendingEdit: SkillRecord | null
    }

/** Validates, then creates or updates. Throws ScreenError with a sentence. */
export async function saveSkill(
  api: SkillsApi,
  manifest: SkillManifest,
  live: SkillRecord | null,
): Promise<SaveResult> {
  const final = validateSkillManifest(manifest)
  if (!final.ok)
    throw new ScreenError(
      'Some parts are not valid. Fix the marked items and try again.',
    )
  const skill = final.value
  if (!live) {
    try {
      await api.createSkill(skill)
    } catch (error) {
      fail(error, 'save')
    }
    return {
      kind: 'created',
      id: skill.id,
      message: savedMessage(skill.visibility, false, null),
    }
  }
  let staged: boolean
  try {
    ;({ staged } = await api.updateSkill(skill))
  } catch (error) {
    fail(error, 'save')
  }
  // The save worked; a failed refresh only leaves the banners stale.
  const [fresh, pendingEdit] = await Promise.all([
    api.getSkillRecord(skill.id).catch(() => live),
    api.getPendingSkillEdit(skill.id).catch(() => null),
  ])
  return {
    kind: 'updated',
    message: savedMessage(skill.visibility, staged, live),
    live: fresh,
    pendingEdit,
  }
}

/* ---------- My items ---------- */

/** Every waiting edit of the user's, a few pages at most. */
export async function loadMyPendingEdits(
  api: SkillsApi,
  pageSize: number,
  maxPages = 10,
): Promise<Map<string, SkillRecord>> {
  const found = new Map<string, SkillRecord>()
  let after: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const page = await api.listMyPendingSkillEdits(pageSize, after)
    for (const edit of page.items) found.set(edit.id, edit)
    if (!page.cursor || page.items.length < pageSize) break
    after = page.cursor
  }
  return found
}

export function visibilityMessage(
  record: SkillRecord,
  visibility: SkillRecord['visibility'],
): string {
  if (visibility === 'public')
    return 'Sent for review. Once a person approves it, it appears on the skills page within about an hour.'
  if (record.visibility === 'public' && record.review_status === 'approved')
    return 'Changed. It leaves the public skills page on the next refresh, within about an hour.'
  return visibility === 'friends'
    ? 'Changed. Your friends can see it now.'
    : 'Changed. Only you can see it now.'
}

export async function changeSkillVisibility(
  api: SkillsApi,
  record: SkillRecord,
  visibility: SkillRecord['visibility'],
): Promise<{ fresh: SkillRecord | null; message: string }> {
  try {
    await api.setSkillVisibility(record.id, visibility)
  } catch (error) {
    fail(error, 'visibility')
  }
  const fresh = await api.getSkillRecord(record.id).catch(() => null)
  return { fresh, message: visibilityMessage(record, visibility) }
}

/* ---------- Shared with me ---------- */

/**
 * One page of a friend's skills. Records that fail validateSkillRecord are
 * left out and counted (docs/SKILLS.md 6.2: readers refuse what the rules
 * cannot catch, such as a script relabelled as reference).
 */
export async function loadFriendSkills(
  api: SkillsApi,
  uid: string,
  pageSize: number,
  after?: string,
): Promise<{ items: SkillRecord[]; refused: number; cursor: string | null }> {
  let page: Page<SkillRecord>
  try {
    page = await api.listSharedSkills(uid, pageSize, after)
  } catch (error) {
    fail(error, 'list')
  }
  const items = page.items.filter((s) => validateSkillRecord(s).ok)
  return {
    items,
    refused: page.items.length - items.length,
    cursor: page.cursor && page.items.length === pageSize ? page.cursor : null,
  }
}

/* ---------- Review ---------- */

export type ReviewKind = 'submission' | 'edit' | 'published'

export function fetchReviewPage(
  api: SkillsApi,
  kind: ReviewKind,
  pageSize: number,
  after?: string,
): Promise<Page<SkillRecord>> {
  if (kind === 'edit') return api.listSkillEditQueue('pending', pageSize, after)
  return api.listSkillReviewQueue(
    kind === 'published' ? 'approved' : 'pending',
    pageSize,
    after,
  )
}

export type ReviewDecision = 'approve' | 'reject' | 'take-down'

/** The service call behind each reviewer button. */
export function runReviewDecision(
  api: SkillsApi,
  kind: ReviewKind,
  decision: ReviewDecision,
  id: string,
): Promise<void> {
  if (kind === 'edit')
    return api.reviewSkillEdit(
      id,
      decision === 'approve' ? 'approved' : 'rejected',
    )
  // Taking down an approved skill sets it to rejected, as for agents.
  return api.reviewSkill(id, decision === 'approve' ? 'approved' : 'rejected')
}
