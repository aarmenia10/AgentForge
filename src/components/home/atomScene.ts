/**
 * The 3D atom behind the home page hero. This file is the only place that
 * imports three.js, and it is only ever loaded through `React.lazy` by
 * `AtomCanvas.tsx`, so the startup bundle never contains it.
 *
 * Everything is procedural: geometry, small shaders, and two canvas-drawn
 * gradient textures. No image files.
 *
 * Rendering: the scene draws into a transparent canvas. Glow is additive and
 * bloom spreads it; the last pass turns brightness into alpha, so the light
 * falls softly onto whatever dark page or stage sits behind the canvas, with
 * no visible box edge.
 *
 * Import only what is used: three.js is tree-shaken per named export.
 */
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Curve,
  CustomBlending,
  DirectionalLight,
  EdgesGeometry,
  Group,
  HalfFloatType,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  OneFactor,
  PerspectiveCamera,
  PMREMGenerator,
  Points,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  SrcAlphaFactor,
  Texture,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  ZeroFactor,
  type Blending,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import type { HomeItem } from '../../lib/homeFeed'
import type { AtomPalette } from '../../theme/atomPalette'

export const itemKey = (item: Pick<HomeItem, 'kind' | 'id'>) =>
  `${item.kind}:${item.id}`

/** The keyboard list's key for the nucleus. */
export const COUNCIL_KEY = 'council'
const COUNCIL_PATH = '/councils'

const KIND_LABEL = { agent: 'Agent', skill: 'Skill', council: 'Council' }

// Scene units. The widest ring reaches 1.8 from the center; the camera frames
// it with a margin for glow at any canvas size.
const CAMERA_Z = 6.9
const FOV = 35
const ELECTRON_RADIUS = 0.058
const HIT_RADIUS = 0.22
const NUCLEUS_HIT_RADIUS = 0.6
const AUTO_SPIN = 0.13 // radians per second around the vertical axis
const DRAG_SPEED = 0.0085 // radians per pixel
const CLICK_SLOP = 6 // pixels a press may move and still count as a click
const TRAIL_POINTS = 44
const TRAIL_STEP = 0.013 // radians between trail points

/** Ellipse radii and the turn of each orbit's plane. Two-tone: one warm ring. */
const RINGS = [
  { a: 1.74, b: 1.62, z: 0.0, x: 1.22, warm: false, speed: 0.24 },
  { a: 1.6, b: 1.52, z: 1.15, x: 1.28, warm: true, speed: -0.28 },
  { a: 1.82, b: 1.7, z: 2.2, x: 1.14, warm: false, speed: 0.2 },
  { a: 1.5, b: 1.44, z: 0.55, x: 0.42, warm: false, speed: -0.22 },
] as const

/** The palette is sRGB, which is what the page shows. */
const rgbToColor = ([r, g, b]: readonly number[]) =>
  new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace)

/**
 * Additive light that leaves the alpha channel alone: the last pass derives
 * alpha from brightness, so glow never paints a dark box over the page.
 */
function glowMaterial<T extends Material>(material: T): T {
  material.transparent = true
  material.depthWrite = false
  material.blending = CustomBlending as Blending
  material.blendSrc = SrcAlphaFactor
  material.blendDst = OneFactor
  material.blendSrcAlpha = ZeroFactor
  material.blendDstAlpha = OneFactor
  return material
}

/** A soft round spot, white in the middle, drawn once on a canvas. */
function glowTexture(): Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    )
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.18, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.45, 'rgba(255,255,255,0.14)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

class Ellipse extends Curve<Vector3> {
  constructor(
    private a: number,
    private b: number,
  ) {
    super()
  }
  getPoint(t: number, target = new Vector3()) {
    const angle = t * Math.PI * 2
    return target.set(Math.cos(angle) * this.a, Math.sin(angle) * this.b, 0)
  }
}

// ---------------------------------------------------------------- shaders

