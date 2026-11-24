export type MyItemsFilter = 'all' | 'agents' | 'skills' | 'councils'

const filters: readonly MyItemsFilter[] = [
  'all',
  'agents',
  'skills',
  'councils',
]

export function readMyItemsFilter(search: string): MyItemsFilter {
  const value = new URLSearchParams(search).get('show')
  return filters.find((filter) => filter === value) ?? 'all'
}

export function myItemsFilterHref(filter: MyItemsFilter): string {
  return filter === 'all' ? '/me' : `/me?show=${filter}`
}
