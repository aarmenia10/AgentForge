/**
 * P3-9 replaces this file with the real Firestore implementation. Until then
 * every method fails, so the skills screens (P3-10) can be built and type-checked
 * against the stable API in ./skills.ts while the data layer is written.
 */
import type { Firestore } from 'firebase/firestore'
import type { SkillManifest, SkillRecord } from '../types/skill'
import type { Page } from './profiles'

export interface SkillStore {
  createSkill(manifest: SkillManifest): Promise<void>
  updateSkill(manifest: SkillManifest): Promise<{ staged: boolean }>
  setSkillVisibility(
    id: string,
    visibility: SkillManifest['visibility'],
  ): Promise<void>
  getSkillRecord(id: string): Promise<SkillRecord | null>
  listMySkills(pageSize: number, afterId?: string): Promise<Page<SkillRecord>>
  listSharedSkills(
    ownerUid: string,
    pageSize: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  listSkillReviewQueue(
    status: SkillRecord['review_status'],
    pageSize: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  reviewSkill(id: string, status: SkillRecord['review_status']): Promise<void>
  setSkillAuthorVerified(id: string, verified: boolean): Promise<void>
  getPendingSkillEdit(id: string): Promise<SkillRecord | null>
  withdrawPendingSkillEdit(id: string): Promise<void>
  listMyPendingSkillEdits(
    pageSize: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  listSkillEditQueue(
    status: 'pending' | 'rejected',
    pageSize: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  reviewSkillEdit(id: string, status: 'approved' | 'rejected'): Promise<void>
}

export function createSkillStore(db: Firestore, uid: string): SkillStore {
  void db
  void uid
  const pending = () =>
    Promise.reject(new Error('Skills are not available yet (P3-9)'))
  return {
    createSkill: pending,
    updateSkill: pending,
    setSkillVisibility: pending,
    getSkillRecord: pending,
    listMySkills: pending,
    listSharedSkills: pending,
    listSkillReviewQueue: pending,
    reviewSkill: pending,
    setSkillAuthorVerified: pending,
    getPendingSkillEdit: pending,
    withdrawPendingSkillEdit: pending,
    listMyPendingSkillEdits: pending,
    listSkillEditQueue: pending,
    reviewSkillEdit: pending,
  }
}
