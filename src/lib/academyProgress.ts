export const ACADEMY_DONE_KEY = 'agentlemon.academy.done'

export function readAcademyDone(): string[] {
  try {
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(ACADEMY_DONE_KEY) ?? '[]',
    )
    return Array.isArray(saved)
      ? [...new Set(saved.filter((id): id is string => typeof id === 'string'))]
      : []
  } catch {
    return []
  }
}

export function writeAcademyDone(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(ACADEMY_DONE_KEY, JSON.stringify(ids))
  } catch {
    // Progress remains usable for this visit when browser storage is blocked.
  }
}
