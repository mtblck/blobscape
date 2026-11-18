import type { Orbit } from '../../../splat-core/orbit.ts'
import { AMBIENT, FLOWERS, FOX, FOX_SIZE, GRASS, HAZE, LEGS, LIGHTS, LOOP, MOON, MOONLIGHT, RING, ROCKS, STARS, STONE, TURF, WISP_LIGHT, foxAt, foxJoints, linear, rgb, wispAt, type V3 } from './layout.ts'

/**
 * The fox's meadow with no engine and no library: one fragment shader on a bare WebGL 2 context. Every shape is a
 * distance function typed out below and each pixel walks a ray through them. The fox is round bars and balls melted
 * together, its joints worked out on the CPU each frame and handed over; its coat is the surface roughened and
 * streaked along the body, which is as near as a distance function comes to fur. The grass is one bent blade a square
 * of a grid, each ray asking only the squares round it. The wisp lights every pixel afresh, with shadows from the fox
 * and the stones (not from the grass, which would cost a second walk through every blade).
 *
 * It gives the scene drawn small with clear pixels where there is nothing; the page finishes it as pixel art.
 */

const f = (n: number) => (Number.isInteger(n) ? `${n}.` : `${+n.toFixed(4)}`)
const v3 = (v: readonly number[]) => `vec3(${v.map(f).join(',')})`
const c = (hex: string) => v3(rgb(hex))
const lit = (hex: string, k: number) => v3(rgb(hex).map((x) => linear(x) * k))
const SPECKS = LIGHTS.length + STARS.length + 1
const K = FOX.colors

