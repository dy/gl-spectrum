/**
 * gl-spectrum – WebGL2 spectrum renderer.
 *
 * Draws magnitudes, a level in dB per FFT bin, over a frequency axis. Where several bins fall in one device-pixel
 * column, the column shows the loudest, so a one-bin peak among thousands stays visible; where bins are further apart,
 * an anti-aliased line runs through them, with dots above the floor once they are 6 CSS px apart. A fill under the line is colored by
 * level, and can mirror the line to either side of a base. The CPU reduces bins to vertices in doubles; the GPU draws
 * one quad per viewport from a small texture of them.
 */

const TW = 2048      // vertex texture width, texels
const DOT = 6        // CSS px between bins where dots appear; they reach full size at twice that

const ATTRS = { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false }
const COLOR = [0.25, 0.45, 0.85, 1]
const LEVELS = [-100, 0]
const FILL = 1 / 3   // default fill: the line color at this share of its opacity

// Frequency axes: where f Hz sits between lo and hi, 0..1, and back
//   log  equal space per octave, from 20 Hz
//   mel  equal space per mel, 2595 · log10(1 + f / 700) (O'Shaughnessy 1987, as in HTK); near linear under 1 kHz
//   erb  equal space per auditory filter, ERB-number 21.4 · log10(1 + 0.00437 f) (Glasberg & Moore 1990, "Derivation
//        of auditory filter shapes from notched-noise data", Hearing Research 47, eq. 4, f in Hz); from 0
//   lin  equal space per hertz, from 0
const mel = f => 2595 * Math.log10(1 + f / 700), hertz = m => 700 * (10 ** (m / 2595) - 1)
const erb = f => 21.4 * Math.log10(1 + .00437 * f), unerb = e => (10 ** (e / 21.4) - 1) / .00437
const WARP = { log: [Math.log2, u => 2 ** u], mel: [mel, hertz], erb: [erb, unerb], lin: [f => f, f => f] }
const axis = (name, low) => {
  let [to, from] = WARP[name]
  return { low, at: (f, lo, hi) => (to(f) - to(lo)) / (to(hi) - to(lo)), of: (u, lo, hi) => from(to(lo) + u * (to(hi) - to(lo))) }
}
export const scales = { log: axis('log', 20), mel: axis('mel', 0), erb: axis('erb', 0), lin: axis('lin', 0) }

const VERT = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2. - 1., 0, 1); }`

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D data; // per vertex [x, level 0..1, dot radius, 1 or 0 for a gap], x ascending; then per column
                              // the last vertex at or left of its center, or the first
uniform sampler2D lut;        // level → fill color, premultiplied
uniform vec2 origin;          // viewport corner, device px
uniform int count, index;     // vertices; where the per-column index starts
uniform float hw, reach;      // half line width; how far a vertex can touch a pixel
uniform float base, up, down; // level 0's y; px from level 0 to level 1 upward, downward (0: that side is not drawn)
uniform vec4 color;           // premultiplied
out vec4 frag;

vec4 at(int i) { return texelFetch(data, ivec2(i & ${TW - 1}, i >> ${Math.log2(TW)}), 0); }

float seg(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a, ap = p - a;
  return length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-12), 0., 1.));
}

void main() {
  vec2 p = gl_FragCoord.xy - origin;
  int lo = int(at(index + int(p.x)).x), jl = lo, jr = lo;
  while (jl > 0 && p.x - at(jl).x < reach) jl--;
  while (jr < count - 1 && at(jr).x - p.x < reach) jr++;

  // line through the vertices, on each drawn side of the base, and dots
  float d = 1e9, dots = 0.;
  vec4 a = vec4(0);
  for (int j = jl; j <= jr; j++) {
    vec4 b = at(j);
    if (b.w > 0.) {
      vec2 u = vec2(b.x, base + b.y * up), l = vec2(b.x, base - b.y * down);
      float e = 1e9;
      if (up > 0. || down == 0.) e = distance(p, u);
      if (down > 0.) e = min(e, distance(p, l));
      d = min(d, e);
      dots = max(dots, b.z + .5 - e);
      if (j > jl && a.w > 0.) {
        if (up > 0. || down == 0.) d = min(d, seg(p, vec2(a.x, base + a.y * up), u));
        if (down > 0.) d = min(d, seg(p, vec2(a.x, base - a.y * down), l));
      }
    }
    a = b;
  }
  float lc = clamp(max(hw + .5 - d, dots), 0., 1.);

  // fill between the drawn sides at this x, colored by the level of its height
  vec4 fill = vec4(0), s0 = at(lo), s1 = at(min(lo + 1, count - 1));
  if (s0.w > 0. && s1.w > 0. && s0.x <= p.x && p.x <= s1.x && s0.x < s1.x) {
    float t = mix(s0.y, s1.y, (p.x - s0.x) / (s1.x - s0.x));
    float c = clamp(min(base + t * up, p.y + .5) - max(base - t * down, p.y - .5), 0., 1.);
    float v = p.y >= base ? (p.y - base) / max(up, 1e-6) : (base - p.y) / max(down, 1e-6);
    fill = texture(lut, vec2(clamp(v, 0., 1.) * ${255 / 256} + ${.5 / 256}, .5)) * c;
  }
  frag = fill * (1. - color.a * lc) + color * lc;
}`

