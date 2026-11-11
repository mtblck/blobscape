/**
 * The drawn pictures on the Blobscape front page. Every blob is an SVG
 * ellipse filled with a radial gradient that fades to nothing at its edge,
 * which is what a Gaussian looks like, so the drawings are made of the same
 * thing the lessons teach. They are pictures, not controls: each one is a
 * single image to assistive tech (role="img" with a description).
 */

const COLOURS = {
  red: '#d9382e',
  deep: '#a3231c',
  cream: '#f3e6cc',
  green: '#3f8f4a',
  blue: '#4f8fe0',
  sky: '#8fc8f0',
  sun: '#ffd04a',
  violet: '#9b7be0',
  orange: '#f2a65a',
  white: '#ffffff',
} as const
type Colour = keyof typeof COLOURS

/** The gradients every drawing on the page uses; rendered once, before them. */
export function BlobDefs() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        {Object.entries(COLOURS).map(([k, c]) => (
          <radialGradient key={k} id={`bs-${k}`}>
            <stop offset="0" stopColor={c} stopOpacity="1" />
            <stop offset="0.45" stopColor={c} stopOpacity="0.8" />
            <stop offset="1" stopColor={c} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
    </svg>
  )
}

interface B { x: number; y: number; rx: number; ry: number; r: number; c: Colour }

function Blob({ x, y, rx, ry, r, c, o = 0.95 }: B & { o?: number }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry} transform={r ? `rotate(${r} ${x} ${y})` : undefined} fill={`url(#bs-${c})`} opacity={o} />
}

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** A toadstool made of blobs, base at (0, 0), about 300 wide and 270 tall. */
const TOADSTOOL: B[] = (() => {
  const rand = rng(7)
  const out: B[] = []
  for (let k = 0; k < 16; k++) out.push({ x: -120 + k * 16 + rand() * 8, y: -4 + rand() * 6, rx: 20 + rand() * 10, ry: 7 + rand() * 3, r: rand() * 10 - 5, c: 'green' })
  for (let k = 0; k < 20; k++) out.push({ x: -12 + rand() * 24 + (k / 20) * 6, y: -8 - (k / 19) * 108, rx: 16 + rand() * 6, ry: 14 + rand() * 6, r: rand() * 20 - 10, c: 'cream' })
  for (let k = 0; k < 90; k++) {
    const t = Math.PI + rand() * Math.PI, d = Math.sqrt(rand())
    const x = Math.cos(t) * 145 * d, y = -120 + Math.sin(t) * 115 * d
    out.push({ x, y, rx: 18 + rand() * 12, ry: 10 + rand() * 8, r: (Math.atan2(y + 120, x) * 180) / Math.PI + 90, c: rand() < 0.3 ? 'deep' : 'red' })
  }
  for (let k = 0; k < 14; k++) out.push({ x: -130 + k * 20 + rand() * 6, y: -118 + rand() * 6, rx: 16 + rand() * 6, ry: 8 + rand() * 3, r: 0, c: k % 3 ? 'red' : 'deep' })
  for (const [x, y, s] of [[-70, -170, 1], [10, -205, 1.2], [75, -160, 0.9], [-20, -150, 0.7], [110, -128, 0.6], [-115, -130, 0.6]]) out.push({ x, y, rx: 15 * s, ry: 11 * s, r: 0, c: 'cream' })
  return out
})()

/** The blob the hero points at: one of the cap's spots. */
const PICKED = TOADSTOOL.length - 4

function Toadstool({ x = 0, y = 0, s = 1, pick, tint }: { x?: number; y?: number; s?: number; pick?: boolean; tint?: (b: B) => Colour | null }) {
  const p = TOADSTOOL[PICKED]
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {TOADSTOOL.map((b, i) => {
        const c = tint?.(b)
        return <Blob key={i} {...b} c={c ?? b.c} x={c ? b.x + 18 : b.x} y={c ? b.y - 14 : b.y} />
      })}
      {pick && <ellipse cx={p.x} cy={p.y} rx={p.rx + 9} ry={p.ry + 9} fill="none" stroke={COLOURS.sun} strokeWidth={2.5 / s} strokeDasharray={`${6 / s} ${5 / s}`} className="motion-safe:animate-[bs-march_1.6s_linear_infinite]" />}
    </g>
  )
}

