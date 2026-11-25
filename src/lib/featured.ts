import type { HomeItemKind } from './homeFeed'

export const MAX_FEATURED_ITEMS = 3
export const MAX_FEATURED_NOTE = 140

export interface FeaturedPick {
  kind: HomeItemKind
  id: string
  note?: string
}

export interface FeaturedSelection {
  week_of: string
  items: FeaturedPick[]
}

export interface FeaturedItem extends FeaturedPick {
  version: string
  name: string
  description: string
  author_handle: string
}

export interface FeaturedFeed {
  week_of: string | null
  items: FeaturedItem[]
}

const DAY = 86_400_000

export function currentFeaturedWeek(now = new Date()): string {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7
  return new Date(now.getTime() - daysSinceMonday * DAY)
    .toISOString()
    .slice(0, 10)
}

export function featuredWeekTime(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return undefined
  const date = new Date(value + 'T00:00:00Z')
  if (date.getUTCDay() !== 1 || date.toISOString().slice(0, 10) !== value)
    return undefined
  return date.getTime()
}

export function formatFeaturedWeek(week: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(week + 'T00:00:00Z'))
}

export function isFeaturedPick(value: unknown): value is FeaturedPick {
  if (!value || typeof value !== 'object') return false
  const { kind, id, note } = value as Partial<FeaturedPick>
  return (
    (kind === 'agent' || kind === 'skill' || kind === 'council') &&
    typeof id === 'string' &&
    id.length <= 1500 &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) &&
    (note === undefined ||
      (typeof note === 'string' &&
        Array.from(note).length <= MAX_FEATURED_NOTE))
  )
}

export function parseFeaturedSelection(
  value: unknown,
): FeaturedSelection | null {
  if (!value || typeof value !== 'object') return null
  const { week_of, items } = value as Partial<FeaturedSelection>
  if (
    typeof week_of !== 'string' ||
    featuredWeekTime(week_of) === undefined ||
    !Array.isArray(items) ||
    items.length > MAX_FEATURED_ITEMS ||
    !items.every(isFeaturedPick)
  )
    return null
  return {
    week_of,
    items: items.map(({ kind, id, note }) => ({
      kind,
      id,
      ...(note === undefined ? {} : { note }),
    })),
  }
}

function isFeaturedItem(value: unknown): value is FeaturedItem {
  if (!isFeaturedPick(value)) return false
  const { version, name, description, author_handle } =
    value as Partial<FeaturedItem>
  return [version, name, description, author_handle].every(
    (field) => typeof field === 'string',
  )
}

export async function loadFeatured(
  signal: AbortSignal,
  now = new Date(),
): Promise<{ week_of: string; items: FeaturedItem[] } | null> {
  try {
    const response = await fetch('/featured.json', { signal })
    if (!response.ok) return null
    const { week_of, items } = (await response.json()) as FeaturedFeed
    const week = featuredWeekTime(week_of)
    const today = Math.floor(now.getTime() / DAY) * DAY
    if (
      week_of === null ||
      week === undefined ||
      week > today ||
      today - week > 14 * DAY ||
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > MAX_FEATURED_ITEMS ||
      !items.every(isFeaturedItem)
    )
      return null
    return { week_of, items }
  } catch {
    return null
  }
}
