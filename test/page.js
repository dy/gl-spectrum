// Browser side of the tests: a brute-force reference for pick(), and pixel probes over gl.readPixels
import Spectrum, { scales } from '../index.js'

// Seeded PRNG (mulberry32), so failures reproduce
export const random = seed => () => {
  seed = seed + 0x6D2B79F5 | 0
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
  return ((t ^ t >>> 14) >>> 0) / 4294967296
}

export function canvas(w, h) {
  let c = document.createElement('canvas')
  c.width = w; c.height = h
  document.body.append(c)
  return c
}

export function read(gl) {
  let w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, raw = new Uint8Array(w * h * 4), img = new Uint8Array(w * h * 4)
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw)
  for (let y = 0; y < h; y++) img.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4)
  return { w, h, img, a: (x, y) => img[4 * (y * w + x) + 3], px: (x, y) => [...img.subarray(4 * (y * w + x), 4 * (y * w + x) + 4)] }
}

// Covered rows (alpha > 0) of column x: [top, bottom] or null
const span = (p, x, y0 = 0, y1 = p.h) => {
  let top = -1, bot = -1
  for (let y = y0; y < y1; y++) if (p.a(x, y)) { if (top < 0) top = y; bot = y }
  return top < 0 ? null : [top, bot]
}
const ink = (p, x0 = 0, x1 = p.w, y0 = 0, y1 = p.h) => { let s = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += p.a(x, y) > 0; return s }

// ── columns ─────────────────────────────────────────────────────────────

// What pick() promises for device column c of a W px wide view: bin b sits at x = W · scales[scale].at(b · df, low, high),
// df = sampleRate / 2 / bins (bin 0 left out on a log scale); the column holds the bins with c ≤ x < c + 1 and shows the
// loudest, the first of equals, NaN left out; a column without bins shows the bin nearest its center, x = c + 0.5.
export function reference(d, rate, scale, [lo, hi], W) {
  let n = d.length, df = rate / 2 / n, first = scale === 'log' ? 1 : 0, xs = new Float64Array(n), cols = Array.from({ length: W }, () => [])
  for (let b = first; b < n; b++) {
    let x = xs[b] = scales[scale].at(b * df, lo, hi) * W
    if (x >= 0 && x < W) cols[Math.floor(x)].push(b)
  }
  return cols.map((inside, c) => {
    let bin = -1
    if (inside.length) for (let b of inside) { if (d[b] === d[b] && (bin < 0 || d[b] > d[bin])) bin = b }
    else {
      let dist = Infinity
      for (let b = first; b < n; b++) { let e = Math.abs(xs[b] - (c + .5)); if (e < dist) dist = e, bin = b }
      if (bin >= 0 && d[bin] !== d[bin]) bin = -1
    }
    return bin < 0 ? null : { bin, frequency: bin * df, level: d[bin] }
  })
}

// dB per bin: -100..0 noise with peaks, NaN runs, ±Infinity
export function bins(n, r, { nan = 0, inf = 0 } = {}) {
  let d = Float32Array.from({ length: n }, () => -100 * r() ** 2)
  for (let i = 0; i < n / 50; i++) d[Math.floor(r() * n)] = r() * 10
  for (let i = 0; i < nan; i++) { let a = Math.floor(r() * n); d.fill(NaN, a, a + Math.floor(r() * n / 20) + 1) }
  for (let i = 0; i < inf; i++) d[Math.floor(r() * n)] = r() < .5 ? Infinity : -Infinity
  return d
}

