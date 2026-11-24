/**
 * The 3D atom behind the home page hero. This file is the only place that
 * imports three.js, and it is only ever loaded through `React.lazy` by
 * `AtomCanvas.tsx`, so the startup bundle never contains it.
 *
 * Import only what is used: three.js is tree-shaken per named export.
 */
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { HomeItem } from '../../lib/homeFeed'
import type { AtomPalette } from '../../theme/atomPalette'

export const itemKey = (item: Pick<HomeItem, 'kind' | 'id'>) =>
  `${item.kind}:${item.id}`

const KIND_LABEL = { agent: 'Agent', skill: 'Skill', council: 'Council' }

// Scene units. The rings are 1.6 from the center; the camera frames them with
// a small margin at any canvas size (the canvas is square).
const RING_RADIUS = 1.6
const NUCLEUS_RADIUS = 0.5
const ELECTRON_RADIUS = 0.095
const HIT_RADIUS = 0.24
const CAMERA_Z = 6.3
const RING_TILT = 1.18
const AUTO_SPIN = 0.2 // radians per second around the vertical axis
const DRAG_SPEED = 0.0085 // radians per pixel
const CLICK_SLOP = 6 // pixels a press may move and still count as a click

// The palette is in sRGB, which is what the page shows; say so, or three.js
// would read the numbers as linear and wash every color out.
const rgbToColor = ([r, g, b]: readonly number[]) =>
  new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace)

interface Electron {
  item: HomeItem
  key: string
  mesh: Mesh<SphereGeometry, MeshLambertMaterial>
  halo: Mesh<SphereGeometry, MeshBasicMaterial>
  hit: Mesh<SphereGeometry, MeshBasicMaterial>
  angle: number
  speed: number
  /** 0 at rest, 1 fully highlighted. Eases toward its target. */
  glow: number
}

export interface AtomOptions {
  canvas: HTMLCanvasElement
  /** Positioned over the canvas; shows the name of the highlighted electron. */
  label: HTMLElement
  items: HomeItem[]
  palette: AtomPalette
  onOpen: (to: string) => void
  /** The GPU context was lost. The page swaps in the static atom. */
  onLost: () => void
}

export interface AtomController {
  setPalette(palette: AtomPalette): void
  /** Highlight an electron from the keyboard list, by `kind:id`, or clear it. */
  setActive(key: string | null): void
  dispose(): void
}