/** Hero: a toadstool of blobs, one of them circled, with its 14 numbers set out beside it. */
export function HeroDiagram() {
  const p = TOADSTOOL[PICKED]
  const S = 1.05, X = 190, Y = 360
  const px = X + p.x * S, py = Y + p.y * S
  const rows: [string, string, number][] = [
    ['Where it is', 'x, y, z', 3],
    ['How big, each way', 'width, height, depth', 3],
    ['Which way it turns', 'a rotation', 4],
    ['Colour', 'red, green, blue', 3],
    ['How solid', 'opacity', 1],
  ]
  return (
    <div
      role="img"
      aria-label="A toadstool drawn entirely from soft, overlapping coloured blobs. One blob on its cap is circled, and a card beside it lists the 14 numbers that make it: 3 for where it is, 3 for its size, 4 for its turn, 3 for its colour and 1 for how solid it is."
      className="case relative grid overflow-hidden rounded-2xl ring-1 ring-rule sm:grid-cols-[minmax(0,1fr)_15rem]"
      style={{ background: 'var(--c-paper)' }}
    >
      <svg viewBox="0 0 400 400" className="block h-auto w-full">
        <Toadstool x={X} y={Y} s={S} pick />
        <path d={`M ${px + p.rx + 10} ${py} H 400`} stroke={COLOURS.sun} strokeWidth="1.5" strokeDasharray="3 4" className="max-sm:hidden" />
      </svg>
      <div className="flex flex-col justify-center gap-3 border-rule-soft p-5 max-sm:border-t sm:border-l">
        <p className="text-xs font-semibold tracking-wider text-ink-faint uppercase">This one blob is</p>
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map(([what, detail, n]) => (
            <li key={what} className="flex items-baseline gap-3">
              <span className="flex w-10 shrink-0 gap-0.5">
                {Array.from({ length: n }, (_, k) => <span key={k} className="size-2 rounded-full bg-placard" />)}
              </span>
              <span className="min-w-0">
                <span className="block text-ink">{what}</span>
                <span className="block text-xs text-ink-faint">{detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-rule-soft pt-3 font-serif text-2xl text-ink">14 numbers</p>
        <p className="-mt-2 text-xs text-ink-faint">The toadstool is {TOADSTOOL.length} of them. A real capture, a few million.</p>
      </div>
    </div>
  )
}

/** A small dark panel for the step and lesson pictures. */
function Case({ label, viewBox, children, className }: { label?: string; viewBox: string; children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox={viewBox}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`block h-auto w-full rounded-xl bg-[#16130f] ring-1 ring-rule ${className ?? ''}`}
    >
      {children}
    </svg>
  )
}

function Camera({ x, y, a }: { x: number; y: number; a: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${a})`}>
      <path d="M 14 0 L 70 -22 M 14 0 L 70 22" stroke="#a89f92" strokeWidth="1" strokeDasharray="2 3" />
      <rect x="-12" y="-9" width="24" height="18" rx="3" fill="#2c261f" stroke="#cfc6b8" strokeWidth="1.5" />
      <circle cx="12" cy="0" r="5" fill="#16130f" stroke="#cfc6b8" strokeWidth="1.5" />
    </g>
  )
}

/** Step 1: photos of a real thing from all round. */
export function PhotosDiagram() {
  return (
    <Case viewBox="0 0 240 150" label="Three cameras photograph a toadstool from the left, the front and the right">
      <Toadstool x={120} y={118} s={0.28} />
      <Camera x={34} y={70} a={10} />
      <Camera x={120} y={18} a={90} />
      <Camera x={206} y={70} a={170} />
    </Case>
  )
}

/** Step 2: training nudges loose blobs into place until the renders match the photos. */
export function TrainDiagram() {
  const rand = rng(3)
  const placed = TOADSTOOL.filter((_, i) => i % 3 === 0)
  return (
    <Case viewBox="0 0 240 150" label="Loose blobs being nudged into the shape of the toadstool, with an error curve falling as they settle">
      <g transform="translate(92 122) scale(0.28)">
        {placed.map((b, i) => {
          const dx = (rand() - 0.5) * 160, dy = (rand() - 0.5) * 120
          return i % 2 ? (
            <g key={i}>
              <Blob {...b} x={b.x + dx} y={b.y + dy} o={0.45} />
              <path d={`M ${b.x + dx} ${b.y + dy} L ${b.x + dx * 0.25} ${b.y + dy * 0.25}`} stroke={COLOURS.sun} strokeWidth="5" strokeLinecap="round" opacity="0.8" />
            </g>
          ) : <Blob key={i} {...b} />
        })}
      </g>
      <g transform="translate(168 40)">
        <path d="M 0 0 V 70 H 60" stroke="#665d52" fill="none" strokeWidth="1" />
        <path d="M 2 6 C 12 40 20 52 30 58 S 50 64 58 65" stroke={COLOURS.orange} fill="none" strokeWidth="2" />
        <text x="4" y="-6" fill="#a89f92" fontSize="9" fontFamily="var(--font-sans)">error</text>
      </g>
    </Case>
  )
}

/** Step 3: draw it from any angle. */
export function AnyAngleDiagram() {
  return (
    <Case viewBox="0 0 240 150" label="The finished toadstool of blobs, with a dashed orbit round it showing it can be seen from anywhere">
      <ellipse cx="120" cy="104" rx="96" ry="26" fill="none" stroke="#a89f92" strokeWidth="1" strokeDasharray="3 4" />
      <Toadstool x={120} y={112} s={0.32} />
      <path d="M 200 116 l 10 -2 l -4 9" stroke={COLOURS.sun} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="40" cy="120" r="5" fill={COLOURS.sun} />
    </Case>
  )
}

/** One small picture per lesson, keyed by lesson id. */
export function LessonGlyph({ id }: { id: string }) {
  const g = (children: React.ReactNode) => <Case viewBox="0 0 120 72">{children}</Case>
  switch (id) {
    case 'one-blob':
      return g(<>
        <Blob x={60} y={38} rx={30} ry={16} r={-15} c="blue" />
        <path d="M 60 38 L 92 30 M 60 38 L 52 10 M 60 38 L 40 54" stroke={COLOURS.sun} strokeWidth="1.5" strokeLinecap="round" />
      </>)
    case 'footprint':
      return g(<>
        <ellipse cx="60" cy="58" rx="34" ry="7" fill="none" stroke="#a89f92" strokeDasharray="3 3" />
        <Blob x={60} y={30} rx={14} ry={22} r={25} c="violet" />
        <path d="M 48 40 L 36 56 M 72 22 L 88 56" stroke="#665d52" strokeWidth="1" strokeDasharray="2 3" />
      </>)
    case 'order':
      return g(<>
        <Blob x={48} y={36} rx={26} ry={22} r={0} c="blue" />
        <Blob x={72} y={36} rx={26} ry={22} r={0} c="red" />
        <text x="30" y="66" fill="#cfc6b8" fontSize="10" fontFamily="var(--font-sans)">1</text>
        <text x="86" y="66" fill="#cfc6b8" fontSize="10" fontFamily="var(--font-sans)">2</text>
      </>)
    case 'many': {
      const rand = rng(9)
      return g(<>
        {Array.from({ length: 40 }, (_, k) => {
          const t = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 24
          return <Blob key={k} x={60 + Math.cos(t) * d} y={36 + Math.sin(t) * d} rx={9} ry={6} r={rand() * 180} c={k % 4 ? 'orange' : 'sun'} o={0.8} />
        })}
      </>)
    }
    case 'angle':
      return g(<>
        <Blob x={56} y={38} rx={26} ry={26} r={0} c="blue" />
        <Blob x={46} y={28} rx={9} ry={7} r={-30} c="white" o={0.9} />
        <path d="M 90 14 A 40 40 0 0 1 96 58" stroke={COLOURS.sun} strokeWidth="1.5" fill="none" strokeDasharray="3 3" />
        <circle cx="90" cy="14" r="3.5" fill={COLOURS.sun} />
      </>)
    case 'paint': {
      const rand = rng(4)
      return g(<>
        <path d="M 22 52 L 60 62 L 98 52 L 60 42 Z" fill="none" stroke={COLOURS.orange} strokeDasharray="3 3" />
        {Array.from({ length: 22 }, (_, k) => <Blob key={k} x={30 + rand() * 50} y={48 + rand() * 10} rx={7} ry={3} r={0} c="green" o={0.85} />)}
        <path d="M 84 14 l 10 -6 l 4 7 l -10 6 z" fill="#cfc6b8" />
        {[0, 1, 2].map((k) => <circle key={k} cx={78 - k * 5} cy={24 + k * 6} r="1.4" fill="#cfc6b8" />)}
      </>)
    }
    case 'formats':
      return g(<>
        {([['.ply', 76, 'red'], ['.splat', 46, 'orange'], ['.spz', 16, 'sun']] as const).map(([n, w, c], k) => (
          <g key={n}>
            <text x="12" y={22 + k * 18} fill="#cfc6b8" fontSize="10" fontFamily="var(--font-sans)">{n}</text>
            <rect x="42" y={14 + k * 18} width={w * 0.85} height="9" rx="2" fill={COLOURS[c]} />
          </g>
        ))}
      </>)
    case 'break': {
      const rand = rng(12)
      return g(<>
        {Array.from({ length: 60 }, (_, k) => {
          const t = rand() * Math.PI * 2, d = 6 + rand() * 30
          return <circle key={k} cx={60 + Math.cos(t) * d * 1.4} cy={36 + Math.sin(t) * d * 0.9} r="1.4" fill={k % 3 ? COLOURS.red : COLOURS.cream} />
        })}
      </>)
    }
    default:
      return g(null)
  }
}

const lassoed = (b: B) => b.x > 30 && b.y < -125
export const SANDBOX_COUNTS = { all: TOADSTOOL.length, selected: TOADSTOOL.filter(lassoed).length }

/** The sandbox: part of the cap lassoed, recoloured and dragged off. */
export function SandboxDiagram() {
  const lasso = 'M 205 72 C 260 52 330 70 336 120 C 340 160 300 178 250 170 C 210 162 186 120 205 72 Z'
  return (
    <svg viewBox="0 0 400 300" aria-hidden className="block h-auto w-full">
      <Toadstool x={190} y={278} s={0.92} tint={(b) => (lassoed(b) ? (b.c === 'cream' ? 'white' : 'blue') : null)} />
      <path d={lasso} fill="rgb(255 208 74 / 0.06)" stroke={COLOURS.sun} strokeWidth="1.5" strokeDasharray="5 4" className="motion-safe:animate-[bs-march_1.6s_linear_infinite]" />
      <path d="M 300 182 l 18 14 m 0 0 l -2 -9 m 2 9 l -9 -1" stroke="#cfc6b8" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

const SPRITE = [
  '..rrrr..',
  '.rrwrrr.',
  'rrrrrwrr',
  'rwrrrrrr',
  '..cccc..',
  '...cc...',
  '...cc...',
  '.gggggg.',
]

/** Splat to Sprite: the toadstool baked into a sheet of pixel-art frames. */
export function SpriteDiagram() {
  const fill: Record<string, string> = { r: COLOURS.red, w: COLOURS.cream, c: '#e8d6b0', g: COLOURS.green }
  return (
    <Case viewBox="0 0 240 130" label="A toadstool of blobs, an arrow, then a sheet of small pixel-art toadstool frames">
      <Toadstool x={58} y={104} s={0.27} />
      <path d="M 106 66 H 126 m -6 -5 l 6 5 l -6 5" stroke={COLOURS.sun} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {[0, 1, 2].map((col) =>
        [0, 1, 2].map((row) => (
          <g key={`${col}${row}`} transform={`translate(${138 + col * 32} ${20 + row * 32})`}>
            <rect width="28" height="28" fill="#221d18" />
            {SPRITE.flatMap((line, y) =>
              [...line].map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={2 + (row === 1 ? 7 - x : x) * 3} y={2 + y * 3} width="3" height="3" fill={fill[ch]} opacity={col === 1 && y < 4 ? 0.85 : 1} />)),
            )}
          </g>
        )),
      )}
    </Case>
  )
}

/** Fit a Picture: a picture, and the same picture rebuilt from blobs. */
export function FitDiagram() {
  const rand = rng(21)
  return (
    <Case viewBox="0 0 240 130" label="A small landscape picture with a sun and a hill, an arrow, then the same picture rebuilt from soft blobs">
      <defs>
        <linearGradient id="bs-fit-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f8fe0" />
          <stop offset="1" stopColor="#f2a65a" />
        </linearGradient>
        <clipPath id="bs-fit-clip"><rect x="138" y="20" width="90" height="90" rx="4" /></clipPath>
      </defs>
      <rect x="12" y="20" width="90" height="90" rx="4" fill="url(#bs-fit-sky)" />
      <circle cx="70" cy="50" r="12" fill={COLOURS.sun} />
      <path d="M 12 90 Q 50 66 102 84 V 110 H 12 Z" fill={COLOURS.green} />
      <path d="M 110 66 H 128 m -6 -5 l 6 5 l -6 5" stroke={COLOURS.sun} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <g clipPath="url(#bs-fit-clip)">
        <rect x="138" y="20" width="90" height="90" fill="#16130f" />
        {Array.from({ length: 26 }, (_, k) => <Blob key={`s${k}`} x={140 + rand() * 90} y={20 + rand() * 50} rx={16} ry={10} r={rand() * 180} c={rand() < 0.5 ? 'blue' : 'sky'} o={0.75} />)}
        {Array.from({ length: 10 }, (_, k) => <Blob key={`o${k}`} x={140 + rand() * 90} y={70 + rand() * 14} rx={16} ry={8} r={0} c="orange" o={0.7} />)}
        <Blob x={196} y={50} rx={13} ry={13} r={0} c="sun" />
        {Array.from({ length: 14 }, (_, k) => <Blob key={`g${k}`} x={140 + k * 7} y={98 - Math.sin((k / 13) * Math.PI) * 6} rx={14} ry={10} r={0} c="green" />)}
      </g>
    </Case>
  )
}
