import type { Orbit } from '../../splat-core/orbit.ts'
import { BUSHES, FIRE_LIGHT, HAZE, LANTERN_LIGHT, LOGS, LOOP, MOONLIGHT, MUSHROOMS, PINES, ROCKS, SPECKS, STONES, flames, flicker, linear, pineLean, rgb, specks, type V3 } from './layout.ts'

/**
 * The campfire with no engine and no library: one fragment shader on a bare WebGL 2 context, the way a scene tends
 * to get written when nobody names a tool. Every shape is a distance function typed out below, and each pixel walks
 * a ray through them (sphere tracing), then asks again toward the moon and toward the fire for shadows. Small glowing
 * things (sparks, embers, fireflies, stars) are spheres the ray is tested against directly.
 *
 * It gives the scene drawn small with clear pixels where there is nothing; the page finishes it as pixel art.
 */

const f = (n: number) => (Number.isInteger(n) ? `${n}.` : `${+n.toFixed(4)}`)
const v3 = (v: readonly number[]) => `vec3(${v.map(f).join(',')})`
/** A palette color, for the shader. */
const c = (hex: string) => v3(rgb(hex))
const lit = (hex: string, k: number) => v3(rgb(hex).map((x) => linear(x) * k))

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
uniform float fire;
uniform vec4 pine[${PINES.length}];
uniform vec4 flame;
uniform vec4 speck[${SPECKS}];
uniform vec3 speckColor[${SPECKS}];

const vec3 SUN = normalize(${v3(MOONLIGHT.from)});
bool solidOnly = false;