/** Throws when WebGL is unavailable. */
export function createAtom(options: AtomOptions): AtomController {
  const { canvas, label, items, onOpen, onLost } = options
  const box = canvas.parentElement as HTMLElement
  let palette = options.palette

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 50)
  camera.position.set(0, 0, CAMERA_Z)

  scene.add(new AmbientLight(0xffffff, 1.7))
  const key = new DirectionalLight(0xffffff, 1.5)
  key.position.set(2.5, 3, 5)
  scene.add(key)

  const atom = new Group()
  atom.rotation.set(0.55, 0.5, 0)
  scene.add(atom)

  const geometries = {
    sphere: new SphereGeometry(1, 40, 24),
    ring: new TorusGeometry(RING_RADIUS, 0.0085, 8, 160),
  }

  // Nucleus: a flat accent sphere (so the "Council" label keeps its contrast)
  // with two soft halos.
  const nucleusMaterial = new MeshBasicMaterial()
  const nucleus = new Mesh(geometries.sphere, nucleusMaterial)
  nucleus.scale.setScalar(NUCLEUS_RADIUS)
  atom.add(nucleus)
  const halos = [
    { scale: 0.74, opacity: 0.22 },
    { scale: 1.02, opacity: 0.1 },
  ].map(({ scale, opacity }) => {
    const material = new MeshBasicMaterial({
      transparent: true,
      opacity,
      depthWrite: false,
    })
    const mesh = new Mesh(geometries.sphere, material)
    mesh.scale.setScalar(scale)
    mesh.renderOrder = 2
    atom.add(mesh)
    return { mesh, material, scale }
  })

  // Three tilted rings, 60 degrees apart, each its own group so electrons
  // orbit in the ring's plane.
  const ringMaterial = new MeshBasicMaterial()
  const rings = [0, 1, 2].map((index) => {
    const group = new Group()
    group.quaternion
      .setFromAxisAngle(new Vector3(0, 0, 1), (index * Math.PI) / 3)
      .multiply(
        new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), RING_TILT),
      )
    group.add(new Mesh(geometries.ring, ringMaterial))
    atom.add(group)
    return group
  })

  const electrons: Electron[] = []
  const perRing = [0, 1, 2].map(
    (ring) => items.filter((_, i) => i % 3 === ring).length,
  )
  const slot = [0, 0, 0]
  items.forEach((item, i) => {
    const ring = i % 3
    const count = perRing[ring]
    const mesh = new Mesh(
      geometries.sphere,
      new MeshLambertMaterial({ emissiveIntensity: 0 }),
    )
    mesh.scale.setScalar(ELECTRON_RADIUS)
    const halo = new Mesh(
      geometries.sphere,
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    )
    halo.scale.setScalar(ELECTRON_RADIUS * 2.6)
    halo.renderOrder = 2
    const hit = new Mesh(
      geometries.sphere,
      new MeshBasicMaterial({ visible: false }),
    )
    hit.scale.setScalar(HIT_RADIUS)
    rings[ring].add(mesh, halo, hit)
    electrons.push({
      item,
      key: itemKey(item),
      mesh,
      halo,
      hit,
      angle: (slot[ring]++ / count) * Math.PI * 2 + ring * 0.9,
      speed: (ring === 1 ? -0.3 : 0.26) + ring * 0.05,
      glow: 0,
    })
  })

  const bgColor = new Color()
  function applyPalette() {
    const accent = rgbToColor(palette.accent)
    nucleusMaterial.color.copy(accent)
    for (const halo of halos) halo.material.color.copy(accent)
    ringMaterial.color.copy(rgbToColor(palette.ring))
    bgColor.copy(rgbToColor(palette.bg))
    for (const electron of electrons) {
      const color = rgbToColor(
        electron.item.kind === 'agent' ? palette.agent : palette.skill,
      )
      electron.mesh.material.color.copy(color)
      electron.mesh.material.emissive.copy(color)
      electron.halo.material.color.copy(color)
    }
  }
  applyPalette()

  // ----------------------------------------------------------- interaction

  const raycaster = new Raycaster()
  const ndc = new Vector2()
  const worldPoint = new Vector3()
  const spinAxisX = new Vector3(1, 0, 0)
  const spinAxisY = new Vector3(0, 1, 0)
  const qa = new Quaternion()
  const qb = new Quaternion()
  const hits = electrons.map((electron) => electron.hit)

  function pickAt(clientX: number, clientY: number): Electron | null {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    )
    raycaster.setFromCamera(ndc, camera)
    const [first] = raycaster.intersectObjects(hits, false)
    return first
      ? (electrons.find((e) => e.hit === first.object) ?? null)
      : null
  }

  function rotateBy(yaw: number, pitch: number) {
    // Rotations about the screen's axes, so a drag follows the pointer.
    qa.setFromAxisAngle(spinAxisY, yaw)
    qb.setFromAxisAngle(spinAxisX, pitch)
    atom.quaternion.premultiply(qa).premultiply(qb).normalize()
  }

  let hovered: Electron | null = null
  let forced: Electron | null = null
  let pointer: { x: number; y: number } | null = null
  let drag: {
    id: number
    startX: number
    startY: number
    x: number
    y: number
    time: number
    moved: boolean
  } | null = null
  let spinYaw = AUTO_SPIN
  let spinPitch = 0

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (drag) return
    canvas.setPointerCapture(event.pointerId)
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      moved: false,
    }
    canvas.style.cursor = 'grabbing'
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch') {
      pointer = { x: event.clientX, y: event.clientY }
    }
    if (!drag || event.pointerId !== drag.id) return
    const now = performance.now()
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >
        CLICK_SLOP
    ) {
      drag.moved = true
    }
    rotateBy(dx * DRAG_SPEED, dy * DRAG_SPEED)
    const dt = Math.max(0.008, (now - drag.time) / 1000)
    // Remember the swing so a flick keeps turning, then eases back to the spin.
    spinYaw = Math.max(-6, Math.min(6, (dx * DRAG_SPEED) / dt))
    spinPitch = Math.max(-6, Math.min(6, (dy * DRAG_SPEED) / dt))
    drag.x = event.clientX
    drag.y = event.clientY
    drag.time = now
  }

  function endDrag(event: PointerEvent, click: boolean) {
    if (!drag || event.pointerId !== drag.id) return
    const wasClick = click && !drag.moved
    drag = null
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId)
    if (wasClick) {
      const hit = pickAt(event.clientX, event.clientY)
      if (hit) onOpen(hit.item.to)
    }
  }

  const onPointerUp = (event: PointerEvent) => endDrag(event, true)
  const onPointerCancel = (event: PointerEvent) => endDrag(event, false)
  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') pointer = null
  }
  const onContextLost = (event: Event) => {
    event.preventDefault()
    stop()
    onLost()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('webglcontextlost', onContextLost)

  // ----------------------------------------------------------- frame loop

  function size() {
    const width = Math.max(1, box.clientWidth)
    const height = Math.max(1, box.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    // Keep the whole atom in view when the box is wider than tall or the reverse.
    camera.fov =
      camera.aspect >= 1
        ? 35
        : (Math.atan(Math.tan((35 * Math.PI) / 360) / camera.aspect) * 360) /
          Math.PI
    camera.updateProjectionMatrix()
  }

  function placeLabel(target: Electron | null) {
    if (!target) {
      if (label.dataset.shown) {
        delete label.dataset.shown
        label.style.opacity = '0'
      }
      return
    }
    const text = `${KIND_LABEL[target.item.kind]}: ${target.item.name}`
    if (label.textContent !== text) label.textContent = text
    target.mesh.getWorldPosition(worldPoint)
    worldPoint.project(camera)
    const width = box.clientWidth
    const half = label.offsetWidth / 2
    const x = Math.max(
      half + 4,
      Math.min(width - half - 4, ((worldPoint.x + 1) / 2) * width),
    )
    const y = ((1 - worldPoint.y) / 2) * box.clientHeight
    label.style.left = `${x}px`
    label.style.top = `${y}px`
    label.dataset.shown = '1'
    label.style.opacity = '1'
  }

  let last = 0
  let raf = 0
  let running = false
  let onScreen = true

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now

    // Hover: the pointer's electron wins over the keyboard's.
    hovered = !drag && pointer ? pickAt(pointer.x, pointer.y) : null
    const active = hovered ?? forced
    canvas.style.cursor = drag ? 'grabbing' : hovered ? 'pointer' : 'grab'

    // Spin eases back to the slow automatic turn; it nearly stops over an electron.
    if (!drag) {
      const calm = active ? 0.12 : 1
      const ease = 1 - Math.exp(-dt * 2.2)
      spinYaw += (AUTO_SPIN * calm - spinYaw) * ease
      spinPitch += (0 - spinPitch) * ease
      rotateBy(spinYaw * dt, spinPitch * dt)
    }

    const orbit = active ? 0.15 : 1
    const glowEase = 1 - Math.exp(-dt * 12)
    for (const electron of electrons) {
      electron.angle += electron.speed * orbit * dt
      electron.mesh.position.set(
        Math.cos(electron.angle) * RING_RADIUS,
        Math.sin(electron.angle) * RING_RADIUS,
        0,
      )
      electron.halo.position.copy(electron.mesh.position)
      electron.hit.position.copy(electron.mesh.position)
      electron.glow +=
        ((electron === active ? 1 : 0) - electron.glow) * glowEase
    }

    atom.updateMatrixWorld(true)
    const pulse = 1 + Math.sin(now / 900) * 0.035
    halos.forEach((halo, i) =>
      halo.mesh.scale.setScalar(halo.scale * pulse ** (i + 1)),
    )

    for (const electron of electrons) {
      electron.mesh.getWorldPosition(worldPoint)
      // Far side of the atom reads a little dimmer, which gives it depth.
      const near = (worldPoint.z + RING_RADIUS) / (RING_RADIUS * 2)
      const base = rgbToColor(
        electron.item.kind === 'agent' ? palette.agent : palette.skill,
      )
      electron.mesh.material.color.copy(base).lerp(bgColor, (1 - near) * 0.42)
      electron.mesh.material.emissiveIntensity = electron.glow * 0.9
      electron.mesh.scale.setScalar(ELECTRON_RADIUS * (1 + electron.glow * 0.5))
      electron.halo.material.opacity = electron.glow * 0.22
      electron.halo.scale.setScalar(
        ELECTRON_RADIUS * (2.4 + electron.glow * 0.6),
      )
    }

    placeLabel(active)
    renderer.render(scene, camera)
  }

  function start() {
    if (running) return
    running = true
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  function stop() {
    running = false
    cancelAnimationFrame(raf)
  }

  // Render only while the tab is visible and the atom is on screen.
  function sync() {
    if (onScreen && !document.hidden) start()
    else stop()
  }

  const resizeObserver = new ResizeObserver(() => {
    size()
    if (!running) renderer.render(scene, camera)
  })
  resizeObserver.observe(box)
  const intersectionObserver = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1]?.isIntersecting ?? true
    sync()
  })
  intersectionObserver.observe(box)
  document.addEventListener('visibilitychange', sync)

  size()
  renderer.render(scene, camera)
  sync()

  return {
    setPalette(next) {
      palette = next
      applyPalette()
      if (!running) renderer.render(scene, camera)
    },
    setActive(keyOrNull) {
      forced = keyOrNull
        ? (electrons.find((electron) => electron.key === keyOrNull) ?? null)
        : null
    },
    dispose() {
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', sync)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      for (const geometry of Object.values(geometries)) geometry.dispose()
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material]
        for (const material of materials) material.dispose()
      })
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