/** A billboard glow: a camera-facing quad with the soft spot on it. */
const SPRITE_VERTEX = /* glsl */ `
  uniform float uScale;
  uniform float uPush;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uScale;
    // Pushed away from the camera, so the nucleus glow shows only through
    // its gaps and around its edge instead of washing over it.
    mv.z -= uPush;
    gl_Position = projectionMatrix * mv;
  }
`
const SPRITE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float a = texture2D(uMap, vUv).a * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`

/**
 * Orbit tubes. The far half fades (depth relative to the ring's own center,
 * in view space) and the tube's edges soften, so a wide faint tube reads as a
 * halo and a thin bright one as the line. A slow bright pulse travels along.
 */
const RING_VERTEX = /* glsl */ `
  uniform float uRadius;
  varying float vFront;
  varying float vU;
  varying float vFacing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vFront = clamp((mv.z - center.z) / uRadius * 0.5 + 0.5, 0.0, 1.0);
    vU = uv.x;
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`
const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uEdge;
  uniform float uTime;
  uniform float uFlow;
  varying float vFront;
  varying float vU;
  varying float vFacing;
  void main() {
    float depth = mix(0.1, 1.0, smoothstep(0.05, 0.95, vFront));
    float pulse = pow(0.5 + 0.5 * cos(6.2831853 * (vU - uTime * uFlow)), 30.0);
    float a = uOpacity * depth * pow(vFacing, uEdge);
    gl_FragColor = vec4(uColor * (1.0 + pulse * 1.8), a);
  }
`

/** Round soft points with their own size, color, and fade: trails and dust. */
const POINTS_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSoft;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uScale;
  uniform float uTime;
  uniform float uDrift;
  varying float vAlpha;
  varying float vSoft;
  varying vec3 vColor;
  void main() {
    vec3 p = position;
    // Dust drifts on slow loops and twinkles; trails pass uDrift = 0.
    float t = uTime * 0.12 + aSeed * 6.2831853;
    p += uDrift * vec3(sin(t), cos(t * 0.8), sin(t * 0.6)) * (0.08 + aSoft * 0.2);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
    float twinkle = 1.0 - uDrift * 0.45 * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0));
    vAlpha = aAlpha * twinkle;
    vSoft = aSoft;
    vColor = aColor;
  }
`
const POINTS_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying float vSoft;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-d * d * mix(7.0, 2.2, vSoft)) * smoothstep(1.0, 0.75, d);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`

