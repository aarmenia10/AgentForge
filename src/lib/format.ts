const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatCount(value: number): string {
  return compact.format(value)
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const diff = Date.parse(iso) - now
  if (Number.isNaN(diff)) return ''
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit)
  }
  return 'just now'
}