const UNIFORMS = ['data', 'lut', 'origin', 'count', 'index', 'hw', 'reach', 'base', 'up', 'down', 'color']
const UNPACK = ['UNPACK_ALIGNMENT', 4, 'UNPACK_ROW_LENGTH', 0, 'UNPACK_SKIP_ROWS', 0, 'UNPACK_SKIP_PIXELS', 0, 'UNPACK_FLIP_Y_WEBGL', 0, 'UNPACK_PREMULTIPLY_ALPHA_WEBGL', 0]

// Programs are shared by all instances on a context and dropped when it is lost
const programs = new WeakMap()

export default class Spectrum {
  #data = new Float32Array(0) // dB per bin, bin k at k · sampleRate / (2 · length) Hz
  #rate = 44100
  #scale = 'log'
  #band = null       // [low, high] Hz or null for the scale's floor to Nyquist
  #levels = LEVELS   // [floor, top] dB
  #align = 0         // 0: up from the bottom; 1: down from the top; between: mirrored to both sides of a base there
  #viewport = null   // CSS px [x, y, w, h] or null for the whole canvas
  #color = COLOR
  #fill = null       // color, colormap (array of colors), false to hide, null for #color at FILL of its opacity
  #thickness = 1
  #pixelRatio = null
  #v = new Float64Array(0)   // per vertex [x, level 0..1, dot radius, valid, bin]
  #buf = new Float32Array(0) // texels
  #tex = null
  #rows = 0
  #lut = null
  #painted = false
  #drawn = false