const VERT = `#version 300 es
out vec2 ndc;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1.);
  ndc = p;
  gl_Position = vec4(p, 0., 1.);
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 ndc;
out vec4 color;
uniform vec3 eye, right, up, forward;
uniform vec2 lens;
uniform vec2 fog;
uniform float gain, wind;
uniform vec4 fox;          // where it stands (xyz) and its turn
uniform vec3 leg[16];      // four points a leg: top, elbow, wrist, paw
uniform vec3 tail[3];
uniform float bob;
uniform vec4 speck[${SPECKS}];
uniform vec3 speckColor[${SPECKS}];

const vec3 SUN = normalize(${v3(MOONLIGHT.from)});
const float G = ${f(GRASS.grid)};
bool solidOnly = false;

float hash(vec3 p) { p = fract(p * .3183099 + vec3(.1, .2, .3)); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 hash3(vec2 p) { vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9))); return fract(sin(q) * 43758.5453); }
float noise(vec3 x) {
  vec3 i = floor(x), t = fract(x); t = t * t * (3. - 2. * t);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), t.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), t.x), t.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), t.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), t.x), t.y), t.z);
}
float stick(vec3 p, vec3 a, vec3 b, float ra, float rb) { vec3 pa = p - a, ba = b - a; float t = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * t) - mix(ra, rb, t); }
float drum(vec3 p, vec3 base, float h, float r0, float r1) {
  float t = clamp((p.y - base.y) / h, 0., 1.), side = length(p.xz - base.xz) - mix(r0, r1, t), cap = abs(p.y - base.y - h * .5) - h * .5;
  return length(max(vec2(side, cap), 0.)) + min(max(side, cap), 0.);
}
float ball(vec3 p, vec3 at, vec3 r) { vec3 q = (p - at) / r; float k = length(q); return k * (k - 1.) / max(length(q / r), 1e-4); }
vec2 nearer(vec2 a, float d, float m) { return d < a.x ? vec2(d, m) : a; }
/** Two shapes melted together over a width k. */
float melt(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }

/** A point in the fox's own frame: a meter long, facing +z, standing at the origin. */
vec3 inFox(vec3 p) { vec3 q = (p - fox.xyz) / ${f(FOX_SIZE)}; float s = sin(fox.w), k = cos(fox.w); return vec3(q.x * k - q.z * s, q.y, q.x * s + q.z * k); }

/** The fox, in its own frame: how far, and which part (30 body, 31 head, 32 legs, 33 brush, 34 ears, 35 nose, 36 eyes, 37 cheeks). */
vec2 foxAt(vec3 q) {
  vec3 B = vec3(0, bob, 0), m = vec3(abs(q.x), q.y, q.z);
  float body = stick(q, ${v3(FOX.body.from)} + B, ${v3(FOX.body.to)} + B, ${f(FOX.body.r)}, ${f(FOX.body.rTo)});
  body = melt(body, ball(q, ${v3(FOX.body.chest.at)} + B, ${v3(FOX.body.chest.r)}), .12);
  body = melt(body, ball(q, ${v3(FOX.body.rump.at)} + B, ${v3(FOX.body.rump.r)}), .12);
  body = melt(body, stick(q, ${v3(FOX.neck.from)} + B, ${v3(FOX.neck.to)} + B, ${f(FOX.neck.r)}, ${f(FOX.neck.rTo)}), .08);
  vec2 d = vec2(body, 30.);
  float head = melt(ball(q, ${v3(FOX.head.at)} + B, ${v3(FOX.head.r)}), stick(q, ${v3(FOX.muzzle.from)} + B, ${v3(FOX.muzzle.to)} + B, ${f(FOX.muzzle.r)}, ${f(FOX.muzzle.rTo)}), .06);
  d = nearer(d, head, 31.);
  d = nearer(d, ball(m, ${v3(FOX.cheek.at)} + B, ${v3(FOX.cheek.r)}), 37.);
  // an ear is a cone pressed thin from front to back
  vec3 e = vec3(m.x, m.y, ${f(FOX.ear.from[2])} + (m.z - ${f(FOX.ear.from[2])}) / ${f(FOX.ear.thin)}) - B;
  d = nearer(d, stick(e, ${v3(FOX.ear.from)}, ${v3(FOX.ear.to)}, ${f(FOX.ear.r)}, .014) * ${f(FOX.ear.thin)}, 34.);
  d = nearer(d, length(q - ${v3(FOX.nose.at)} - B) - ${f(FOX.nose.r)}, 35.);
  d = nearer(d, length(m - ${v3(FOX.eye.at)} - B) - ${f(FOX.eye.r)}, 36.);
  float legs = 1e3;
  for (int i = 0; i < 4; i++) {
    bool front = i < 2;
    float one = stick(q, leg[i * 4], leg[i * 4 + 1], front ? ${f(FOX.front.r[0])} : ${f(FOX.hind.r[0])}, front ? ${f(FOX.front.r[1])} : ${f(FOX.hind.r[1])});
    one = melt(one, stick(q, leg[i * 4 + 1], leg[i * 4 + 2], front ? ${f(FOX.front.r[1])} : ${f(FOX.hind.r[1])}, front ? ${f(FOX.front.r[2])} : ${f(FOX.hind.r[2])}), .03);
    one = melt(one, stick(q, leg[i * 4 + 2], leg[i * 4 + 3], front ? ${f(FOX.front.r[2])} : ${f(FOX.hind.r[2])}, front ? ${f(FOX.front.r[3])} : ${f(FOX.hind.r[3])}), .02);
    one = min(one, ball(q, leg[i * 4 + 3] + vec3(0, .015, .035), vec3(.05, .04, .08)));
    legs = min(legs, one);
  }
  d = nearer(d, legs, 32.);
  float brush = melt(stick(q, tail[0], tail[1], ${f(FOX.tail[0].r)}, ${f(FOX.tail[1].r)}), stick(q, tail[1], tail[2], ${f(FOX.tail[1].r)}, ${f(FOX.tail[2].r)}), .1);
  d = nearer(d, brush, 33.);
  // the coat: the surface roughened along the body, more on the brush and the ruff
  float rough = d.y > 34.5 && d.y < 36.5 ? 0. : d.y == 33. ? .03 : d.y == 32. ? .006 : .014;
  if (d.x < .12) d.x -= rough * (noise(q * vec3(46., 46., 13.)) - .35);
  return d;
}

/** How tall grass grows at a spot, as a share of full height. */
float grown(vec2 at) {
  float r = length(at);
  if (r < .26 || r > 1.7) return 0.;
  float worn = abs(r - ${f(RING)}) / .2;
  return (worn < 1. ? .22 + .78 * worn * worn * worn : 1.) * (r > 1.5 ? (1.7 - r) / .2 * .5 + .5 : 1.);
}
/** One blade, standing in a square of the grid: bent over a little, its tip pushed by the wind. */
float blade(vec3 p, vec2 cell) {
  vec3 h = hash3(cell);
  vec2 foot = (cell + .15 + .7 * h.xy) * G;
  float tall = (.09 + .13 * h.z * h.z + (h.x < .1 ? .14 : 0.)) * grown(foot);
  if (tall < .012) return 1e3;
  float yaw = h.y * 6.2832, blow = wind - 6.2832 * (foot.x * .9 + foot.y * .5);
  vec2 lean = vec2(sin(yaw), cos(yaw)) * min(tall * (.1 + .3 * h.x), .04) + ${f(GRASS.sway)} * vec2(sin(blow), .45 * sin(blow + 1.1));
  vec3 a = vec3(foot.x, 0, foot.y), mid = a + vec3(lean.x * .35, tall * .55, lean.y * .35), tip = a + vec3(lean.x, tall * .97, lean.y);
  return min(stick(p, a, mid, .009, .007), stick(p, mid, tip, .007, .0015));
}
float grass(vec3 p) {
  if (p.y > .42) return p.y - .38;
  if (length(p.xz) > 1.8) return .1;
  vec2 c = floor(p.xz / G);
  float d = 1e3;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) d = min(d, blade(p, c + vec2(i, j)));
  // blades further off than the squares asked are not known: never step past them
  return min(d, G * .7);
}

/** The nearest surface to a point: how far, and which material. */
vec2 map(vec3 p) {
  float ground = drum(p, vec3(0, ${f(-TURF.depth)}, 0), ${f(TURF.depth)}, ${f(TURF.r)}, ${f(TURF.r)});
  if (ground < .1) ground -= .03 * (noise(p / .6 * 3.) - .5);
  vec2 d = vec2(ground, 1.);
  { float k = stick(p, ${v3(STONE.from)}, ${v3(STONE.to)}, ${f(STONE.r)}, ${f(STONE.rTo)}); if (k < .1) k -= .03 * (noise(p / .25 * 3.) - .5); d = nearer(d, k, 2.); }
${ROCKS.map((r) => `  { float k = ball(p, ${v3(r.at)}, ${v3(r.r)}); if (k < .1) k -= .025 * (noise(p / .2 * 3.) - .5); d = nearer(d, k, 3.); }`).join('\n')}
${FLOWERS.map((w, i) => `  { float k = length(p - ${v3([w.at[0], w.height * 0.5, w.at[1]])}) - ${f(w.height * 0.5 + 0.06)}; if (k < .05) k = min(drum(p, ${v3([w.at[0], 0, w.at[1]])}, ${f(w.height)}, .012, .012), ball(p, ${v3([w.at[0], w.height + 0.02, w.at[1]])}, vec3(.04, .03, .04))); d = nearer(d, k, ${4 + (i % 2)}.); }`).join('\n')}
  // the fox: asked only near it
  float near = length(p - fox.xyz - vec3(0, .35, 0)) - .9;
  if (near < .08) { vec2 k = foxAt(inFox(p)); d = nearer(d, k.x * ${f(FOX_SIZE)}, k.y); } else d = nearer(d, near, 0.);
  if (!solidOnly) d = nearer(d, grass(p), 6.);
  return d;
}

vec3 pick3(float k, vec3 a, vec3 b, vec3 c) { return k < 1. ? a : k < 2. ? b : c; }
vec3 patches(vec3 p, float size, vec3 a, vec3 b, vec3 c) { return pick3(noise(p / size * 1.2) * 3., a, b, c); }
vec3 bands(float x, float size, vec3 a, vec3 b) { return mod(floor(x / size), 2.) < 1. ? a : b; }

/** The fox's coat at a point of its own frame, for a surface facing n (in that frame). */
vec3 coat(float m, vec3 q, vec3 n) {
  vec3 fur = ${c(K.fur)}, deep = ${c(K.deep)}, pale = ${c(K.pale)}, dark = ${c(K.dark)};
  // streaks along the body, as strands of a coat lie
  float streak = noise(q * vec3(70., 70., 9.));
  vec3 red = mix(fur, deep, smoothstep(.45, .8, streak) * .7 + (n.y > .7 ? .35 : 0.));
  if (m == 35.) return vec3(.08, .06, .06);
  if (m == 36.) return ${c(K.eye)};
  if (m == 37.) return pale;
  if (m == 34.) return q.y > 1.47 + bob || n.z < -.25 ? dark : n.z > .3 ? pale : red;
  if (m == 33.) return distance(q, tail[2]) < .2 ? pale : red;
  if (m == 32.) return q.y < (q.z > 0. ? ${f(FOX.front.dark)} : ${f(FOX.hind.dark)}) ? dark : red;
  if (m == 31.) return n.y < -.15 || (q.z > 1.04 && n.y < .35) ? pale : red;
  // the white bib down the chest, and the pale belly
  if (n.z > .1 && n.y < .35 && q.y < 1.02 && abs(q.x) < .14 && q.y > .52 && q.z > .3) return pale;
  return n.y < -.45 ? pale : red;
}

/** A material's paint at a point for a surface facing n. */
vec3 paint(float m, vec3 p, vec3 n) {
  bool top = n.y > .6;
  if (m < 1.5) return top ? patches(p, .3, ${c('#10241c')}, ${c('#1b3a2a')}, ${c('#2c5a38')}) : pick3(mod(floor(p.y / .07), 3.), ${c('#4a3020')}, ${c('#2a1c16')}, ${c('#6e4a2e')});
  if (m < 2.5) return top ? patches(p, .1, ${c('#8a8898')}, ${c('#4a8048')}, ${c('#8a8898')}) : pick3(mod(floor(p.y / .11), 3.), ${c('#5d5c6c')}, ${c('#3a3a48')}, ${c('#8a8898')});
  if (m < 3.5) return top ? patches(p, .12, ${c('#8a8898')}, ${c('#4a8048')}, ${c('#8a8898')}) : bands(p.y, .06, ${c('#5d5c6c')}, ${c('#3a3a48')});
  if (m < 5.5) return p.y < .17 ? ${c('#4a8048')} : m < 4.5 ? ${c('#b9485a')} : ${c('#e8dcc0')};
  if (m < 6.5) {
    // a blade is dark at the foot and lighter up it, and no two squares are quite one green
    float k = hash3(floor(p.xz / G)).z, up = clamp(p.y / .2, 0., 1.) * .85;
    return mix(mix(${c(GRASS.colors[0])}, ${c(GRASS.colors[1])}, k), mix(${c(GRASS.colors[2])}, ${c(GRASS.colors[3])}, k), up);
  }
  vec3 q = inFox(p);
  float s = sin(fox.w), k = cos(fox.w);
  return coat(m, q, vec3(n.x * k - n.z * s, n.y, n.x * s + n.z * k));
}

vec3 normalAt(vec3 p) { vec2 e = vec2(.002, 0); return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x)); }

/** How much of a light a point sees, walking toward it past the solid things (not the grass): 1 in the open, 0 behind something, soft at the edge. */
float seen(vec3 p, vec3 to, float far, float soft) {
  float k = 1., t = .03;
  solidOnly = true;
  for (int i = 0; i < 28 && t < far; i++) {
    float d = map(p + to * t).x;
    if (d < .002) { k = 0.; break; }
    k = min(k, soft * d / t);
    t += clamp(d, .015, .25);
  }
  solidOnly = false;
  return clamp(k, 0., 1.);
}

/** How open a point is among the solid things: 1 on a face, less in a corner. */
float open(vec3 p, vec3 n) {
  float k = 0., w = 1.;
  solidOnly = true;
  for (int i = 1; i <= 4; i++) { float h = .035 * float(i); k += w * (h - map(p + n * h).x); w *= .6; }
  solidOnly = false;
  return clamp(1. - 3. * k, 0., 1.);
}

float falloff(float d2, float range) { float r2 = range * range, fade = max(1. - d2 / (r2 * 4.), 0.); return fade * fade / (1. + d2 / r2); }

void main() {
  vec3 dir = normalize(forward + ndc.x * lens.x * right + ndc.y * lens.y * up);
  float t = 0., m = 0.;
  bool hit = false;
  for (int i = 0; i < 220 && t < 16.; i++) {
    vec2 d = map(eye + dir * t);
    if (d.x < .0012 * t) { hit = true; m = d.y; break; }
    t += d.x * .9;
  }
  // the small lights: whichever the ray meets first, if it is in front of the scene
  float near = hit ? t : 1e9;
  vec3 glow = vec3(0);
  bool speckHit = false;
  for (int i = 0; i < ${SPECKS}; i++) {
    float r = speck[i].w;
    vec3 oc = eye - speck[i].xyz;
    float b = dot(oc, dir), k = b * b - dot(oc, oc) + r * r;
    if (k < 0.) continue;
    float s = -b - sqrt(k);
    if (s > 0. && s < near) { near = s; glow = speckColor[i]; speckHit = true; }
  }
  if (speckHit) { color = vec4(glow, 1.); return; }
  if (!hit) { color = vec4(0); return; }

  vec3 p = eye + dir * t, n = normalAt(p);
  bool blade = m > 5.5 && m < 6.5;
  // a blade is too thin for its own facing to mean much: it takes light mostly as the ground under it would
  if (blade) n = normalize(mix(vec3(0, 1, 0), n, .35));
  vec3 base = paint(m, p, n);

  float facing = max(dot(n, SUN), 0.) * mix(1., seen(p + n * .012, SUN, 4., 10.), ${f(MOONLIGHT.shadow)});
  float amb = ${f(MOONLIGHT.ambient)} * (blade ? mix(.6, 1., clamp(p.y / .12, 0., 1.)) : mix(.55, 1., open(p, n)));
  vec3 c = base * (amb + (1. - ${f(MOONLIGHT.ambient)}) * facing) * .9;
  // shade leans cool and moonlit faces a touch warm, as painted light does
  c *= mix(vec3(.84, .9, 1.14), vec3(1.03, 1., .95), facing);
  vec3 lin = pow(c, vec3(2.2));

  vec3 light = vec3(${f(AMBIENT)});
  vec3 to = speck[0].xyz - p; float d2 = dot(to, to), far = sqrt(d2);
  float fall = falloff(d2, ${f(WISP_LIGHT.range)});
  if (fall > .002) light += ${lit(WISP_LIGHT.color, WISP_LIGHT.strength)} * gain * fall * (abs(dot(n, to / far)) * .65 + .35) * seen(p + n * .012, to / far, far - .07, 6.);
  lin *= light;
  lin = mix(lin, ${lit(HAZE.color, 1)}, clamp((dot(p - eye, forward) - fog.x) / (fog.y - fog.x), 0., 1.));
  color = vec4(pow(min(lin, 1.), vec3(1. / 2.2)), 1.);
}`

