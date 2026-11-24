import type { CouncilIndexEntry } from '../types/council'

/**
 * Keyword filter over the public council index (`councils.json`). Every term
 * must appear in the id, name, description, tags, or a member's id or role.
 * Same matching as the Councils page; kept pure so the site-wide search and
 * tests share it.
 */
export function queryCouncils(
  councils: readonly CouncilIndexEntry[],
  keyword: string,
): CouncilIndexEntry[] {
  const terms = keyword.toLowerCase().split(/\s+/).filter(Boolean)
  return councils.filter(({ id, name, description, tags, members }) => {
    if (terms.length === 0) return true
    const text = [
      id,
      name,
      description,
      ...tags,
      ...members.flatMap(({ ref, role }) => [ref.id, role]),
    ]
      .join(' ')
      .toLowerCase()
    return terms.every((term) => text.includes(term))
  })
}
