// The v3 demo (gl-spectrum 3.2, 2016–2017: git show 8b01874:test.js) on the v4 renderer, to compare the two.
// v3 drew, smoothed, weighted and colored inside the component; here the page does all but the drawing.
import Spectrum, { scales } from '../index.js'
import { recordings, streams } from './sources.js'

const $ = id => document.getElementById(id)

// The libraries v3 used, from esm.sh; if one fails to load, the page goes on without it or with a stand-in
const esm = (name, fallback) => import(`https://esm.sh/${name}`).then(m => m.default ?? m, () => fallback)
const [nice, colormap, colorScale, tinycolor, weights, createFps] = await Promise.all([
  // the first readable ones stand in for all
  esm('nice-color-palettes@1.0.1', [['#ecd078', '#d95b43', '#c02942', '#542437', '#53777a'], ['#774f38', '#e08e79', '#f1d4af', '#ece5ce', '#c5e0dc'], ['#e8ddcb', '#cdb380', '#036564', '#033649', '#031634'], ['#490a3d', '#bd1550', '#e97f02', '#f8ca00', '#8a9b0f']]),
  esm('colormap@2.3.2'), esm('colormap@2.3.2/colorScale.js', {}), esm('tinycolor2@1.6.0'),
  esm('a-weighting@2.0.1', { z: () => 1 }), esm('fps-indicator@1.3.0')
])

// v3 defaults (core.js) and its demo's analyser (test.js)
const SMOOTHING = .5, TRAIL_ALPHA = .33, BALANCE = .5, LEVELS = 32, BAND = [20, 20000], FFT = 4096
// settings-panel/theme/typer
const THEME = { palette: ['black', 'white'], active: '#24D4C0' }

// ── colors: [r, g, b] 0..255 with a 0..1 ────────────────────────────────────

