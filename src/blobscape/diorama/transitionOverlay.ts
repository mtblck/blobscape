import { KIND_NUMBER, TRANSITION_GLSL, type Transition } from '../../splat-core/transition.ts'

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/**
 * Draws a screen transition (`splat-core/transition.ts`, whose shader this runs) on a WebGL 2 canvas laid over the
 * view: the old picture and the cover color, premultiplied, so the live view shows through wherever neither lies.
 */
export class TransitionOverlay {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private texture: WebGLTexture
  private at: Record<string, WebGLUniformLocation | null> = {}

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('No WebGL 2 for the transition')
    this.gl = gl
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, source)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'transition shader')
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, TRANSITION_GLSL))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'transition program')
    this.program = p
    for (const name of ['u_from', 'u_size', 'u_cover', 'u_progress', 'u_cell', 'u_seed', 'u_kind', 'u_through']) this.at[name] = gl.getUniformLocation(p, name)
    this.texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v)
  }

  /** The old picture, rows from the top, the size the canvas is drawn at. */
  setFrom(picture: HTMLCanvasElement) {
    const gl = this.gl
    this.canvas.width = picture.width
    this.canvas.height = picture.height
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture)
  }

  /** The overlay `progress` of the way through `t`; `cell` is an art pixel in device pixels, `cover` 0 to 1 a channel. */
  draw(t: Transition, progress: number, cell: number, cover: [number, number, number], seed: number) {
    const gl = this.gl, a = this.at
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(a.u_from, 0)
    gl.uniform2f(a.u_size, this.canvas.width, this.canvas.height)
    gl.uniform3f(a.u_cover, cover[0], cover[1], cover[2])
    gl.uniform1f(a.u_progress, progress)
    gl.uniform1f(a.u_cell, cell)
    gl.uniform1f(a.u_seed, seed)
    gl.uniform1i(a.u_kind, KIND_NUMBER[t.id])
    gl.uniform1i(a.u_through, t.through ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() { this.gl.getExtension('WEBGL_lose_context')?.loseContext() }
}