float hash(vec3 p) { p = fract(p * .3183099 + vec3(.1, .2, .3)); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
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
float box(vec3 p, vec3 at, vec3 h, float r) { vec3 q = abs(p - at) - h + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }
float roof(vec3 p, vec3 at, vec2 h, float top) { float k = top / h.y; return max(max((abs(p.z - at.z) * k + (p.y - at.y - top)) / sqrt(1. + k * k), at.y - p.y), abs(p.x - at.x) - h.x); }
vec2 nearer(vec2 a, float d, float m) { return d < a.x ? vec2(d, m) : a; }
/** A point as it was before a thing turned by an angle about z through a pivot and grew by a size. */
vec3 unturned(vec3 p, vec3 pivot, float angle, float size) { vec3 q = (p - pivot) / size; float s = sin(angle), k = cos(angle); return pivot + vec3(q.x * k + q.y * s, q.y * k - q.x * s, q.z); }
vec3 unturnedX(vec3 p, vec3 pivot, float angle, float size) { vec3 q = (p - pivot) / size; float s = sin(angle), k = cos(angle); return pivot + vec3(q.x, q.y * k + q.z * s, q.z * k - q.y * s); }

/** The nearest surface to a point: how far, and which material. */
vec2 map(vec3 p) {
  float ground = drum(p, vec3(0, -.3, 0), .3, 1.75, 1.75);
  if (ground < .1) ground -= .03 * (noise(p / .6 * 3.) - .5);
  vec2 d = vec2(ground, 1.);

  float camp = length(p - vec3(.1, .15, .25)) - .62;
  if (camp < .08) {
    d = nearer(d, drum(p, vec3(.1, -.03, .25), .055, .5, .5), 2.);
${STONES.map((s) => `    d = nearer(d, length(p - ${v3(s.at)}) - ${f(s.r)} - .012 * (noise(p / .12 * 3.) - .5), 3.);`).join('\n')}
${LOGS.map(([a, b]) => `    d = nearer(d, stick(p, ${v3(a)}, ${v3(b)}, .032, .032), 4.);`).join('\n')}
    if (!solidOnly) {
      vec3 q = unturned(p, vec3(.1, .05, .25), flame.y, flame.x);
      d = nearer(d, stick(q, vec3(.1, .1, .25), vec3(.1, .5, .25), .11, .01) * flame.x, 5.);
      q = unturnedX(p, vec3(.1, .05, .25), flame.w, flame.z);
      d = nearer(d, stick(q, vec3(.1, .09, .28), vec3(.12, .32, .28), .065, .01) * flame.z, 6.);
    }
  } else d = nearer(d, camp, 0.);

  float tent = box(p, vec3(-.8, .28, -.15), vec3(.46, .3, .4), 0.);
  if (tent < .08) {
    d = nearer(d, max(roof(p, vec3(-.8, 0, -.15), vec2(.42, .36), .52), -roof(p, vec3(-.55, -.02, -.15), vec2(.3, .25), .38)), 7.);
    d = nearer(d, box(p, vec3(-1., .012, -.15), vec3(.2, .012, .2), 0.), 8.);
    d = nearer(d, stick(p, vec3(-.36, 0, -.15), vec3(-.36, .56, -.15), .015, .015), 9.);
  } else d = nearer(d, tent, 0.);

  d = nearer(d, box(p, vec3(-.38, .1, .42), vec3(.08, .1, .06), .03), 10.);
  d = nearer(d, box(p, vec3(-.38, .07, .49), vec3(.05, .04, .02), .01), 11.);
  d = nearer(d, stick(p, vec3(.55, .075, .78), vec3(1.02, .075, .55), .075, .075), 12.);
  d = nearer(d, stick(p, vec3(1.02, .075, .55), vec3(1.035, .075, .543), .06, .06), 13.);
  d = nearer(d, stick(p, vec3(-.3, 0, -.55), vec3(-.3, .42, -.55), .016, .016), 14.);
  if (!solidOnly) d = nearer(d, box(p, vec3(-.3, .47, -.55), vec3(.035, .045, .035), 0.), 15.);
  d = nearer(d, box(p, vec3(-.3, .53, -.55), vec3(.045, .015, .045), 0.), 16.);

  for (int i = 0; i < ${PINES.length}; i++) {
    vec3 foot = vec3(pine[i].x, 0, pine[i].y);
    float h = pine[i].z, near = stick(p, foot, foot + vec3(0, 2.6 * h, 0), .72 * h, .2 * h);
    if (near > .1) { d = nearer(d, near, 0.); continue; }
    vec3 q = unturned(p, foot, pine[i].w, 1.);
    d = nearer(d, drum(q, foot, h, .03 + .03 * h, .03 + .03 * h), 17.);
    for (int k = 0; k < 4; k++) {
      float r = h * (.675 - .1375 * float(k));
      d = nearer(d, drum(q, foot + vec3(0, h * (.55 + .475 * float(k)), 0), h * .675, r, r * .2), 18.);
    }
  }
${ROCKS.map((r) => `  { float k = ball(p, ${v3(r.at)}, ${v3(r.r)}); if (k < .1) k -= .025 * (noise(p / .2 * 3.) - .5); d = nearer(d, k, 19.); }`).join('\n')}
${BUSHES.map((b) => `  { float k = ball(p, ${v3(b.at)}, ${v3([b.r, b.r * 0.8, b.r])}); if (k < .08) k -= .02 * (noise(p / .1 * 3.) - .5); d = nearer(d, k, 20.); }`).join('\n')}
${MUSHROOMS.map(([x, z]) => `  { float k = length(p - ${v3([x, 0.04, z])}) - .08; if (k < .05) k = min(drum(p, ${v3([x, 0, z])}, .05, .014, .014), ball(p, ${v3([x, 0.06, z])}, vec3(.04, .026, .04))); d = nearer(d, k, 21.); }`).join('\n')}
  return d;
}

vec3 pick3(float k, vec3 a, vec3 b, vec3 c) { return k < 1. ? a : k < 2. ? b : c; }
vec3 speckle(vec3 p, float size, vec3 a, vec3 b, vec3 c) { float k = hash(floor(p / size)); return pick3(k * k * 3., a, b, c); }
vec3 patches(vec3 p, float size, vec3 a, vec3 b, vec3 c) { return pick3(noise(p / size * 1.2) * 3., a, b, c); }
vec3 bands(float x, float size, vec3 a, vec3 b) { return mod(floor(x / size), 2.) < 1. ? a : b; }

/** A material's paint at a point (where the thing rests, before it moves) for a surface facing n. */
vec3 paint(float m, vec3 p, vec3 n) {
  bool top = n.y > .6, under = n.y < -.6;
  if (m < 1.5) return top ? patches(p, .35, ${c('#1b3a2a')}, ${c('#2c5a38')}, ${c('#4a8048')}) : pick3(mod(floor(p.y / .07), 3.), ${c('#4a3020')}, ${c('#2a1c16')}, ${c('#6e4a2e')});
  if (m < 2.5) return speckle(p, .05, ${c('#6e4a2e')}, ${c('#4a3020')}, ${c('#9a6d43')});
  if (m < 3.5) return top ? ${c('#8a8898')} : under ? ${c('#3a3a48')} : ${c('#5d5c6c')};
  if (m < 4.5) return speckle(p, .04, ${c('#4a3020')}, ${c('#2a1c16')}, ${c('#d9541e')});
  if (m < 5.5) return p.y < .27 ? ${c('#f59a2a')} : ${c('#d9541e')};
  if (m < 6.5) return p.y < .2 ? ${c('#fff3b0')} : ${c('#ffd166')};
  if (m < 7.5) return p.x < -.4 ? bands(p.x, .14, ${c('#b9485a')}, ${c('#7b2f45')}) : ${c('#141c36')};
  if (m < 8.5) return ${c('#2f477d')};
  if (m < 9.5) return ${c('#9a6d43')};
  if (m < 10.5) return p.y < .13 ? ${c('#2f477d')} : ${c('#4a6fae')};
  if (m < 11.5) return ${c('#c79a63')};
  if (m < 12.5) return top ? bands(p.x, .05, ${c('#6e4a2e')}, ${c('#4a3020')}) : under ? ${c('#2a1c16')} : ${c('#4a3020')};
  if (m < 13.5) return ${c('#c79a63')};
  if (m < 14.5) return ${c('#4a3020')};
  if (m < 15.5) return ${c('#ffd166')};
  if (m < 16.5) return ${c('#3a3a48')};
  if (m < 17.5) return bands(p.y, .08, ${c('#4a3020')}, ${c('#2a1c16')});
  if (m < 18.5) return top ? speckle(p, .05, ${c('#2c5a38')}, ${c('#2c5a38')}, ${c('#4a8048')}) : under ? ${c('#10241c')} : ${c('#1b3a2a')};
  if (m < 19.5) return top ? patches(p, .12, ${c('#8a8898')}, ${c('#4a8048')}, ${c('#8a8898')}) : bands(p.y, .06, ${c('#5d5c6c')}, ${c('#3a3a48')});
  if (m < 20.5) return top ? speckle(p, .04, ${c('#4a8048')}, ${c('#2c5a38')}, ${c('#79a85a')}) : ${c('#1b3a2a')};
  return p.y < .045 ? ${c('#e8dcc0')} : ${c('#b9485a')};
}

vec3 normalAt(vec3 p) { vec2 e = vec2(.002, 0); return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x)); }