export function columns({ seed, n, W, pr, nan, inf, x0 = 0 }) {
  let r = random(seed), d = bins(n, r, { nan, inf }), rate = [8000, 44100, 48000, 96000][Math.floor(r() * 4)]
  let c = canvas(Math.ceil((x0 + W + 5) / pr), 20), bad = [], cols = 0
  let sp = new Spectrum(c, { data: d, sampleRate: rate, pixelRatio: pr, viewport: [x0 / pr, 0, W / pr, 10] })
  for (let scale of ['log', 'mel', 'erb', 'lin']) for (let k = 0; k < 4; k++) {
    let low = scales[scale].low, nyq = rate / 2
    let band = k === 0 ? null : k === 1 ? [low + (nyq - low) * r() * .1 + (scale === 'log' ? 0 : 1), nyq * (.2 + r() * .7)] : k === 2 ? [Math.max(low, 1) * (1 + r() * 3), nyq * 1.3] : [nyq * .4, nyq * .4 + nyq * r() * .01 + 1]
    sp.update({ scale, band })
    let w = Math.round(x0 + W) - Math.round(x0), want = reference(d, rate, scale, sp.band, w)
    for (let col = 0; col < w; col++) {
      let got = sp.pick((col + .5) / pr)
      cols++
      if (JSON.stringify(got) !== JSON.stringify(want[col])) bad.push({ scale, band: sp.band, col, got, want: want[col] })
    }
  }
  sp.destroy(); c.remove()
  return { cols, nbad: bad.length, bad: bad.slice(0, 3) }
}

// ── pixels ──────────────────────────────────────────────────────────────

// One bin at 0 dB among 65536 at the floor, a log axis 640 px wide: its column reaches the top
export function peak() {
  let n = 65536, d = new Float32Array(n).fill(-100), at = 40000
  d[at] = 0
  let sp = new Spectrum(canvas(640, 100), { data: d, sampleRate: 48000, pixelRatio: 1, fill: false })
  sp.render()
  let p = read(sp.gl), col = -1, others = 0
  for (let x = 0; x < 640; x++) if (span(p, x)?.[0] === 0) col = x
  for (let x = 0; x < 640; x++) if (Math.abs(x - col) > 1 && span(p, x)?.[0] < 98) others++ // the line down from the peak crosses its neighbours
  let res = { col, pick: col >= 0 ? sp.pick(col + .5) : null, others }
  sp.canvas.remove()
  return res
}

// 8 bins 100 px apart on a linear axis at -50 dB, levels -100..0, 101 px high: a flat line on row 50, a dot at each bin
export function line() {
  let d = new Float32Array(8).fill(-50), c = canvas(800, 101)
  let sp = new Spectrum(c, { data: d, sampleRate: 16, scale: 'lin', band: [0, 8], pixelRatio: 1, fill: false, thickness: 1 })
  sp.render()
  let p = read(sp.gl), rows = new Set(), dots = 0, prev = false
  for (let x = 0; x < 700; x++) { let s = span(p, x); if (s) for (let y = s[0]; y <= s[1]; y++) rows.add(y) }
  for (let x = 0; x < 800; x++) { let on = p.a(x, 48) > 0; if (on && !prev) dots++; prev = on }
  let res = { rows: [...rows].sort((a, b) => a - b), dots, after: span(p, 760) }
  c.remove()
  return res
}

// A flat spectrum at -50 dB, 101 px high, aligned to the bottom, the middle and the top
export function align() {
  let d = new Float32Array(512).fill(-50), c = canvas(200, 101), out = {}
  let sp = new Spectrum(c, { data: d, sampleRate: 48000, pixelRatio: 1, scale: 'lin', color: [0, 0, 0, 0], fill: [1, 1, 1, 1] })
  for (let align of [0, .5, 1]) {
    sp.clear().update({ align }).render()
    out[align] = span(read(sp.gl), 100)
  }
  c.remove()
  return out
}

// A fill colormap from red at the floor to blue at the top, under a spectrum at the top
export function colormap() {
  let c = canvas(100, 256), sp = new Spectrum(c, { data: new Float32Array(64), sampleRate: 48000, scale: 'lin', pixelRatio: 1, color: [0, 0, 0, 0], fill: ['#f00', '#00f'] })
  sp.render()
  let p = read(sp.gl), low = p.px(50, 252), high = p.px(50, 3), mid = p.px(50, 128)
  sp.clear().update({ fill: null, color: [1, .5, 0, 1] }).render()
  let tint = read(sp.gl).px(50, 128)
  sp.clear().update({ fill: false }).render()
  let none = read(sp.gl).px(50, 128)
  c.remove()
  return { low, high, mid, tint, none }
}

