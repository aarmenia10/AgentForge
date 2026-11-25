import { hasBlockedWord } from '../src/lib/blockedWords'
import type { FeaturedFeed, FeaturedSelection } from '../src/lib/featured'
import type { PublicExport } from './export-catalog'

export function buildFeatured(
  selection: FeaturedSelection | null | undefined,
  {
    catalog,
    skillIndex,
    councilIndex,
  }: Pick<PublicExport, 'catalog' | 'skillIndex' | 'councilIndex'>,
): FeaturedFeed {
  if (!selection) return { week_of: null, items: [] }

  // These three inventories have already passed this run's publication checks.
  const inventory = {
    agent: catalog,
    skill: skillIndex.skills,
    council: councilIndex.councils,
  }
  const items: FeaturedFeed['items'] = []
  const seen = new Set<string>()
  for (const { kind, id, note } of selection.items) {
    const key = `${kind}:${id}`
    const entry = inventory[kind].find((item) => item.id === id)
    if (!entry || seen.has(key)) continue
    seen.add(key)
    items.push({
      kind,
      id,
      version: entry.version,
      name: entry.name,
      description: entry.description,
      ...(note && !hasBlockedWord(note) ? { note } : {}),
      author_handle: entry.author.handle,
    })
  }
  return items.length
    ? { week_of: selection.week_of, items }
    : { week_of: null, items }
}