  constructor(target, options) {
    let gl = target?.getContext ? target.getContext('webgl2', ATTRS) : target
    if (!(gl instanceof WebGL2RenderingContext)) throw TypeError('gl-spectrum: expected a canvas that supports WebGL2, or a WebGL2RenderingContext')
    this.gl = gl
    this.canvas = gl.canvas
    this.canvas.addEventListener?.('webglcontextlost', this.#lost)
    this.canvas.addEventListener?.('webglcontextrestored', this.#restored)
    if (!gl.isContextLost()) program(gl, false)
    if (options) this.update(options)
  }

  /** Number of bins */
  get length() { return this.#data.length }
  get band() { return this.#band ? [...this.#band] : [scales[this.#scale].low, this.#rate / 2] }
  get levels() { return [...this.#levels] }

  /** Set any option (see index.d.ts); undefined keeps, null restores the default. */
  update(o = {}) {
    if (o.data !== undefined) this.#data = o.data instanceof Float32Array ? o.data : Float32Array.from(o.data ?? [])
    if (o.sampleRate !== undefined) this.#rate = o.sampleRate == null ? 44100 : positive(o.sampleRate, 'sampleRate')
    if (o.scale !== undefined) {
      if (o.scale != null && !scales.hasOwnProperty(o.scale)) throw TypeError(`gl-spectrum: scale must be log, mel, erb or lin, not ${o.scale}`)
      this.#scale = o.scale ?? 'log'
    }
    if (o.band !== undefined) this.#band = o.band && nums(o.band, 2, 'band')
    if (this.#band && !(this.#band[0] < this.#band[1] && this.#band[0] >= 0 && (this.#scale !== 'log' || this.#band[0] > 0)))
      throw RangeError(`gl-spectrum: band must be [low, high] Hz, 0 ≤ low < high${this.#scale === 'log' ? ', low > 0 on a log scale' : ''}`)
    if (o.levels !== undefined) {
      this.#levels = o.levels ? nums(o.levels, 2, 'levels') : LEVELS
      if (!(this.#levels[0] < this.#levels[1])) throw RangeError('gl-spectrum: levels must be [floor, top] dB, floor < top')
    }
    if (o.align !== undefined) {
      this.#align = o.align == null ? 0 : nums([o.align], 1, 'align')[0]
      if (!(this.#align >= 0 && this.#align <= 1)) throw RangeError('gl-spectrum: align must be from 0 to 1')
    }
    if (o.viewport !== undefined) this.#viewport = o.viewport && nums(o.viewport, 4, 'viewport')
    if (o.thickness !== undefined) this.#thickness = o.thickness == null ? 1 : nums([o.thickness], 1, 'thickness')[0]
    if (o.pixelRatio !== undefined) this.#pixelRatio = o.pixelRatio == null ? null : positive(o.pixelRatio, 'pixelRatio')
    if (o.color !== undefined) { this.#color = o.color == null ? COLOR : rgba(o.color, this.gl); this.#painted = false }
    if (o.fill !== undefined) {
      let f = o.fill
      if (f === false || f == null || f === true) this.#fill = f === false ? false : null
      else if (typeof f === 'string' || typeof f[0] === 'number') this.#fill = [rgba(f, this.gl)]
      else {
        this.#fill = Array.from(f, s => rgba(s, this.gl))
        if (this.#fill.length < 2) throw TypeError('gl-spectrum: a colormap needs two colors or more')
      }
      this.#painted = false
    }
    return this
  }

  /** Draw into the viewport, over what is there. A Float32Array given as data is read now: refill it and render again. */
  render() {
    let gl = this.gl
    this.#drawn = true
    if (gl.isContextLost()) return this
    let [X, Y, W, H] = this.#rect()
    if (!(W > 0 && H > 0)) return this
    let pr = this.#pr(), hw = Math.max(this.#thickness * pr / 2, .5), R = (this.#thickness + 3) / 2 * pr
    let count = this.#vertices(W, hw, R)
    if (!count) return this
    let { prog, vao, u } = program(gl)

    let index = Math.ceil(count / TW) * TW, rows = Math.ceil((index + W) / TW), v = this.#v
    let t = this.#buf.length >= rows * TW * 4 ? this.#buf : this.#buf = new Float32Array(rows * TW * 4), reach = hw
    for (let i = 0; i < count; i++) {
      t[i * 4] = v[i * 5]; t[i * 4 + 1] = v[i * 5 + 1]; t[i * 4 + 2] = v[i * 5 + 2]; t[i * 4 + 3] = v[i * 5 + 3]
      if (v[i * 5 + 2] > reach) reach = v[i * 5 + 2]
    }
    for (let c = 0, i = 0; c < W; c++) {
      while (i < count - 1 && v[(i + 1) * 5] <= c + .5) i++
      t[(index + c) * 4] = i
    }
    gl.activeTexture(gl.TEXTURE0)
    if (!this.#tex || rows > this.#rows) {
      gl.deleteTexture(this.#tex)
      gl.bindTexture(gl.TEXTURE_2D, this.#tex = gl.createTexture())
      filter(gl, gl.NEAREST)
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, TW, this.#rows = rows)
    }
    else gl.bindTexture(gl.TEXTURE_2D, this.#tex)
    unpack(gl)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TW, rows, gl.RGBA, gl.FLOAT, t)

    gl.activeTexture(gl.TEXTURE1)
    if (!this.#lut) {
      gl.bindTexture(gl.TEXTURE_2D, this.#lut = gl.createTexture())
      filter(gl, gl.LINEAR)
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 256, 1)
      this.#painted = false
    }
    else gl.bindTexture(gl.TEXTURE_2D, this.#lut)
    if (!this.#painted) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.#palette())
      this.#painted = true
    }

    // level 0 sits on a pixel center for odd line widths, on an edge for even, inset so the line is whole at both ends
    let a = this.#align, m = hw, span = H - 2 * m, base = m + a * span
    base = Math.round(2 * hw) % 2 ? Math.floor(base) + .5 : Math.round(base)
    gl.useProgram(prog)
    gl.bindVertexArray(vao)
    this.#target(X, Y, W, H)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.BLEND)
    gl.blendEquation(gl.FUNC_ADD)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.viewport(X, Y, W, H)
    gl.uniform1i(u.data, 0)
    gl.uniform1i(u.lut, 1)
    gl.uniform2f(u.origin, X, Y)
    gl.uniform1i(u.count, count)
    gl.uniform1i(u.index, index)
    gl.uniform1f(u.hw, hw)
    gl.uniform1f(u.reach, reach + 1)
    gl.uniform1f(u.base, base)
    gl.uniform1f(u.up, a < 1 ? H - m - base : 0)
    gl.uniform1f(u.down, a > 0 ? base - m : 0)
    let c = this.#color
    gl.uniform4f(u.color, c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3])
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.activeTexture(gl.TEXTURE0)
    return this
  }

  /** Clear the viewport to transparent. */
  clear() {
    let gl = this.gl
    if (gl.isContextLost()) return this
    this.#target(...this.#rect())
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return this
  }

  /** The bin the column at x (CSS px from the viewport's left) shows: the loudest of the bins under it, or between bins
   *  the nearest; { bin, frequency, level } or null over a gap. */
  pick(x) {
    let [X, , W] = this.#rect(), c = Math.floor(((this.#viewport?.[0] ?? 0) + x) * this.#pr()) - X, d = this.#data, n = d.length
    if (!(c >= 0 && c < W && n)) return null
    let { at, first } = this.#axis(W), bin = -1
    let find = e => { let a = first, z = n; while (a < z) { let m = (a + z) >> 1; if (at(m) < e) a = m + 1; else z = m } return a }
    let b0 = find(c), b1 = find(c + 1)
    if (b0 < b1) { for (let b = b0; b < b1; b++) if (d[b] === d[b] && (bin < 0 || d[b] > d[bin])) bin = b }
    else {
      let l = b0 - 1, r = b0, m = c + .5
      bin = l < first ? (r < n ? r : -1) : r >= n || m - at(l) <= at(r) - m ? l : r
      if (bin >= 0 && d[bin] !== d[bin]) bin = -1
    }
    return bin < 0 ? null : { bin, frequency: bin * (this.#rate / 2 / n), level: d[bin] }
  }

  destroy() {
    this.canvas.removeEventListener?.('webglcontextlost', this.#lost)
    this.canvas.removeEventListener?.('webglcontextrestored', this.#restored)
    if (!this.gl.isContextLost()) { this.gl.deleteTexture(this.#tex); this.gl.deleteTexture(this.#lut) }
    this.#tex = this.#lut = null
    this.#data = new Float32Array(0)
  }

  // ── view ────────────────────────────────────────────────────────────────

  #pr() { return this.#pixelRatio || globalThis.devicePixelRatio || 1 }

  // Viewport in device px, GL origin: [x, y, w, h]
  #rect() {
    let gl = this.gl, H = gl.drawingBufferHeight
    if (!this.#viewport) return [0, 0, gl.drawingBufferWidth, H]
    let pr = this.#pr(), [x, y, w, h] = this.#viewport, X = Math.round(x * pr), Y = Math.round((y + h) * pr)
    return [X, H - Y, Math.round((x + w) * pr) - X, Y - Math.round(y * pr)]
  }

  #target(X, Y, W, H) {
    let gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(X, Y, W, H)
    gl.colorMask(true, true, true, true)
  }

  // Bin b's x in device px from the viewport's left, the bin at x, and the first bin the scale can place
  #axis(W) {
    let [lo, hi] = this.band, s = scales[this.#scale], df = this.#rate / 2 / this.#data.length
    return { at: b => s.at(b * df, lo, hi) * W, bin: x => Math.max(s.of(x / W, lo, hi), 0) / df, first: this.#scale === 'log' ? 1 : 0 }
  }

  // Bins reduced to vertices for a W device px wide view: the bins of one column become a vertex at its center holding
  // the loudest, a bin alone in its column a vertex where it sits. Bins within reach of the edges are kept, so the line
  // enters and leaves the view as it would continue. Returns the vertex count; #v holds them.
  #vertices(W, hw, R) {
    let d = this.#data, n = d.length, [f0, f1] = this.#levels
    if (!n) return 0
    let { at, bin, first } = this.#axis(W), reach = Math.max(hw, R) + 2
    let last = Math.min(Math.ceil(bin(W + reach)), n - 1)
    first = Math.max(Math.floor(bin(-reach)), first)
    let v = this.#v.length >= (W + 2 * reach + 8) * 5 ? this.#v : this.#v = new Float64Array(Math.ceil(W + 2 * reach + 8) * 5)
    let count = 0, col = NaN, bins = 0, x1 = 0, top = -Infinity, loud = -1, any = false
    let emit = () => {
      if (!bins) return
      let p = count++ * 5
      v[p] = bins > 1 ? col + .5 : x1
      v[p + 1] = any ? Math.min(Math.max((top - f0) / (f1 - f0), 0), 1) : 0
      v[p + 2] = bins > 1 ? -1 : 0 // dense, till radii are known
      v[p + 3] = +any
      v[p + 4] = any ? loud : 0
    }
    for (let b = first; b <= last; b++) {
      let x = at(b), c = Math.floor(x), y = d[b]
      if (c !== col) { emit(); col = c; bins = 0; top = -Infinity; loud = -1; any = false }
      if (!bins) x1 = x
      bins++
      if (y === y) { if (!any || y > top) top = y, loud = b; any = true }
    }
    emit()
    // dots where bins stand DOT CSS px apart, full size at twice that, above the floor
    let pr = this.#pr()
    for (let i = 0; i < count; i++) {
      let p = i * 5
      if (v[p + 2] < 0 || !v[p + 3] || !v[p + 1]) { v[p + 2] = 0; continue } // none on dense columns, gaps, the floor
      let s = Math.min(i ? v[p] - v[p - 5] : Infinity, i < count - 1 ? v[p + 5] - v[p] : Infinity) / pr
      let f = Math.min(Math.max((s - DOT) / DOT, 0), 1)
      v[p + 2] = f && R && hw + (R - hw) * f * f * (3 - 2 * f)
    }
    return count
  }

  // Level → fill color, 256 texels, premultiplied
  #palette() {
    let f = this.#fill
    if (f === false) return new Uint8Array(1024)
    if (!f) { let c = this.#color, a = c[3] * FILL; f = [[c[0], c[1], c[2], a]] }
    if (f.length > 1) return colormap(f)
    let px = new Uint8Array(1024), [r, g, b, a] = f[0], q = [r * a, g * a, b * a, a].map(v => Math.round(v * 255))
    for (let i = 0; i < 256; i++) px.set(q, i * 4)
    return px
  }

  #lost = e => {
    e.preventDefault()
    programs.delete(this.gl)
    this.#tex = this.#lut = null
    this.#rows = 0
  }

  #restored = () => { if (this.#drawn) this.render() }
}

// ── helpers ───────────────────────────────────────────────────────────────

function unpack(gl) {
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
  for (let i = 0; i < UNPACK.length; i += 2) gl.pixelStorei(gl[UNPACK[i]], UNPACK[i + 1])
}

function filter(gl, f) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

function nums(v, len, name) {
  let a = Array.from({ length: len }, (_, i) => +v?.[i])
  if (!a.every(Number.isFinite)) throw TypeError(`gl-spectrum: ${name} must be ${len > 1 ? len + ' finite numbers' : 'a finite number'}`)
  return a
}

function positive(v, name) {
  if (!(+v > 0 && +v < Infinity)) throw TypeError(`gl-spectrum: ${name} must be a positive number`)
  return +v
}

// Compiling starts with the first spectrum on a context, so the driver works on it while data comes; the first draw waits
function program(gl, ready = true) {
  let p = programs.get(gl)
  if (!p) {
    let prog = gl.createProgram(), shaders = [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].map(([type, src]) => {
      let s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      gl.attachShader(prog, s)
      return s
    })
    gl.linkProgram(prog)
    programs.set(gl, p = { prog, shaders, vao: gl.createVertexArray(), u: null })
  }
  if (ready && !p.u) {
    if (!gl.getProgramParameter(p.prog, gl.LINK_STATUS)) throw Error('gl-spectrum: ' + p.shaders.map(s => gl.getShaderInfoLog(s)).join('') + gl.getProgramInfoLog(p.prog))
    p.u = {}
    for (let name of UNIFORMS) p.u[name] = gl.getUniformLocation(p.prog, name)
  }
  return p
}

// ── colors ────────────────────────────────────────────────────────────────

const lin = c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4
const enc = y => y <= .0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - .055

// sRGB 0..1 ↔ OKLab (Ottosson 2020)
function oklab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b)
  let l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b)
  let m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b)
  let s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b)
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s]
}
function srgb([L, a, b]) {
  let l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s].map(v => enc(Math.min(Math.max(v, 0), 1)))
}

// Colors evenly spaced from the floor to the top, interpolated in premultiplied OKLab (CSS Color 4 §12.3)
function colormap(stops) {
  let px = new Uint8Array(1024), k = stops.length - 1, lab = stops.map(s => [...oklab(s).map(v => v * s[3]), s[3]])
  for (let i = 0; i < 256; i++) {
    let t = i / 255 * k, j = Math.min(Math.floor(t), k - 1), f = t - j
    let [L, a, b, al] = lab[j].map((v, n) => v + f * (lab[j + 1][n] - v)), rgb = al ? srgb([L / al, a / al, b / al]) : [0, 0, 0]
    px.set([...rgb.map(v => v * al), al].map(v => Math.round(v * 255)), i * 4)
  }
  return px
}

// CSS color → [r, g, b, a] 0..1 in the context's color space; arrays pass through
const ctx2d = {}
function rgba(c, gl) {
  if (typeof c !== 'string') return nums([c?.[0], c?.[1], c?.[2], c?.[3] ?? 1], 4, 'color').map(v => Math.min(Math.max(v, 0), 1))
  let space = gl.drawingBufferColorSpace || 'srgb'
  let ctx = ctx2d[space] ??= (globalThis.OffscreenCanvas ? new OffscreenCanvas(1, 1) : document.createElement('canvas')).getContext('2d', { colorSpace: space, willReadFrequently: true })
  ctx.fillStyle = '#000'; ctx.fillStyle = c
  if (ctx.fillStyle === '#000000') { ctx.fillStyle = '#fff'; ctx.fillStyle = c; if (ctx.fillStyle === '#ffffff') throw TypeError(`gl-spectrum: invalid color ${c}`) }
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  let d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255]
}