const probe = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
function parse(c) {
  probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#0000'; probe.fillStyle = c; probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  return a ? [r * 255 / a, g * 255 / a, b * 255 / a, a / 255] : [0, 0, 0, 0]
}
const css = ([r, g, b, a = 1]) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${+a.toFixed(3)})`
const alpha = (c, a) => [c[0], c[1], c[2], c[3] * a]
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
// color-interpolate: stops evenly over 0..1, mixed in sRGB
const ramp = stops => t => {
  if (stops.length < 2) return stops[0]
  const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1), i = Math.min(Math.floor(x), stops.length - 2)
  return mix(stops[i], stops[i + 1], x - i)
}
// WCAG 2 relative luminance and contrast
const lum = c => c.slice(0, 3).map(v => (v /= 255) <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0)
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)
const readable = tinycolor ? (a, b) => tinycolor.isReadable(a, b, { level: 'AA', size: 'large' }) : (a, b) => contrast(parse(a), parse(b)) >= 3

// v3's palettes: nice-color-palettes and every colormap scale at 16 shades, kept where the first and last colors read as large text
let palettes = [...nice]
if (colormap) for (const name in colorScale) {
  if (['alpha', 'hsv', 'rainbow', 'rainbow-soft', 'phase'].includes(name)) continue
  try { palettes.push(colormap({ colormap: colorScale[name], nshades: 16, format: 'rgbaString' })) } catch {}
}
palettes = palettes.filter(p => readable(p[0], p.at(-1)))

// ── renderer ──────────────────────────────────────────────────────────────

const canvas = $('spectrum'), grid = $('grid').getContext('2d')
const sp = new Spectrum(canvas, { align: .5, band: BAND }), hold = new Spectrum(sp.gl, { align: .5, band: BAND, fill: false })
let n = FFT / 2, rate = 44100, mags = new Float32Array(n), top = new Float32Array(n), db = new Float32Array(n), held = new Float32Array(n)
let curve = new Float32Array(n), cols = new Float32Array(n)
let look = {}, flat = true, w = 0, h = 0, pr = 0
const lut = Array.from({ length: LEVELS }, () => [0, 0, 0, 1])

// v3 mapped 0 dB to a quarter of the height from the middle: the mirrored spectrum fills the middle half
function fit() {
  const W = innerWidth, H = innerHeight, R = devicePixelRatio
  if (W === w && H === h && R === pr) return
  w = W; h = H; pr = R
  for (const c of [canvas, grid.canvas]) { c.width = Math.round(w * pr); c.height = Math.round(h * pr) }
  for (const s of [sp, hold]) s.update({ viewport: [0, h / 4, w, h / 2], thickness: 1 / pr }) // v3's lines were a device pixel
  rule()
}

// The share of the axis each bin spans: v3 colored each column by its own height, so a level's color is the mean over the columns that reach it
function columns() {
  const S = scales[look.scale], [lo, hi] = BAND, df = rate / 2 / n, at = f => f <= lo ? 0 : f >= hi ? 1 : S.at(f, lo, hi)
  for (let i = 0; i < n; i++) cols[i] = at((i + .5) * df) - at((i - .5) * df)
}

// v3's fragment shader, per level: intensity = balance · ((d/peak + d)/2 + 1/2)^.8888 + (1 - balance) · (column/peak)²,
// d the distance from the middle (a quarter at 0 dB), the column term averaged over the columns reaching that level
function shade(peak) {
  const p = peak || 1e-6, sum = new Float64Array(LEVELS), weight = new Float64Array(LEVELS)
  for (let i = 0; i < n; i++) if (cols[i] > 0) {
    const b = Math.min(LEVELS - 1, Math.floor(mags[i] * (LEVELS - 1)))
    sum[b] += cols[i] * (mags[i] / p) ** 2; weight[b] += cols[i]
  }
  for (let j = LEVELS - 1, s = 0, k = 0; j >= 0; j--) {
    s += sum[j]; k += weight[j]
    const l = j / (LEVELS - 1), d = l / 4, column = k ? s / k : (l / p) ** 2
    const t = BALANCE * ((d / p + d) * .5 + .5) ** .8888 + (1 - BALANCE) * column
    const c = look.color(Math.min(Math.max(t, .5 / LEVELS), 1 - .5 / LEVELS)) // the middle of v3's 32 texels at the ends
    lut[j][0] = c[0] / 255; lut[j][1] = c[1] / 255; lut[j][2] = c[2] / 255; lut[j][3] = c[3]
  }
  return lut
}

// v3's types: 'fill' is the colormap under a hidden line, 'line' the line alone. Its 'bar' (a 2 px bar per bin) has no
// v4 counterpart: v4 draws the loudest bin per pixel column with straight lines between sparse bins, never a bar per bin
function paint() {
  const fill = $('type').value === 'fill'
  sp.update({ fill: fill && flat && look.color(1).map((v, i) => i < 3 ? v / 255 : v), color: fill ? [0, 0, 0, 0] : css(look.color(1)) })
  hold.update({ color: css(alpha(look.color(.5), TRAIL_ALPHA)) })
}

// ── settings ──────────────────────────────────────────────────────────────

// typer's tones: its palette from text (0) to panel (1)
function theme(stops) {
  const tone = ramp(stops), byLum = stops.toSorted((a, b) => lum(a) - lum(b))
  const light = mix([255, 255, 255, 1], byLum.at(-1), .25), shade = mix([0, 0, 0, 1], byLum[0], .25)
  const inversed = lum(stops[0]) > lum(stops.at(-1)), bg = tone(.9), fg = tone(.08)
  const panel = $('panel').style, set = (k, c) => panel.setProperty(k, css(c))
  set('--t0', tone(0)); set('--t08', fg); set('--t25', tone(.25)); set('--t9', bg)
  set('--sel', tone(.855)); set('--sel-hi', tone(.855 + (inversed ? -.07 : .07))); set('--box', tone(.915)); set('--box-on', tone(.93))
  set('--light', light); set('--shade', shade); set('--link', alpha(tone(0), .1))
  panel.setProperty('--ts', lum(fg) > lum(bg) ? `0 -1px ${css(mix(bg, shade, .5))}` : `0 1px ${css(mix(bg, light, .5))}`)
  panel.setProperty('--check', `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${css(fg)}" stroke="${css(fg)}" stroke-width="1.2" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`)}")`)
}

// v3's setColors: the page takes the palette's last color, the spectrum runs from it to the first
let fps
function setColors(palette, active) {
  const rgb = palette.map(parse)
  flat = rgb.length < 2
  look.color = ramp(rgb.toReversed())
  const bg = flat ? [255, 255, 255, 1] : look.color(0), ink = css(rgb[0])
  document.body.style.setProperty('--bg', css(bg))
  document.body.style.setProperty('--fg', ink)
  $('panel').style.backgroundColor = css(alpha(bg, .5))
  $('panel').style.boxShadow = `0 0 0 2px ${css(alpha(look.color(.5), .1))}`
  if (!flat) theme(rgb)
  if (fps) fps.element.style.color = ink
  $('swatch').replaceChildren(...[active, ...palette].filter(Boolean).slice(0, 3).map(c => Object.assign(document.createElement('span'), { style: `background: ${c}` })))
  paint(); rule()
}

$('swatch').onclick = () => {
  let palette = palettes[Math.floor((palettes.length - 1) * Math.random())]
  if (Math.random() > .5) palette = palette.toReversed()
  setColors(palette)
}
$('type').onchange = paint
$('log').onchange = () => { look.scale = $('log').checked ? 'log' : 'lin'; for (const s of [sp, hold]) s.update({ scale: look.scale }); columns(); rule() }
$('grid-on').onchange = rule
// weighting in dB, as 3.2.6; 'itu' (ITU-R 468) is a-weighting's 'm' now. A new curve restarts the trail, as in v3
function weigh() {
  const f = weights[$('weighting').value === 'itu' ? 'm' : $('weighting').value] ?? weights.z, df = rate / 2 / n
  for (let i = 0; i < n; i++) curve[i] = 20 * Math.log10(f(i * df))
  top.fill(0)
}
for (const o of $('weighting').options) o.disabled = !weights[o.value === 'itu' ? 'm' : o.value]
$('weighting').onchange = weigh
$('trail').onchange = () => top.fill(0)

// ── plot-grid ─────────────────────────────────────────────────────────────

// pretty-number: thousands apart by a narrow space
const pretty = v => String(Math.round(v)).replace(/\B(?=(\d{3})+$)/g, ' ')
// Log: every 1..9 of a decade, decades heavier, labels on 1, 2, 5 where they fit. Lin: a 1-2-5 step 50 px or more, labels on every second or fifth line
function lines() {
  const [lo, hi] = BAND, out = []
  if (look.scale === 'log') {
    const decade = w / Math.log10(hi / lo), marks = decade * Math.log10(2) >= 60 ? [1, 2, 5] : [1]
    for (let d = 10 ** Math.floor(Math.log10(lo)); d <= hi; d *= 10)
      for (let m = 1; m < 10; m++) if (m * d >= lo && m * d <= hi) out.push({ f: m * d, major: m === 1, label: marks.includes(m) })
    return out
  }
  const px = w / (hi - lo), nice = s => [1, 2, 5].map(m => m * 10 ** Math.floor(Math.log10(s))).concat(10 ** Math.ceil(Math.log10(s)))
  const step = nice(50 / px).find(s => s * px >= 50), every = [2, 5, 10].find(k => k * step * px >= 100), major = 10 ** (Math.floor(Math.log10(step)) + 1)
  for (let f = 0; f <= hi; f += step) out.push({ f, major: f % major === 0, label: Math.round(f / step) % every === 0 })
  return out
}
// Over the spectrum, as v3 drew it: lines and ticks a device pixel wide, labels at the bottom
function rule() {
  grid.setTransform(1, 0, 0, 1, 0, 0); grid.clearRect(0, 0, grid.canvas.width, grid.canvas.height)
  if (!$('grid-on').checked || !look.color || !w) return
  const S = scales[look.scale], [lo, hi] = BAND, ink = look.color(.75), H = grid.canvas.height
  grid.font = `${10 * pr}px ${getComputedStyle(document.body).fontFamily}`; grid.textBaseline = 'bottom'
  for (const { f, major, label } of lines()) {
    const x = Math.round(S.at(Math.max(f, 1e-9), lo, hi) * w * pr)
    grid.fillStyle = css(alpha(ink, major ? .3 : .1)); grid.fillRect(x, 0, 1, H)
    if (!label) continue
    grid.fillStyle = css(ink); grid.fillRect(x, H - 4 * pr, 1, 4 * pr)
    grid.fillText(pretty(f), x + 3.5 * pr, H)
  }
}

// ── app-audio ─────────────────────────────────────────────────────────────

const items = { mic: { id: 'mic', name: 'Microphone' } }
for (const [title, list] of [['Recordings', recordings], ['Radio', streams]]) {
  const ul = document.createElement('ul')
  ul.dataset.title = title
  for (const it of list) {
    items[it.id] = { ...it, live: list === streams }
    const b = Object.assign(document.createElement('button'), { className: 'aa-item', textContent: it.name, title: it.name })
    b.dataset.id = it.id
    ul.append(document.createElement('li')); ul.lastChild.append(b)
  }
  $('sources').append(ul)
}

let ctx, analyser, out, raw, node, el, mic, task = 0, current = items.cello
const PLAY = $('play-icon').getAttribute('d'), PAUSE = 'M250 240h110v544h-110zM459 240h110v544h-110z'
function show(it, error) {
  $('title').textContent = error ? `Error: ${error}` : it.name
  $('source').classList.toggle('aa-error', !!error)
  const credit = it.credit ? `${it.credit}, ${it.license}` : it.page ? new URL(it.page).hostname : ''
  Object.assign($('credit'), { textContent: credit, href: it.page ?? '' }).hidden = !credit
}
function state(playing) {
  $('play-icon').setAttribute('d', playing ? PAUSE : PLAY)
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play')
}
function stop() {
  node?.disconnect(); node = null
  if (el) { el.pause(); if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); el.removeAttribute('src'); el.load(); el = null }
  mic?.getTracks().forEach(t => t.stop()); mic = null
  state(false)
}
// v3's analyser: no smoothing of its own, -100..0 dB, read every frame
async function start(it) {
  const my = ++task
  stop(); current = it; show(it); $('source').open = false
  if (!ctx) {
    ctx = new AudioContext(); rate = ctx.sampleRate
    analyser = Object.assign(ctx.createAnalyser(), { fftSize: FFT, smoothingTimeConstant: 0, minDecibels: -100, maxDecibels: 0 })
    raw = new Float32Array(analyser.frequencyBinCount)
    out = ctx.createGain(); analyser.connect(out).connect(ctx.destination)
    for (const s of [sp, hold]) s.update({ sampleRate: rate })
    sp.update({ data: db }); hold.update({ data: held }); columns(); weigh()
  }
  try {
    await ctx.resume()
    if (it.id === 'mic') {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      if (my !== task) return media.getTracks().forEach(t => t.stop())
      mic = media; node = ctx.createMediaStreamSource(mic); out.gain.value = 0 // heard, the microphone would feed back
    } else {
      el = Object.assign(new Audio(), { crossOrigin: 'anonymous', loop: !it.live, src: it.url, onplaying: () => state(true), onpause: () => state(false) })
      node = ctx.createMediaElementSource(el); out.gain.value = 1
      await el.play()
    }
    if (my !== task) return
    node.connect(analyser); state(true)
  } catch (e) {
    if (my === task) { stop(); show(it, e.message) }
  }
}
$('sources').onclick = e => { const b = e.target.closest('[data-id]'); if (b) start(items[b.dataset.id]) }
$('open').onclick = () => $('file').click()
$('file').onchange = () => {
  const f = $('file').files[0]
  if (f) start({ id: 'file', name: f.name, url: URL.createObjectURL(f) })
  $('file').value = ''
}
$('play').onclick = () => {
  if (!node) return start(current)
  if (el) el.paused ? el.play().catch(e => show(current, e.message)) : el.pause()
  else stop()
}
addEventListener('click', e => { if (!$('source').contains(e.target)) $('source').open = false })

// ── frame ─────────────────────────────────────────────────────────────────

// v3's set(): weight in dB, clamp to -100..0, bring to 0..1, smooth; the trail holds the maximum
function frame() {
  requestAnimationFrame(frame)
  fit()
  sp.clear()
  if (!raw) return
  analyser.getFloatFrequencyData(raw)
  let peak = 0
  for (let i = 0; i < n; i++) {
    const v = .01 * (Math.min(Math.max(raw[i] + curve[i], -100), 0) + 100)
    if (v > peak) peak = v
    mags[i] = v * (1 - SMOOTHING) + mags[i] * SMOOTHING
    if (mags[i] > top[i]) top[i] = mags[i]
    db[i] = mags[i] * 100 - 100; held[i] = top[i] * 100 - 100
  }
  if ($('type').value === 'fill' && !flat) sp.update({ fill: shade(peak) })
  sp.render()
  if ($('trail').checked) hold.render()
  $('progress').style.width = el && isFinite(el.duration) ? `${el.currentTime / el.duration * 100}%` : '0'
}

look.scale = 'log'
if (createFps) fps = createFps({ position: 'top-right', css: { fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontSize: '12px', padding: 0, marginTop: '1rem', marginRight: '1rem' } })
theme(THEME.palette.map(parse))
setColors(['black'], THEME.active)
show(current)
fit()
document.fonts?.ready.then(rule)
requestAnimationFrame(frame)
