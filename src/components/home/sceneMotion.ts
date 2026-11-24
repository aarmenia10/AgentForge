/**
 * The lemon press's motion: slow drops from the spout, a shimmer across the
 * prism, light flowing down the streams, and ripples on the juice. One
 * requestAnimationFrame loop writes a few dozen SVG attributes per frame and
 * nothing else (no React renders, no layout reads).
 *
 * It runs at 30 frames a second while idle, 60 while the visitor is
 * squeezing or sloshing, and 20 once the page has scrolled past the hero.
 * The owner stops it while the tab is hidden or the scene is off screen.
 * With reduced motion it draws one still frame and never loops.
 */
import {
  CUPS,
  DROP_END_Y,
  HINGE,
  LEMON,
  PRISM,
  SPOUT,
  cupHalfWidthAt,
  surfaceY,
} from './sceneGeometry'

export interface JuiceNodes {
  body: SVGPathElement
  surface: SVGEllipseElement
  ring: SVGEllipseElement
}

export interface SceneNodes {
  upperJaw: SVGGElement
  lowerJaw: SVGGElement
  lemon: SVGGElement
  drops: SVGGElement[]
  /** Bright dashes on each stream line, three per stream. */
  flows: SVGPathElement[]
  shimmer: SVGLinearGradientElement
  prismCore: SVGElement
  juice: JuiceNodes[]
}

export interface SceneMotion {
  /** Pointer position in scene units, or null when it leaves. */
  pointer(x: number | null, y: number | null): void
  /** A light ripple when the pointer arrives on a cup. */
  touchCup(cup: number): void
  squeeze(): void
  slosh(cup: number): void
  /** How far the page has scrolled past the hero, 0 to 1. */
  setScroll(progress: number): void
  setRunning(on: boolean): void
  destroy(): void
}

interface Drop {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
  /** Seconds since it appeared; drops swell at the spout before falling. */
  age: number
  /** Seconds to wait before appearing (burst drops are staggered). */
  delay: number
  /** Burst drops start full size and already moving. */
  burst: boolean
}

interface Juice {
  tilt: number
  target: number
  slosh: number
  sloshAge: number
  ringAge: number
}

const GRAVITY = 300
const SWELL = 0.42
const DRIP_EVERY = 1.6
const FLOW_SPEED = 34
const SQUEEZE_TIME = 0.95
const SQUEEZE_ANGLE = 2.8
const RING_TIME = 1.7
const SLOSH_TIME = 0.5
const MAX_TILT = 0.07

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n))
const r1 = (n: number) => Math.round(n * 10) / 10
const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Press closure, 0 (open) to 1 (shut), `age` seconds into a squeeze. */
export function squeezeAmount(age: number): number {
  if (age < 0 || age >= SQUEEZE_TIME) return 0
  if (age < 0.16) return Math.sin((age / 0.16) * (Math.PI / 2))
  if (age < 0.26) return 1
  const t = age - 0.26
  return Math.max(0, Math.exp(-t / 0.13) * Math.cos((t * 2 * Math.PI) / 0.5))
}

/** Where a drop at `x` meets the prism's top faces. */
function landingY(x: number): number {
  const slope =
    (PRISM.left[1] - PRISM.apex[1]) / (PRISM.apex[0] - PRISM.left[0])
  return DROP_END_Y + Math.abs(x - PRISM.apex[0]) * slope
}

