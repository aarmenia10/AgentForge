/**
 * Stable skills API for the UI (P3-10). The implementation lives in
 * ./skillStore (P3-9). Mirrors ./agents.ts; see docs/SKILLS.md sections 5 and 6.
 * Lists hold at most 20 skills per page (SKILLS.md 6.1).
 */
import type { SkillManifest, SkillRecord } from '../types/skill'

export const SKILL_PAGE_MAX = 20

async function store() {
  const [{ getFirebaseServices }, { createSkillStore }] = await Promise.all([
    import('../lib/firebase'),
    import('./skillStore'),
  ])
  const { db, auth } = getFirebaseServices()
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('Sign in to use your skills')
  return createSkillStore(db, auth.currentUser.uid)
}
const size = (pageSize: number) =>
  Math.max(1, Math.min(SKILL_PAGE_MAX, Math.floor(pageSize)))

export async function createSkill(manifest: SkillManifest) {
  return (await store()).createSkill(manifest)
}
export async function updateSkill(manifest: SkillManifest) {
  return (await store()).updateSkill(manifest)
}
export async function setSkillVisibility(
  skillId: string,
  visibility: SkillManifest['visibility'],
) {
  return (await store()).setSkillVisibility(skillId, visibility)
}
export async function deleteSkill(skillId: string) {
  return (await store()).deleteSkill(skillId)
}
export async function getSkillRecord(skillId: string) {
  return (await store()).getSkillRecord(skillId)
}
export async function listMySkills(
  pageSize = SKILL_PAGE_MAX,
  afterId?: string,
) {
  return (await store()).listMySkills(size(pageSize), afterId)
}
/** Page accepted friends first with listRelationships('accepted'), then one owner at a time. */
export async function listSharedSkills(
  ownerUid: string,
  pageSize = SKILL_PAGE_MAX,
  afterId?: string,
) {
  return (await store()).listSharedSkills(ownerUid, size(pageSize), afterId)
}
export async function listSkillReviewQueue(
  status: SkillRecord['review_status'] = 'pending',
  pageSize = SKILL_PAGE_MAX,
  afterId?: string,
) {
  return (await store()).listSkillReviewQueue(status, size(pageSize), afterId)
}
export async function reviewSkill(
  skillId: string,
  status: SkillRecord['review_status'],
) {
  return (await store()).reviewSkill(skillId, status)
}
export async function setSkillAuthorVerified(
  skillId: string,
  verified: boolean,
) {
  return (await store()).setSkillAuthorVerified(skillId, verified)
}
export async function getPendingSkillEdit(skillId: string) {
  return (await store()).getPendingSkillEdit(skillId)
}
export async function withdrawPendingSkillEdit(skillId: string) {
  return (await store()).withdrawPendingSkillEdit(skillId)
}
export async function listMyPendingSkillEdits(
  pageSize = SKILL_PAGE_MAX,
  afterId?: string,
) {
  return (await store()).listMyPendingSkillEdits(size(pageSize), afterId)
}
export async function listSkillEditQueue(
  status: 'pending' | 'rejected' = 'pending',
  pageSize = SKILL_PAGE_MAX,
  afterId?: string,
) {
  return (await store()).listSkillEditQueue(status, size(pageSize), afterId)
}
export async function reviewSkillEdit(
  skillId: string,
  status: 'approved' | 'rejected',
) {
  return (await store()).reviewSkillEdit(skillId, status)
}