/** Last pass: alpha from brightness, so light lands on the page behind. */
const ALPHA_SHADER = {
  uniforms: { tDiffuse: { value: null as Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float a = clamp(max(c.a, max(c.r, max(c.g, c.b))), 0.0, 1.0);
      gl_FragColor = vec4(min(c.rgb, vec3(a)), a);
    }
  `,
}

// ---------------------------------------------------------------- types

interface Glow {
  mesh: Mesh<BufferGeometry, ShaderMaterial>
  set(color: Color, opacity: number, scale: number): void
}

interface Electron {
  item: HomeItem
  key: string
  ring: number
  mesh: Mesh<SphereGeometry, MeshBasicMaterial>
  glow: Glow
  hit: Mesh<SphereGeometry, MeshBasicMaterial>
  angle: number
  speed: number
  /** 0 at rest, 1 fully highlighted. Eases toward its target. */
  lit: number
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
  /** Highlight an electron (`kind:id`) or the nucleus (`council`), or clear it. */
  setActive(key: string | null): void
  dispose(): void
}

/** Fibonacci points on a sphere: even spacing without a visible pattern. */
function fibonacciSphere(count: number, radius: number, twist = 0): Vector3[] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - ((i + 0.5) / count) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = golden * i + twist
    return new Vector3(
      Math.cos(theta) * r * radius,
      y * radius,
      Math.sin(theta) * r * radius,
    )
  })
}

/** A small deterministic random, so the dust looks the same on every visit. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Throws when WebGL is unavailable. */
export function createAtom(options: AtomOptions): AtomController {
  const { canvas, label, items, onOpen, onLost } = options
  const box = canvas.parentElement as HTMLElement
  let palette = options.palette

  // Phones (coarse pointer or narrow screen) get half the particles, half the
  // bloom resolution, and a lower pixel ratio cap.
  const phone =
    (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
    window.innerWidth < 640
  const maxPixelRatio = phone ? 1.5 : 2
  // Lowered at run time if frames are slow (see frame()).
  let pixelRatioCap = maxPixelRatio

  const renderer = new WebGLRenderer({
    canvas,
    antialias: false, // the composer's own multisampled target antialiases
    alpha: true,
    powerPreference: 'default',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.95
  renderer.outputColorSpace = SRGBColorSpace

  const scene = new Scene()
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60)
  camera.position.set(0, 0, CAMERA_Z)

  // Glossy highlights on the nucleons come from a generated room, not a file.
  const pmrem = new PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const envTarget = pmrem.fromScene(room, 0.04)
  room.dispose()
  pmrem.dispose()

  const key = new DirectionalLight(0xffffff, 1.8)
  key.position.set(-2.5, 3, 4)
  const rim = new DirectionalLight(0xffffff, 2.4)
  rim.position.set(2, -1.5, -4)
  scene.add(key, rim)

  const atom = new Group()
  atom.rotation.set(0.42, 0.55, 0.08)
  scene.add(atom)

  const textures = { glow: glowTexture() }
  const quad = new BufferGeometry()
  quad.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
      3,
    ),
  )
  quad.setAttribute(
    'uv',
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
  )
  quad.setIndex([0, 1, 2, 0, 2, 3])

  const geometries: BufferGeometry[] = [quad]
  const keep = <T extends BufferGeometry>(g: T) => (geometries.push(g), g)
  const sphere = keep(new SphereGeometry(1, 32, 20))
  const nucleonSphere = keep(new SphereGeometry(1, 28, 18))

  function makeGlow(push = 0): Glow {
    const material = glowMaterial(
      new ShaderMaterial({
        uniforms: {
          uMap: { value: textures.glow },
          uColor: { value: new Color() },
          uOpacity: { value: 1 },
          uScale: { value: 1 },
          uPush: { value: push },
        },
        vertexShader: SPRITE_VERTEX,
        fragmentShader: SPRITE_FRAGMENT,
      }),
    )
    const mesh = new Mesh(quad, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 3
    return {
      mesh,
      set(color, opacity, scale) {
        material.uniforms.uColor.value.copy(color)
        material.uniforms.uOpacity.value = opacity
        material.uniforms.uScale.value = scale
      },
    }
  }

  // ------------------------------------------------------------- nucleus

  const nucleus = new Group()
  const NUCLEUS_SCALE = 1.22
  atom.add(nucleus)

  // Two Fibonacci layers of glossy nucleons, packed with small gaps through
  // which the hot core shows.
  const outer = fibonacciSphere(28, 0.34)
  const inner = fibonacciSphere(10, 0.16, 1.3)
  const nucleonHome = [...outer, ...inner]
  const nucleonSize = nucleonHome.map((_, i) =>
    i < outer.length ? 0.1 + ((i * 7) % 5) * 0.003 : 0.1,
  )
  // Tone per nucleon: about half accent, a third deep, the rest graphite.
  const nucleonTone = nucleonHome.map((_, i) => [0, 1, 0, 2, 1, 0][i % 6])
  const nucleonMaterial = new MeshPhysicalMaterial({
    roughness: 0.2,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    envMap: envTarget.texture,
    envMapIntensity: 0.28,
    emissive: 0xffffff,
    emissiveIntensity: 0.07,
  })
  // Each nucleon glows faintly in its own color (instance color), so graphite
  // stays dark while the lemon ones warm up.
  nucleonMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif',
    )
  }
  const nucleons = new InstancedMesh(
    nucleonSphere,
    nucleonMaterial,
    nucleonHome.length,
  )
  nucleus.add(nucleons)

  const coreMaterial = new MeshBasicMaterial()
  const core = new Mesh(sphere, coreMaterial)
  core.scale.setScalar(0.22)
  nucleus.add(core)

  const coreGlow = makeGlow(0.3)
  const outerGlow = makeGlow(0.6)
  nucleus.add(coreGlow.mesh, outerGlow.mesh)

  // A faint geodesic shell with bright vertices, turning slowly the other way.
  const shellGeometry = keep(new IcosahedronGeometry(0.68, 1))
  const shellEdges = keep(new EdgesGeometry(shellGeometry, 1))
  const shellMaterial = glowMaterial(new LineBasicMaterial({ opacity: 0.2 }))
  const shell = new LineSegments(shellEdges, shellMaterial)
  nucleus.add(shell)

  const nucleusHit = new Mesh(sphere, new MeshBasicMaterial({ visible: false }))
  nucleusHit.scale.setScalar(NUCLEUS_HIT_RADIUS)
  atom.add(nucleusHit)

  // ------------------------------------------------------------- orbits

  const ringGroups = RINGS.map((ring) => {
    const group = new Group()
    group.quaternion
      .setFromAxisAngle(new Vector3(0, 0, 1), ring.z)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), ring.x))
    atom.add(group)
    return group
  })

  const ringMaterials = RINGS.map((ring, i) => {
    const curve = new Ellipse(ring.a, ring.b)
    // A crisp line and a wide soft halo around it.
    return [
      { radius: 0.0065, opacity: 0.95, edge: 0.6 },
      { radius: 0.04, opacity: 0.09, edge: 2.4 },
    ].map(({ radius, opacity, edge }) => {
      const material = glowMaterial(
        new ShaderMaterial({
          uniforms: {
            uColor: { value: new Color() },
            uOpacity: { value: opacity },
            uEdge: { value: edge },
            uRadius: { value: Math.max(ring.a, ring.b) },
            uTime: { value: 0 },
            uFlow: { value: 0.035 + i * 0.008 },
          },
          vertexShader: RING_VERTEX,
          fragmentShader: RING_FRAGMENT,
        }),
      )
      const tube = keep(new TubeGeometry(curve, 320, radius, 8, true))
      const mesh = new Mesh(tube, material)
      mesh.renderOrder = 2
      ringGroups[i].add(mesh)
      return material
    })
  })

  // ------------------------------------------------------------- electrons

  const electrons: Electron[] = []
  const perRing = RINGS.map(
    (_, ring) => items.filter((_, i) => i % RINGS.length === ring).length,
  )
  const slot = RINGS.map(() => 0)
  items.forEach((item, i) => {
    const ring = i % RINGS.length
    const mesh = new Mesh(sphere, new MeshBasicMaterial())
    mesh.scale.setScalar(ELECTRON_RADIUS)
    const glow = makeGlow()
    const hit = new Mesh(sphere, new MeshBasicMaterial({ visible: false }))
    hit.scale.setScalar(HIT_RADIUS)
    ringGroups[ring].add(mesh, glow.mesh, hit)
    electrons.push({
      item,
      key: itemKey(item),
      ring,
      mesh,
      glow,
      hit,
      angle: (slot[ring]++ / perRing[ring]) * Math.PI * 2 + ring * 0.7,
      speed: RINGS[ring].speed,
      lit: 0,
    })
  })

  // Trails: a run of soft points behind each electron along its orbit.
  const trailCount = electrons.length * TRAIL_POINTS
  const trailGeometry = keep(new BufferGeometry())
  const trailPositions = new Float32Array(trailCount * 3)
  const trailColors = new Float32Array(trailCount * 3)
  const trailSize = new Float32Array(trailCount)
  const trailAlpha = new Float32Array(trailCount)
  for (let e = 0; e < electrons.length; e++) {
    for (let k = 0; k < TRAIL_POINTS; k++) {
      const fade = 1 - k / TRAIL_POINTS
      trailSize[e * TRAIL_POINTS + k] = 0.06 * (0.3 + 0.7 * fade)
      trailAlpha[e * TRAIL_POINTS + k] = 0.4 * fade * fade
    }
  }
  const trailPositionAttr = new BufferAttribute(trailPositions, 3)
  const trailColorAttr = new BufferAttribute(trailColors, 3)
  trailGeometry.setAttribute('position', trailPositionAttr)
  trailGeometry.setAttribute('aColor', trailColorAttr)
  trailGeometry.setAttribute('aSize', new BufferAttribute(trailSize, 1))
  trailGeometry.setAttribute('aAlpha', new BufferAttribute(trailAlpha, 1))
  trailGeometry.setAttribute(
    'aSoft',
    new BufferAttribute(new Float32Array(trailCount).fill(0.4), 1),
  )
  trailGeometry.setAttribute(
    'aSeed',
    new BufferAttribute(new Float32Array(trailCount), 1),
  )
  const pointsUniforms = () => ({
    uScale: { value: 1 },
    uTime: { value: 0 },
    uDrift: { value: 0 },
  })
  const trailMaterial = glowMaterial(
    new ShaderMaterial({
      uniforms: pointsUniforms(),
      vertexShader: POINTS_VERTEX,
      fragmentShader: POINTS_FRAGMENT,
    }),
  )
  const trails = new Points(trailGeometry, trailMaterial)
  trails.frustumCulled = false
  trails.renderOrder = 2
  scene.add(trails)

  // ------------------------------------------------------------- dust

  // Three depths: many tiny far specks, some mid ones around the atom, and a
  // few large soft ones close to the camera.
  const random = seeded(1124)
  const layers = [
    { share: 0.62, z: [-9, -3], size: [0.02, 0.035], alpha: 0.5, soft: 0.1 },
    { share: 0.3, z: [-2.5, 2], size: [0.022, 0.04], alpha: 0.55, soft: 0.3 },
    { share: 0.08, z: [2.5, 4.6], size: [0.06, 0.12], alpha: 0.12, soft: 1 },
  ]
  const dustCount = phone ? 260 : 520
  const dustGeometry = keep(new BufferGeometry())
  const dustPositions = new Float32Array(dustCount * 3)
  const dustColors = new Float32Array(dustCount * 3)
  const dustSize = new Float32Array(dustCount)
  const dustAlpha = new Float32Array(dustCount)
  const dustSoft = new Float32Array(dustCount)
  const dustSeed = new Float32Array(dustCount)
  const dustTone = new Uint8Array(dustCount)
  const halfView = Math.tan((FOV * Math.PI) / 360)
  {
    let i = 0
    for (const layer of layers) {
      const n = Math.round(dustCount * layer.share)
      for (let k = 0; k < n && i < dustCount; k++, i++) {
        const z = layer.z[0] + random() * (layer.z[1] - layer.z[0])
        const reach = (CAMERA_Z - z) * halfView * 1.15
        dustPositions.set(
          [(random() * 2 - 1) * reach, (random() * 2 - 1) * reach, z],
          i * 3,
        )
        dustSize[i] = layer.size[0] + random() * (layer.size[1] - layer.size[0])
        dustAlpha[i] = layer.alpha * (0.4 + random() * 0.6)
        dustSoft[i] = layer.soft
        dustSeed[i] = random()
        const r = random()
        dustTone[i] = r < 0.7 ? 0 : r < 0.85 ? 1 : 2
      }
    }
  }
  dustGeometry.setAttribute('position', new BufferAttribute(dustPositions, 3))
  const dustColorAttr = new BufferAttribute(dustColors, 3)
  dustGeometry.setAttribute('aColor', dustColorAttr)
  dustGeometry.setAttribute('aSize', new BufferAttribute(dustSize, 1))
  dustGeometry.setAttribute('aAlpha', new BufferAttribute(dustAlpha, 1))
  dustGeometry.setAttribute('aSoft', new BufferAttribute(dustSoft, 1))
  dustGeometry.setAttribute('aSeed', new BufferAttribute(dustSeed, 1))
  const dustMaterial = glowMaterial(
    new ShaderMaterial({
      uniforms: { ...pointsUniforms(), uDrift: { value: 1 } },
      vertexShader: POINTS_VERTEX,
      fragmentShader: POINTS_FRAGMENT,
    }),
  )
  const dust = new Points(dustGeometry, dustMaterial)
  dust.frustumCulled = false
  dust.renderOrder = 1
  scene.add(dust)

  // ------------------------------------------------------------- post

  const composer = new EffectComposer(
    renderer,
    new WebGLRenderTarget(1, 1, { type: HalfFloatType }),
  )
  // Only the buffer the scene and the bloom draw into is multisampled (it
  // antialiases the thin orbits); the later passes use plain buffers. Two
  // passes swap buffers each frame (output, alpha), an even number, so this
  // stays the read buffer the scene renders into.
  const sceneTarget = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    samples: 4,
  })
  composer.renderTarget2.dispose()
  composer.renderTarget2 = sceneTarget
  composer.readBuffer = sceneTarget
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.5, 0.42, 0.82)
  // The bloom already starts at half resolution; phones halve it again.
  const bloomSetSize = bloom.setSize.bind(bloom)
  const bloomScale = phone ? 0.5 : 1
  bloom.setSize = (w: number, h: number) =>
    bloomSetSize(Math.max(1, w * bloomScale), Math.max(1, h * bloomScale))
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  composer.addPass(new ShaderPass(ALPHA_SHADER))

  // ------------------------------------------------------------- colors

  const colors = {
    accent: new Color(),
    agent: new Color(),
    skill: new Color(),
    warmWhite: new Color(),
  }
  const scratch = new Color()
  const white = new Color(1, 1, 1)

  function applyPalette() {
    colors.accent.copy(rgbToColor(palette.accent))
    colors.agent.copy(rgbToColor(palette.agent))
    colors.skill.copy(rgbToColor(palette.skill))
    colors.warmWhite.copy(rgbToColor([255, 244, 222]))
    // Darker albedo than the page color: lit and tone mapped, a full
    // brightness lemon would bleach to cream.
    const tones = palette.nucleons.map((tone) =>
      rgbToColor(tone).multiplyScalar(0.7),
    )
    nucleonTone.forEach((tone, i) => nucleons.setColorAt(i, tones[tone]))
    if (nucleons.instanceColor) nucleons.instanceColor.needsUpdate = true
    coreMaterial.color.copy(colors.accent).multiplyScalar(3)
    shellMaterial.color.copy(rgbToColor(palette.ringWarm))
    rim.color.copy(colors.agent)
    RINGS.forEach((ring, i) => {
      const color = rgbToColor(ring.warm ? palette.ringWarm : palette.ringCool)
      for (const material of ringMaterials[i])
        material.uniforms.uColor.value.copy(color).multiplyScalar(1.15)
    })
    electrons.forEach((electron, e) => {
      const color = electron.item.kind === 'agent' ? colors.agent : colors.skill
      for (let k = 0; k < TRAIL_POINTS; k++)
        color.toArray(trailColors, (e * TRAIL_POINTS + k) * 3)
    })
    trailColorAttr.needsUpdate = true
    const dustTones = [colors.warmWhite, colors.accent, colors.agent]
    for (let i = 0; i < dustCount; i++)
      dustTones[dustTone[i]].toArray(dustColors, i * 3)
    dustColorAttr.needsUpdate = true
  }
  applyPalette()

  // ----------------------------------------------------------- interaction

  const raycaster = new Raycaster()
  const ndc = new Vector2()
  const worldPoint = new Vector3()
  const local = new Vector3()
  const spinAxisX = new Vector3(1, 0, 0)
  const spinAxisY = new Vector3(0, 1, 0)
  const qa = new Quaternion()
  const qb = new Quaternion()
  const matrix = new Matrix4()
  const dummy = new Object3D()
  const targets: Object3D[] = [nucleusHit, ...electrons.map((e) => e.hit)]

  type Target = Electron | 'council'

  function pickAt(clientX: number, clientY: number): Target | null {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    )
    raycaster.setFromCamera(ndc, camera)
    const [first] = raycaster.intersectObjects(targets, false)
    if (!first) return null
    if (first.object === nucleusHit) return 'council'
    return electrons.find((e) => e.hit === first.object) ?? null
  }

  function rotateBy(yaw: number, pitch: number) {
    // Rotations about the screen's axes, so a drag follows the pointer.
    qa.setFromAxisAngle(spinAxisY, yaw)
    qb.setFromAxisAngle(spinAxisX, pitch)
    atom.quaternion.premultiply(qa).premultiply(qb).normalize()
  }

  let hovered: Target | null = null
  let forced: Target | null = null
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
      if (hit) onOpen(hit === 'council' ? COUNCIL_PATH : hit.item.to)
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
    const ratio = Math.min(window.devicePixelRatio || 1, pixelRatioCap)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height, false)
    composer.setPixelRatio(ratio)
    composer.setSize(width, height)
    camera.aspect = width / height
    // Keep the whole atom in view when the box is wider than tall or the reverse.
    camera.fov =
      camera.aspect >= 1
        ? FOV
        : (Math.atan(Math.tan((FOV * Math.PI) / 360) / camera.aspect) * 360) /
          Math.PI
    camera.updateProjectionMatrix()
    // Point sizes are in scene units; this turns them into pixels.
    const scale =
      (height * ratio) / (2 * Math.tan((camera.fov * Math.PI) / 360))
    trailMaterial.uniforms.uScale.value = scale
    dustMaterial.uniforms.uScale.value = scale
  }

  function placeLabel(target: Target | null) {
    if (!target) {
      if (label.dataset.shown) {
        delete label.dataset.shown
        label.style.opacity = '0'
      }
      return
    }
    const text =
      target === 'council'
        ? 'Council'
        : `${KIND_LABEL[target.item.kind]}: ${target.item.name}`
    if (label.textContent !== text) label.textContent = text
    if (target === 'council') {
      // Just above the nucleus, not over its middle.
      nucleus.getWorldPosition(worldPoint)
      worldPoint.y += 0.5
    } else target.mesh.getWorldPosition(worldPoint)
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
  let time = 0
  let councilLit = 0

  function ellipsePoint(ring: number, angle: number, out: Vector3) {
    return out.set(
      Math.cos(angle) * RINGS[ring].a,
      Math.sin(angle) * RINGS[ring].b,
      0,
    )
  }

  /** Moves everything to time `time`; `dt` drives easing. */
  function update(dt: number) {
    // Hover: the pointer's target wins over the keyboard's.
    hovered = !drag && pointer ? pickAt(pointer.x, pointer.y) : null
    const active = hovered ?? forced
    canvas.style.cursor = drag ? 'grabbing' : hovered ? 'pointer' : 'grab'

    // Spin eases back to the slow automatic turn; it nearly stops over a target.
    if (!drag) {
      const calm = active ? 0.12 : 1
      const ease = 1 - Math.exp(-dt * 2.2)
      spinYaw += (AUTO_SPIN * calm - spinYaw) * ease
      spinPitch += (0 - spinPitch) * ease
      rotateBy(spinYaw * dt, spinPitch * dt)
    }

    const ease = 1 - Math.exp(-dt * 10)
    councilLit += ((active === 'council' ? 1 : 0) - councilLit) * ease

    // Nucleus: a slow breath, each nucleon drifting a little on its own.
    const breath = 1 + Math.sin(time * 0.8) * 0.022
    nucleus.scale.setScalar(NUCLEUS_SCALE * breath * (1 + councilLit * 0.06))
    for (let i = 0; i < nucleonHome.length; i++) {
      const wobble = 1 + Math.sin(time * 1.1 + i * 1.7) * 0.025
      dummy.position.copy(nucleonHome[i]).multiplyScalar(wobble)
      dummy.scale.setScalar(nucleonSize[i])
      dummy.updateMatrix()
      nucleons.setMatrixAt(i, dummy.matrix)
    }
    nucleons.instanceMatrix.needsUpdate = true
    shell.rotation.y = -time * 0.06
    shell.rotation.x = time * 0.025
    shellMaterial.opacity = (phone ? 0.08 : 0.12) + councilLit * 0.22
    const corePulse = 1 + Math.sin(time * 1.3) * 0.08
    coreMaterial.color
      .copy(colors.accent)
      .multiplyScalar(3 * corePulse * (1 + councilLit * 0.8))
    coreGlow.set(colors.accent, 0.7 + councilLit * 0.3, 0.85 * corePulse)
    outerGlow.set(
      colors.accent,
      0.07 + councilLit * 0.06,
      2.1 * breath + councilLit * 0.3,
    )

    const orbit = active ? 0.15 : 1
    for (const electron of electrons) {
      electron.angle += electron.speed * orbit * dt
      ellipsePoint(electron.ring, electron.angle, electron.mesh.position)
      electron.glow.mesh.position.copy(electron.mesh.position)
      electron.hit.position.copy(electron.mesh.position)
      electron.lit += ((electron === active ? 1 : 0) - electron.lit) * ease
    }

    for (const materials of ringMaterials)
      for (const material of materials) material.uniforms.uTime.value = time
    trailMaterial.uniforms.uTime.value = time
    dustMaterial.uniforms.uTime.value = time
    dust.rotation.y = Math.sin(time * 0.03) * 0.08

    atom.updateMatrixWorld(true)

    electrons.forEach((electron, e) => {
      const color = electron.item.kind === 'agent' ? colors.agent : colors.skill
      electron.mesh.getWorldPosition(worldPoint)
      // The far side of the atom reads dimmer, which gives it depth.
      const near = Math.min(1, Math.max(0, (worldPoint.z + 1.8) / 3.6))
      const depth = 0.35 + 0.65 * near
      // A hot, nearly white core; the hue lives in the halo around it.
      electron.mesh.material.color
        .copy(color)
        .lerp(white, electron.item.kind === 'agent' ? 0.15 : 0.45)
        .multiplyScalar((1.6 + electron.lit * 2.4) * depth)
      electron.mesh.scale.setScalar(ELECTRON_RADIUS * (1 + electron.lit * 0.45))
      electron.glow.set(
        scratch.copy(color),
        (0.38 + electron.lit * 0.35) * depth,
        0.26 + electron.lit * 0.08,
      )
      // Trail points along the orbit behind the electron, in world space.
      matrix.copy(ringGroups[electron.ring].matrixWorld)
      const back = -Math.sign(electron.speed) * TRAIL_STEP
      for (let k = 0; k < TRAIL_POINTS; k++) {
        ellipsePoint(electron.ring, electron.angle + back * (k + 1), local)
        local.applyMatrix4(matrix)
        local.toArray(trailPositions, (e * TRAIL_POINTS + k) * 3)
      }
    })
    trailPositionAttr.needsUpdate = true

    placeLabel(active)
  }

  // Adaptive quality: over each run of 90 frames, if most took longer than
  // 1/40 s, render at a lower pixel ratio (half a step at a time, down to 1).
  let sampled = 0
  let slow = 0

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const raw = (now - last) / 1000
    const dt = Math.min(0.05, raw)
    last = now
    sampled++
    if (raw > 1 / 40) slow++
    if (sampled === 90) {
      if (slow > 60 && pixelRatioCap > 1) {
        pixelRatioCap = Math.max(1, pixelRatioCap - 0.5)
        size()
      }
      sampled = slow = 0
    }
    time += dt
    update(dt)
    composer.render(dt)
  }

  function start() {
    if (running) return
    running = true
    sampled = slow = 0
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  function stop() {
    running = false
    cancelAnimationFrame(raf)
  }

  function renderStill() {
    update(0)
    composer.render(0)
  }

  // Render only while the tab is visible and the atom is on screen.
  function sync() {
    if (onScreen && !document.hidden) start()
    else stop()
  }

  const resizeObserver = new ResizeObserver(() => {
    size()
    if (!running) renderStill()
  })
  resizeObserver.observe(box)
  const intersectionObserver = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1]?.isIntersecting ?? true
    sync()
  })
  intersectionObserver.observe(box)
  document.addEventListener('visibilitychange', sync)

  size()
  renderStill()
  sync()

  return {
    setPalette(next) {
      palette = next
      applyPalette()
      if (!running) renderStill()
    },
    setActive(keyOrNull) {
      forced =
        keyOrNull === COUNCIL_KEY
          ? 'council'
          : keyOrNull
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
      for (const geometry of geometries) geometry.dispose()
      const materials = new Set<Material>()
      scene.traverse((object) => {
        const material = (object as Mesh).material
        if (!material) return
        for (const m of Array.isArray(material) ? material : [material])
          materials.add(m)
      })
      for (const material of materials) material.dispose()
      nucleons.dispose()
      for (const texture of Object.values(textures)) texture.dispose()
      envTarget.dispose()
      for (const pass of composer.passes) pass.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