export class MeadowShader {
  readonly name = 'shader'
  private canvas = document.createElement('canvas')
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private at: Record<string, WebGLUniformLocation | null> = {}
  private pixels = new Uint8Array(0)

  constructor() {
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL 2 could not start')
    this.gl = gl
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'The shader did not compile')
      return s
    }
    const program = gl.createProgram()!
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERT))
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'The shader did not link')
    this.program = program
    for (const name of ['eye', 'right', 'up', 'forward', 'lens', 'fog', 'gain', 'wind', 'fox', 'leg', 'tail', 'bob', 'speck', 'speckColor']) this.at[name] = gl.getUniformLocation(program, name)
  }

  /** Draws the scene `t` seconds in, `width` by `height`, and gives its pixels: RGBA, bottom row first. */
  draw(t: number, orbit: Orbit, width: number, height: number, gain: number, fov: number): Uint8Array {
    const { gl, canvas, at } = this
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; this.pixels = new Uint8Array(width * height * 4) }
    const u = t / LOOP
    // the camera: where it is and which ways are forward, right and up
    const az = (orbit.azimuth * Math.PI) / 180, el = (Math.max(-89, Math.min(89, orbit.elevation)) * Math.PI) / 180
    const back: V3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]
    const eye = orbit.target.map((x, i) => x + back[i] * orbit.distance)
    const forward: V3 = [-back[0], -back[1], -back[2]]
    const rl = Math.hypot(forward[2], forward[0]) || 1
    const right: V3 = [-forward[2] / rl, 0, forward[0] / rl]
    const up: V3 = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]]
    const tan = Math.tan((fov * Math.PI) / 360)

    gl.viewport(0, 0, width, height)
    gl.useProgram(this.program)
    gl.uniform3fv(at.eye, eye)
    gl.uniform3fv(at.right, right)
    gl.uniform3fv(at.up, up)
    gl.uniform3fv(at.forward, forward)
    gl.uniform2f(at.lens, tan * (width / height), tan)
    gl.uniform2f(at.fog, orbit.distance + HAZE.from, orbit.distance + HAZE.to)
    gl.uniform1f(at.gain, gain)
    gl.uniform1f(at.wind, Math.PI * 2 * GRASS.times * u)
    const where = foxAt(u), joints = foxJoints(u)
    gl.uniform4f(at.fox, ...where.at, where.turn)
    gl.uniform3fv(at.leg, LEGS.flatMap((id) => joints.legs[id].flat()))
    gl.uniform3fv(at.tail, joints.tail.flat())
    gl.uniform1f(at.bob, joints.bob)
    const specks = [...LIGHTS.map((l) => ({ at: wispAt(u, l.behind), r: l.r, color: l.color })), ...STARS.map((s, i) => ({ at: s, r: 0.024, color: i % 3 ? '#f4f1e4' : '#c2c0cc' })), MOON]
    gl.uniform4fv(at.speck, specks.flatMap((s) => [...s.at, s.r]))
    gl.uniform3fv(at.speckColor, specks.flatMap((s) => rgb(s.color)))
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels)
    return this.pixels
  }

  dispose() {
    this.gl.deleteProgram(this.program)
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