/** How much of a light a point sees, walking toward it: 1 in the open, 0 behind something, soft at the edge. */
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

/** How open a point is: 1 on a face, less in a corner. */
float open(vec3 p, vec3 n) {
  float k = 0., w = 1.;
  for (int i = 1; i <= 4; i++) { float h = .035 * float(i); k += w * (h - map(p + n * h).x); w *= .6; }
  return clamp(1. - 3. * k, 0., 1.);
}

float falloff(float d2, float range) { float r2 = range * range, fade = max(1. - d2 / (r2 * 4.), 0.); return fade * fade / (1. + d2 / r2); }

void main() {
  vec3 dir = normalize(forward + ndc.x * lens.x * right + ndc.y * lens.y * up);
  float t = 0., m = 0.;
  bool hit = false;
  for (int i = 0; i < 110 && t < 16.; i++) {
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
    if (r <= 0.) continue;
    vec3 oc = eye - speck[i].xyz;
    float b = dot(oc, dir), k = b * b - dot(oc, oc) + r * r;
    if (k < 0.) continue;
    float s = -b - sqrt(k);
    if (s > 0. && s < near) { near = s; glow = speckColor[i]; speckHit = true; }
  }
  if (speckHit) { color = vec4(glow, 1.); return; }
  if (!hit) { color = vec4(0); return; }

  vec3 p = eye + dir * t, n = normalAt(p), at = p;
  if (m > 4.5 && m < 5.5) at = unturned(p, vec3(.1, .05, .25), flame.y, flame.x);
  if (m > 5.5 && m < 6.5) at = unturnedX(p, vec3(.1, .05, .25), flame.w, flame.z);
  vec3 base = paint(m, at, n);
  // the flames and the lantern give their own light
  if ((m > 4.5 && m < 6.5) || (m > 14.5 && m < 15.5)) { color = vec4(base, 1.); return; }

  float facing = max(dot(n, SUN), 0.) * mix(1., seen(p + n * .012, SUN, 4., 10.), ${f(MOONLIGHT.shadow)});
  float amb = ${f(MOONLIGHT.ambient)} * mix(.55, 1., open(p, n));
  vec3 c = base * (amb + (1. - ${f(MOONLIGHT.ambient)}) * facing) * .9;
  // shade leans cool and moonlit faces a touch warm, as painted light does
  c *= mix(vec3(.84, .9, 1.14), vec3(1.03, 1., .95), facing);
  vec3 lin = pow(c, vec3(2.2));

  vec3 light = vec3(1);
  vec3 to = ${v3(FIRE_LIGHT.at)} - p; float d2 = dot(to, to), far = sqrt(d2);
  float fall = falloff(d2, ${f(FIRE_LIGHT.range)});
  if (fall > .002) light += ${lit(FIRE_LIGHT.color, FIRE_LIGHT.strength)} * fire * fall * (abs(dot(n, to / far)) * .65 + .35) * seen(p + n * .012, to / far, far - .06, 6.);
  to = ${v3(LANTERN_LIGHT.at)} - p; d2 = dot(to, to);
  light += ${lit(LANTERN_LIGHT.color, LANTERN_LIGHT.strength)} * falloff(d2, ${f(LANTERN_LIGHT.range)}) * (abs(dot(n, normalize(to))) * .65 + .35);
  lin *= light;
  lin = mix(lin, ${lit(HAZE.color, 1)}, clamp((dot(p - eye, forward) - fog.x) / (fog.y - fog.x), 0., 1.));
  color = vec4(pow(min(lin, 1.), vec3(1. / 2.2)), 1.);
}`

export class ShaderPanel {
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
    for (const name of ['eye', 'right', 'up', 'forward', 'lens', 'fog', 'fire', 'pine', 'flame', 'speck', 'speckColor']) this.at[name] = gl.getUniformLocation(program, name)
  }

  /** Draws the scene `t` seconds in, `width` by `height`, and gives its pixels: RGBA, bottom row first. */
  draw(t: number, orbit: Orbit, width: number, height: number, fire: number, fov: number): Uint8Array {
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
    gl.uniform1f(at.fire, fire * flicker(u))
    gl.uniform4fv(at.pine, PINES.flatMap((p, i) => [p.at[0], p.at[1], p.trunk, pineLean(i, u)]))
    const fl = flames(u)
    gl.uniform4f(at.flame, fl.flame.size, fl.flame.lean, fl.core.size, fl.core.lean)
    const all = specks(u)
    gl.uniform4fv(at.speck, all.flatMap((s) => [...s.at, s.r]))
    gl.uniform3fv(at.speckColor, all.flatMap((s) => rgb(s.color)))
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
