import { versionSchema } from './manifestSchema'

/** Semver precedence (build metadata does not increase a version). */
export function compareVersions(left: string, right: string): number {
  function parts(value: string) {
    const [version] = versionSchema.parse(value).split('+')
    const dash = version.indexOf('-')
    return {
      core: (dash < 0 ? version : version.slice(0, dash)).split('.'),
      pre: dash < 0 ? [] : version.slice(dash + 1).split('.'),
    }
  }
  const a = parts(left),
    b = parts(right)
  const numeric = (x: string, y: string) =>
    BigInt(x) < BigInt(y) ? -1 : BigInt(x) > BigInt(y) ? 1 : 0
  for (let i = 0; i < 3; i++) {
    const c = numeric(a.core[i], b.core[i])
    if (c) return c
  }
  if (!a.pre.length || !b.pre.length)
    return a.pre.length ? -1 : b.pre.length ? 1 : 0
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i],
      y = b.pre[i]
    if (x === y) continue
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x),
      ny = /^\d+$/.test(y)
    return nx && ny ? numeric(x, y) : nx !== ny ? (nx ? -1 : 1) : x < y ? -1 : 1
  }
  return 0
}
