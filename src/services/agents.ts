import type { AgentManifest, AgentRecord } from '../types/agent'

export type ReviewStatus = AgentRecord['review_status']

async function store() {
  const [{ getFirebaseServices }, { createAgentStore }] = await Promise.all([
    import('../lib/firebase'),
    import('./agentStore'),
  ])
  const { db, auth } = getFirebaseServices()
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('Sign in to use your agents')
  return createAgentStore(db, auth.currentUser.uid)
}
export async function createAgent(manifest: AgentManifest) {
  return (await store()).createAgent(manifest)
}
export async function updateAgent(manifest: AgentManifest) {
  return (await store()).updateAgent(manifest)
}
export async function setAgentVisibility(
  agentId: string,
  visibility: AgentManifest['visibility'],
) {
  return (await store()).setAgentVisibility(agentId, visibility)
}
export async function getAgentRecord(agentId: string) {
  return (await store()).getAgentRecord(agentId)
}
export async function listMyAgents(pageSize = 20, afterId?: string) {
  return (await store()).listMyAgents(pageSize, afterId)
}
/** Page accepted friends first with listRelationships('accepted'), then query one owner at a time. */
export async function listSharedAgents(
  ownerUid: string,
  pageSize = 20,
  afterId?: string,
) {
  return (await store()).listSharedAgents(ownerUid, pageSize, afterId)
}
export async function isCurrentUserAdmin() {
  return (await store()).isCurrentUserAdmin()
}
export async function listReviewQueue(
  status: ReviewStatus = 'pending',
  pageSize = 20,
  afterId?: string,
) {
  return (await store()).listReviewQueue(status, pageSize, afterId)
}
export async function reviewAgent(agentId: string, status: ReviewStatus) {
  return (await store()).reviewAgent(agentId, status)
}
export async function setAuthorVerified(agentId: string, verified: boolean) {
  return (await store()).setAuthorVerified(agentId, verified)
}