export function transparent() {
  let d = Float32Array.from({ length: 1024 }, (_, i) => -30 - 40 * Math.abs(Math.sin(i / 30)))
  let sp = new Spectrum(canvas(400, 100), { data: d, sampleRate: 48000, pixelRatio: 1, color: [1, .5, 0, 1], fill: [.2, .4, 1, .5] })
  sp.render()
  let p = read(sp.gl), notPremul = 0, above = 0
  for (let y = 0; y < 100; y++) for (let x = 0; x < 400; x++) {
    let [R, G, B, A] = p.px(x, y)
    if (R > A || G > A || B > A) notPremul++
    if (y < 20) above += A > 0 // nothing is louder than -30 dB: 30 % from the top
  }
  let res = { notPremul, above, total: ink(p) }
  sp.canvas.remove()
  return res
}

// NaN bins are a gap; -Infinity is the floor, +Infinity the top
export function gaps() {
  let d = new Float32Array(400).fill(-50)
  d.fill(NaN, 100, 200); d[300] = Infinity; d.fill(-Infinity, 340, 360)
  let sp = new Spectrum(canvas(400, 101), { data: d, sampleRate: 800, scale: 'lin', band: [0, 400], pixelRatio: 1 })
  sp.render()
  let p = read(sp.gl), inGap = ink(p, 103, 197)
  let res = { inGap, gapPick: sp.pick(150.5), up: span(p, 300), down: span(p, 350), upPick: sp.pick(300.5), beside: span(p, 250) }
  sp.canvas.remove()
  return res
}

export function lanes() {
  let c = canvas(300, 200), r = random(7), gl = c.getContext('webgl2', { preserveDrawingBuffer: true }), programs = 0, create = gl.createProgram
  gl.createProgram = () => (programs++, create.call(gl))
  let a = new Spectrum(c, { pixelRatio: 1, viewport: [0, 0, 300, 100], data: bins(4096, r), thickness: 4, levels: [-200, 100] })
  let b = new Spectrum(a.gl, { pixelRatio: 1, viewport: [0, 100, 300, 100], data: bins(4096, r), thickness: 4, align: .5 })
  let eq = (p, q, y0, y1) => p.img.subarray(y0 * 1200, y1 * 1200).every((v, i) => v === q.img[y0 * 1200 + i])
  a.render()
  let p1 = read(a.gl)
  b.render()
  let p2 = read(a.gl)
  a.clear()
  let p3 = read(a.gl)
  let res = {
    aInk: ink(p1, 0, 300, 0, 100), bleedA: ink(p1, 0, 300, 100, 200), bInk: ink(p2, 0, 300, 100, 200),
    aKept: eq(p1, p2, 0, 100), aCleared: ink(p3, 0, 300, 0, 100), bKept: eq(p2, p3, 100, 200), programs
  }
  c.remove()
  return res
}

// The array given as data is read at render: refilled in place, the next render draws it
export function live() {
  let d = new Float32Array(256).fill(-100), sp = new Spectrum(canvas(200, 100), { data: d, sampleRate: 48000, pixelRatio: 1, scale: 'lin' })
  sp.render()
  let before = span(read(sp.gl), 100)
  d.fill(-20)
  sp.clear().render()
  let after = span(read(sp.gl), 100)
  sp.canvas.remove()
  return { before, after }
}

export function resize() {
  let c = canvas(200, 50), sp = new Spectrum(c, { pixelRatio: 1, data: new Float32Array(2000).fill(-40), sampleRate: 48000 })
  let right = () => { let p = read(sp.gl); return ink(p, p.w / 2, p.w) }
  sp.render()
  let before = right()
  c.width = 400
  sp.render()
  let after = right()
  c.remove()
  return { before, after }
}

