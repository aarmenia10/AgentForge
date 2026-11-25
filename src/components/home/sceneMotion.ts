/**
 * The lemon press's motion: slow drops from both lemon tips, a shimmer across the
 * prism, light flowing down the streams, and ripples on the juice. One
 * requestAnimationFrame loop writes a few dozen SVG attributes per frame and
 * nothing else (no React renders, no layout reads).
 *
 * It runs at 30 frames a second while idle, 60 while the visitor is
 * squeezing or sloshing, and 20 once the page has scrolled past the hero.
 * The owner stops it while the tab is hidden or the scene is off screen.
 */
import { CUPS, TIPS, HINGE, LEMON, surfaceY } from './sceneGeometry'

export interface JuiceNodes {
  body: SVGPathElement
  surface: SVGEllipseElement
  ring: SVGEllipseElement
}

export interface SceneNodes {
  lever: SVGGElement
  ram: SVGGElement
  lemon: SVGGElement
  drops: SVGGElement[]
  /** Highlights travel down the straight inlet and outlet sections. */
  flows: SVGCircleElement[]
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
  cup: number
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
  rise: number
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
const SQUEEZE_ANGLE = 9
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

export function startSceneMotion(nodes: SceneNodes): SceneMotion {
  let raf = 0
  let running = false
  let last = 0
  let t = 0
  let nextDrip = 0.1
  let scroll = 0
  let squeezeAge = -1
  let pressDirty = true
  let pulse = 0
  let pointer: [number, number] | null = null

  const drops: Drop[] = nodes.drops.map(() => ({
    cup: 0,
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
    rise: 0,
    tilt: 0,
    target: 0,
    slosh: 0,
    sloshAge: 9,
    // Stagger the ambient ripples so the cups never pulse together.
    ringAge: i * 0.55,
  }))

  function spawn(cup: number, burst: boolean, delay = 0): void {
    const drop = drops.find((d) => !d.active)
    if (!drop) return
    drop.cup = cup
    drop.active = true
    drop.burst = burst
    drop.delay = delay
    drop.age = 0
    drop.x = TIPS[cup][0]
    drop.y = TIPS[cup][1] + 4
    drop.vx = burst ? (Math.random() - 0.5) * 15 : 0
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
      spawn(0, false)
      spawn(1, false, 0.24)
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
      if (d.y >= surfaceY(CUPS[d.cup]) - juice[d.cup].rise) {
        juice[d.cup].rise = Math.min(8, juice[d.cup].rise + 3)
        juice[d.cup].ringAge = 0
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
        for (let i = 0; i < 6; i++) spawn(i % 2, true, i * 0.085)
      if (squeezeAge >= SQUEEZE_TIME) squeezeAge = -1
      pressDirty = true
    }

    // Juice
    const ease = 1 - Math.exp(-dt * 4)
    juice.forEach((j, i) => {
      const cup = CUPS[i]
      // An impact raises an inlet briefly. Its surplus drains to the outlet.
      if (i === 2) j.rise += (juice[0].rise + juice[1].rise) * dt * 0.55
      j.rise *= Math.exp(-dt * 0.8)
      if (pointer) {
        const dx = pointer[0] - cup.cx
        const dy = pointer[1] - surfaceY(cup)
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
      const fade = clamp(
        (surfaceY(CUPS[d.cup]) - juice[d.cup].rise - d.y) / 14,
        0,
        1,
      )
      el.setAttribute('opacity', String(r3(fade)))
      el.setAttribute(
        'transform',
        `translate(${r1(d.x)} ${r1(d.y)}) scale(${r3(sx)} ${r3(sy)})`,
      )
    })

    nodes.flows.forEach((flow, i) => {
      const phase = ((t * FLOW_SPEED) / 90 + i * 0.31) % 1
      flow.setAttribute(
        'transform',
        `translate(0 ${r1(phase * (i === 2 ? 80 : 32))})`,
      )
      flow.setAttribute('opacity', String(r3(Math.sin(Math.PI * phase) * 0.8)))
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
      nodes.lever.setAttribute(
        'transform',
        `rotate(${angle} ${HINGE[0]} ${HINGE[1]})`,
      )
      nodes.ram.setAttribute('transform', `translate(0 ${r1(12 * s)})`)
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
      const sy = surfaceY(cup)
      const slosh =
        j.sloshAge < SLOSH_TIME * 3
          ? j.slosh *
            Math.exp(-j.sloshAge / (SLOSH_TIME * 0.9)) *
            Math.sin((j.sloshAge * 2 * Math.PI) / SLOSH_TIME)
          : 0
      const slope = j.tilt + slosh
      const deg = r1((Math.atan(slope) * 180) / Math.PI)
      const tilt = `translate(0 ${r1(-j.rise)}) rotate(${deg} ${cup.cx} ${r1(sy)})`
      n.body.setAttribute('transform', tilt)
      n.surface.setAttribute('transform', tilt)
      const age = j.ringAge
      if (age < RING_TIME) {
        const grow = r3(0.18 + (0.82 * age) / RING_TIME)
        n.ring.setAttribute(
          'transform',
          `${tilt} translate(${cup.cx} ${r1(sy)}) scale(${grow})`,
        )
        n.ring.setAttribute('opacity', String(r3((1 - age / RING_TIME) * 0.7)))
      } else n.ring.setAttribute('opacity', '0')
    })
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
    if (on === running) return
    running = on
    if (on) {
      last = performance.now()
      raf = requestAnimationFrame(tick)
    } else cancelAnimationFrame(raf)
  }

  draw()

  return {
    pointer(x, y) {
      pointer = x === null || y === null ? null : [x, y]
    },
    touchCup(cup) {
      const j = juice[cup]
      if (!j) return
      j.ringAge = 0
      if (j.sloshAge > SLOSH_TIME * 2) {
        j.slosh = 0.035
        j.sloshAge = 0
      }
    },
    squeeze() {
      if (squeezeAge < 0 || squeezeAge > 0.5) squeezeAge = 0
    },
    slosh(cup) {
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