export function startSceneMotion(
  nodes: SceneNodes,
  { reduced }: { reduced: boolean },
): SceneMotion {
  let raf = 0
  let running = false
  let last = 0
  let t = 0
  let nextDrip = 0.4
  let scroll = 0
  let squeezeAge = -1
  let pressDirty = true
  let pulse = 0
  let pointer: [number, number] | null = null

  const drops: Drop[] = nodes.drops.map(() => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    age: 0,
    delay: 0,
    burst: false,
  }))
  const juice: Juice[] = CUPS.map((_, i) => ({
    tilt: 0,
    target: 0,
    slosh: 0,
    sloshAge: 9,
    // Stagger the ambient ripples so the cups never pulse together.
    ringAge: i * 0.55,
  }))

  function spawn(burst: boolean, delay = 0): void {
    const drop = drops.find((d) => !d.active)
    if (!drop) return
    drop.active = true
    drop.burst = burst
    drop.delay = delay
    drop.age = 0
    drop.x = SPOUT[0] + (burst ? (Math.random() - 0.5) * 6 : 0)
    drop.y = SPOUT[1]
    drop.vx = burst ? (Math.random() - 0.5) * 70 : 0
    drop.vy = burst ? 30 + Math.random() * 50 : 0
  }

  function busy(): boolean {
    return (
      squeezeAge >= 0 ||
      drops.some((d) => d.active && d.burst) ||
      juice.some((j) => j.sloshAge < SLOSH_TIME * 3)
    )
  }

  function step(dt: number): void {
    t += dt
    // Drops
    nextDrip -= dt
    if (nextDrip <= 0) {
      spawn(false)
      nextDrip = DRIP_EVERY + Math.random() * 0.5
    }
    for (const d of drops) {
      if (!d.active) continue
      if (d.delay > 0) {
        d.delay -= dt
        continue
      }
      d.age += dt
      if (!d.burst && d.age < SWELL) continue
      d.vy += GRAVITY * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      if (d.y >= landingY(d.x)) {
        d.active = false
        pulse = Math.min(1, pulse + (d.burst ? 0.25 : 0.55))
      }
    }
    pulse = Math.max(0, pulse - dt * 1.4)

    // Press
    if (squeezeAge >= 0) {
      const before = squeezeAge
      squeezeAge += dt
      if (before < 0.12 && squeezeAge >= 0.12)
        for (let i = 0; i < 6; i++) spawn(true, i * 0.05)
      if (squeezeAge >= SQUEEZE_TIME) squeezeAge = -1
      pressDirty = true
    }

    // Juice
    const ease = 1 - Math.exp(-dt * 4)
    juice.forEach((j, i) => {
      const cup = CUPS[i]
      if (pointer) {
        const dx = pointer[0] - cup.cx
        const dy = pointer[1] - surfaceY(cup.level)
        const near =
          clamp(1 - Math.abs(dy) / 420, 0, 1) *
          clamp(1 - Math.abs(dx) / 420, 0, 1)
        // The side nearer the pointer rises (y grows downwards).
        j.target = -clamp(dx / 240, -1, 1) * MAX_TILT * near
      } else j.target = 0
      j.tilt += (j.target - j.tilt) * ease
      j.sloshAge += dt
      j.ringAge += dt
      if (j.ringAge > RING_TIME + 0.9) j.ringAge = 0
    })
  }

  function draw(): void {
    // Drops
    drops.forEach((d, i) => {
      const el = nodes.drops[i]
      if (!d.active || d.delay > 0) {
        el.setAttribute('opacity', '0')
        return
      }
      const swell = d.burst ? 1 : clamp(d.age / SWELL, 0, 1)
      const stretch = 1 + Math.min(d.vy / 650, 0.35)
      const sx = swell / Math.sqrt(stretch)
      const sy = swell * stretch
      const fade = clamp((landingY(d.x) - d.y) / 14, 0, 1)
      el.setAttribute('opacity', String(r3(fade)))
      el.setAttribute(
        'transform',
        `translate(${r1(d.x)} ${r1(d.y)}) scale(${r3(sx)} ${r3(sy)})`,
      )
    })

    // Streams: dashes travel from the prism to the cups.
    nodes.flows.forEach((path, i) => {
      const phase = (i % 3) * 47 + Math.floor(i / 3) * 29
      path.setAttribute(
        'stroke-dashoffset',
        String(r1(-(t * FLOW_SPEED + phase))),
      )
    })

    // Prism: a band of light crosses every ten seconds; drops make it pulse.
    const band = (t % 10) / 6.5
    nodes.shimmer.setAttribute(
      'gradientTransform',
      `translate(${r1(-200 + Math.min(band, 1.2) * 330)} 0)`,
    )
    nodes.prismCore.setAttribute(
      'opacity',
      String(r3(0.62 + 0.12 * Math.sin(t * 0.9) + pulse * 0.38)),
    )

    // Press
    if (pressDirty) {
      const s = squeezeAmount(squeezeAge)
      const angle = r3(SQUEEZE_ANGLE * s)
      nodes.upperJaw.setAttribute(
        'transform',
        `rotate(${angle} ${HINGE[0]} ${HINGE[1]})`,
      )
      nodes.lowerJaw.setAttribute(
        'transform',
        `rotate(${-angle} ${HINGE[0]} ${HINGE[1]})`,
      )
      nodes.lemon.setAttribute(
        'transform',
        `translate(${LEMON[0]} ${LEMON[1]}) scale(${r3(1 + 0.05 * s)} ${r3(1 - 0.085 * s)})`,
      )
      pressDirty = squeezeAge >= 0
    }

    // Juice
    juice.forEach((j, i) => {
      const cup = CUPS[i]
      const n = nodes.juice[i]
      const sy = surfaceY(cup.level)
      const hw = cupHalfWidthAt(sy)
      const slosh =
        j.sloshAge < SLOSH_TIME * 3
          ? j.slosh *
            Math.exp(-j.sloshAge / (SLOSH_TIME * 0.9)) *
            Math.sin((j.sloshAge * 2 * Math.PI) / SLOSH_TIME)
          : 0
      const slope = j.tilt + slosh
      const left = cup.cx - hw - 6
      const right = cup.cx + hw + 6
      const yAt = (x: number) => sy + slope * (x - cup.cx)
      n.body.setAttribute(
        'd',
        `M${r1(left)} ${r1(yAt(left))}L${r1(right)} ${r1(yAt(right))}L${r1(right)} 880L${r1(left)} 880Z`,
      )
      const deg = r1((Math.atan(slope) * 180) / Math.PI)
      const wobble = Math.sin(t * 1.3 + i * 2.1) * 0.6
      n.surface.setAttribute('ry', String(r1(7 + wobble)))
      n.surface.setAttribute('transform', `rotate(${deg} ${cup.cx} ${r1(sy)})`)
      const age = j.ringAge
      if (age < RING_TIME) {
        const grow = 0.18 + 0.82 * (age / RING_TIME)
        n.ring.setAttribute('rx', String(r1((hw - 8) * grow)))
        n.ring.setAttribute('ry', String(r1(5.5 * grow)))
        n.ring.setAttribute('opacity', String(r3((1 - age / RING_TIME) * 0.7)))
        n.ring.setAttribute('transform', `rotate(${deg} ${cup.cx} ${r1(sy)})`)
      } else n.ring.setAttribute('opacity', '0')
    })
  }

  /** A still frame for reduced motion: two drops on their way, no movement. */
  function still(): void {
    t = 2.6
    drops.forEach((d) => (d.active = false))
    const placed: [number, number][] = [
      [SPOUT[1] + 4, 0],
      [SPOUT[1] + 70, 220],
    ]
    placed.forEach(([y, vy], i) => {
      const d = drops[i]
      if (!d) return
      Object.assign(d, {
        active: true,
        burst: true,
        x: SPOUT[0],
        y,
        vx: 0,
        vy,
        age: 1,
        delay: 0,
      })
    })
    juice.forEach((j) => (j.ringAge = RING_TIME * 0.35))
    draw()
  }

  function frameMs(): number {
    if (busy()) return 1000 / 60
    return scroll > 0.6 ? 1000 / 20 : 1000 / 30
  }

  function tick(now: number): void {
    raf = requestAnimationFrame(tick)
    const elapsed = now - last
    // A little slack, so a 60 Hz display reliably lands on every second frame.
    if (elapsed < frameMs() - 4) return
    last = now
    step(Math.min(elapsed, 100) / 1000)
    draw()
  }

  function setRunning(on: boolean): void {
    if (reduced || on === running) return
    running = on
    if (on) {
      last = performance.now()
      raf = requestAnimationFrame(tick)
    } else cancelAnimationFrame(raf)
  }

  if (reduced) still()
  else draw()

  return {
    pointer(x, y) {
      pointer = x === null || y === null ? null : [x, y]
    },
    touchCup(cup) {
      if (reduced) return
      const j = juice[cup]
      if (!j) return
      j.ringAge = 0
      if (j.sloshAge > SLOSH_TIME * 2) {
        j.slosh = 0.035
        j.sloshAge = 0
      }
    },
    squeeze() {
      if (reduced) return
      if (squeezeAge < 0 || squeezeAge > 0.5) squeezeAge = 0
    },
    slosh(cup) {
      if (reduced) return
      const j = juice[cup]
      if (!j) return
      j.slosh = 0.16
      j.sloshAge = 0
      j.ringAge = 0
    },
    setScroll(progress) {
      scroll = progress
    },
    setRunning,
    destroy() {
      setRunning(false)
    },
  }
}