export function colors() {
  let sp = new Spectrum(canvas(20, 20), { pixelRatio: 1, data: new Float32Array(100).fill(-50), scale: 'lin', thickness: 20, fill: false }), out = {}
  for (let color of ['oklch(0.7 0.15 250)', 'rebeccapurple', '#0f08']) {
    sp.clear().update({ color }).render()
    let ctx = document.createElement('canvas').getContext('2d')
    ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
    let [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    out[color] = { gl: read(sp.gl).px(10, 10), css: [r * a / 255, g * a / 255, b * a / 255, a].map(Math.round) }
  }
  try { sp.update({ color: 'not-a-color' }); out.invalid = 'accepted' } catch (e) { out.invalid = e.message }
  sp.canvas.remove()
  return out
}

export async function lose() {
  let c = canvas(200, 50), sp = new Spectrum(c, { pixelRatio: 1, data: Float32Array.from({ length: 1000 }, (_, i) => -50 + 20 * Math.sin(i / 9)) })
  let ext = sp.gl.getExtension('WEBGL_lose_context'), errors = []
  sp.render()
  let on = type => new Promise((res, rej) => { c.addEventListener(type, res, { once: true }); setTimeout(() => rej(Error(type + ' never fired')), 5000) })
  let lost = on('webglcontextlost')
  ext.loseContext()
  await lost
  await new Promise(res => setTimeout(res)) // restoring is allowed once the lost event has been fully dispatched
  for (let call of [() => sp.update({ band: [100, 1000], fill: ['red', 'blue'] }), () => sp.render(), () => sp.clear(), () => sp.pick(10)])
    try { call() } catch (e) { errors.push(e.message) }
  let restored = on('webglcontextrestored')
  ext.restoreContext()
  await restored
  await new Promise(res => setTimeout(res))
  let p = read(sp.gl)
  c.remove()
  return { errors, ink: ink(p) }
}

export function api() {
  let out = { errors: {} }, c2d = canvas(10, 10)
  c2d.getContext('2d')
  try { new Spectrum(c2d); out.ctor = 'accepted' } catch (e) { out.ctor = e.name }
  let sp = new Spectrum(canvas(100, 20), { pixelRatio: 1 })
  for (let o of [{ band: [0, NaN] }, { levels: 1 }, { viewport: [0, 0, 10] }, { thickness: 'x' }, { pixelRatio: 0 }, { sampleRate: -1 }, { scale: 'bark' }, { fill: ['red'] }, { align: 'x' }])
    try { sp.update(o); out.errors[Object.keys(o)[0]] = 'accepted' } catch (e) { out.errors[Object.keys(o)[0]] = e.name }
  for (let o of [{ band: [0, 100] }, { band: [200, 100] }, { levels: [0, -10] }, { align: 2 }])
    try { sp.update(o); out.errors[JSON.stringify(o)] = 'accepted' } catch (e) { out.errors[JSON.stringify(o)] = e.name } finally { sp.update({ band: null, levels: null, align: null }) }
  out.empty = [sp.length, sp.pick(50), sp.render() === sp]
  sp.update({ data: [-10, -20, -30, -40], sampleRate: 8000 })
  out.converted = [sp.length, sp.band, sp.levels]
  sp.update({ scale: 'lin', band: [100, 3000], levels: [-60, 6] })
  out.getters = [sp.band, sp.levels]
  sp.update({ band: null, levels: null })
  out.defaults = [sp.band, sp.levels]
  let d = new Float32Array(4)
  sp.update({ data: d })
  d[1] = -7
  out.referenced = sp.pick(37.5)
  sp.destroy()
  sp.render()
  out.afterDestroy = [sp.length, ink(read(sp.gl))]
  sp.canvas.remove(); c2d.remove()
  return out
}
