// gl-spectrum's demo: the v3 page (2016–2017, git show 8b01874:test.js) on the v4 renderer, with its scales, align,
// FFT size and smoothing in the settings, and the band zoomed by wheel or pinch and dragged
import Spectrum, { scales } from '../index.js'
import { $, clamp, css, unit, alpha, palette, picker, sound, gestures, rules, pretty } from './app.js'

const weights = await import('https://esm.sh/a-weighting@2.0.1').then(m => m.default ?? m, () => ({ z: () => 1 }))

// v3's look (core.js): the trail's alpha, the balance of its coloring, its 32 levels
const TRAIL = .33, BALANCE = .5, LEVELS = 32

const canvas = $('chart'), sp = new Spectrum(canvas), hold = new Spectrum(sp.gl, { fill: false })
let rate = 44100, n = 0, raw, mags, top, db, held, curve, cols
let look = null, band = [20, 20000], scale = 'log', w = 0, h = 0, pr = 0
const lut = Array.from({ length: LEVELS }, () => [0, 0, 0, 1])
const nyquist = () => rate / 2

const ui = picker(start)
const audio = sound({ fftSize: +$('fft').value, loop: true, state: on => { ui.playing(on); if (on) $('hint').hidden = true } })

// ── view ──────────────────────────────────────────────────────────────────

// v3 put the mirrored spectrum in the middle half; bottom and top alignments take the rest above the labels
function layout() {
  w = innerWidth; h = innerHeight; pr = devicePixelRatio
  for (const c of [canvas, $('grid')]) { c.width = Math.round(w * pr); c.height = Math.round(h * pr) }
  const a = +$('align').value, viewport = a === .5 ? [0, h / 4, w, h / 2] : a < .5 ? [0, h / 4, w, h * 3 / 4 - 24] : [0, 48, w, h * 3 / 4 - 48]
  for (const s of [sp, hold]) s.update({ viewport, align: a, thickness: 1 / pr }) // v3's lines were a device pixel
  rule()
}

function setBand(lo, hi) {
  const low = scales[scale].low
  band = [clamp(lo, low, nyquist() - 1), clamp(hi, low + 1, nyquist())]
  for (const s of [sp, hold]) s.update({ band, scale })
  columns(); rule()
}
// zoom and drag in the scale's own units, so the frequency under the pointer stays put
function view(fn) {
  const S = scales[scale], lo = S.low, hi = nyquist(), [a, b] = band.map(f => S.at(f, lo, hi))
  let [start, span] = fn(a, b)
  span = clamp(span, 1 / 512, 1); start = clamp(start, 0, 1 - span)
  setBand(S.of(start, lo, hi), S.of(start + span, lo, hi))
}
gestures(canvas, {
  zoom: (x, y, k) => view((a, b) => { const u = clamp(x / w, 0, 1), m = a + u * (b - a), s = (b - a) * k; return [m - u * s, s] }),
  pan: dx => view((a, b) => [a - dx / w * (b - a), b - a]),
  fit: () => setBand(scales[scale].low, Math.min(20000, nyquist()))
})

// ── data ──────────────────────────────────────────────────────────────────

// Bins of the analyser's FFT size: its levels, smoothed, held and drawn as dB
function bins() {
  const an = audio.analyser
  if (!an || an.frequencyBinCount === n) return
  n = an.frequencyBinCount
  raw = new Float32Array(n); mags = new Float32Array(n); top = new Float32Array(n); db = new Float32Array(n); held = new Float32Array(n)
  curve = new Float32Array(n); cols = new Float32Array(n)
  sp.update({ data: db, sampleRate: rate }); hold.update({ data: held, sampleRate: rate })
  weigh(); columns()
}
// weighting in dB, as 3.2.6; 'itu' (ITU-R 468) is a-weighting's 'm' now. A new curve restarts the trail, as in v3
function weigh() {
  if (!n) return
  const f = weights[$('weighting').value === 'itu' ? 'm' : $('weighting').value] ?? weights.z, df = rate / 2 / n
  for (let i = 0; i < n; i++) curve[i] = 20 * Math.log10(f(i * df))
  top.fill(0)
}
for (const o of $('weighting').options) o.disabled = !weights[o.value === 'itu' ? 'm' : o.value]

// The share of the axis each bin spans: v3 colored each column by its own height, so a level's color is the mean over the columns that reach it
function columns() {
  if (!n) return
  const S = scales[scale], [lo, hi] = band, df = rate / 2 / n, at = f => f <= lo ? 0 : f >= hi ? 1 : S.at(f, lo, hi)
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
    const c = look.color(clamp(t, .5 / LEVELS, 1 - .5 / LEVELS)) // the middle of v3's 32 texels at the ends
    lut[j][0] = c[0] / 255; lut[j][1] = c[1] / 255; lut[j][2] = c[2] / 255; lut[j][3] = c[3]
  }
  return lut
}

// ── look ──────────────────────────────────────────────────────────────────

// v3's types: 'fill' is the colormap under a hidden line, 'line' the line alone. Its 'bar' (a 2 px bar per bin) has no
// v4 counterpart: v4 draws the loudest bin per pixel column with straight lines between sparse bins, never a bar per bin
function paint() {
  const fill = $('type').value === 'fill'
  sp.update({ fill: fill && look.flat && unit(look.color(1)), color: fill ? [0, 0, 0, 0] : css(look.color(1)) })
  hold.update({ color: css(alpha(look.color(.5), TRAIL)) })
}
palette(l => { look = l; paint(); rule() })
$('type').onchange = paint
$('scale').onchange = () => { scale = $('scale').value; setBand(Math.max(band[0], scales[scale].low), band[1]) }
$('align').onchange = layout
$('fft').onchange = () => { if (audio.analyser) audio.analyser.fftSize = +$('fft').value }
$('smoothing').oninput = () => { $('smoothing-value').value = $('smoothing').value }
$('grid-on').onchange = rule
$('weighting').onchange = weigh
$('trail').onchange = () => top?.fill(0)
addEventListener('resize', layout)

// plot-grid over the spectrum: lines a device pixel wide, labels along the bottom
function rule() {
  const { g, px } = rules($('grid'))
  if (!$('grid-on').checked || !look || !w) return
  const S = scales[scale], [lo, hi] = band, ink = look.color(.75), out = []
  if (scale === 'log') {
    const decade = w / Math.log10(hi / lo), marks = decade * Math.log10(2) >= 60 ? [1, 2, 5] : [1]
    for (let d = 10 ** Math.floor(Math.log10(lo)); d <= hi; d *= 10)
      for (let m = 1; m < 10; m++) if (m * d >= lo && m * d <= hi) out.push({ f: m * d, major: m === 1, label: marks.includes(m) })
  } else {
    // a line every 50 px or more on a 1-2-5 step, labels on every second, heavier every tenth
    const min = (hi - lo) / w * 50, e = 10 ** Math.floor(Math.log10(min)), s = [1, 2, 5, 10].map(m => m * e).find(s => s >= min)
    for (let f = Math.ceil(lo / s) * s; f <= hi; f += s) out.push({ f, major: Math.round(f / s) % 10 === 0, label: Math.round(f / s) % 2 === 0 })
  }
  for (const { f, major, label } of out) {
    const x = Math.round(S.at(Math.max(f, 1e-9), lo, hi) * w / px) * px
    g.fillStyle = css(alpha(ink, major ? .3 : .1)); g.fillRect(x, 0, px, h)
    if (!label) continue
    g.fillStyle = css(ink); g.fillRect(x, h - 4, px, 4)
    g.fillText(pretty(f), x + 3.5, h)
  }
}

// ── sound ─────────────────────────────────────────────────────────────────

// ?source= picks the first: a recording, a stream or mic
let current = ui.items[new URLSearchParams(location.search).get('source')] ?? ui.items.cello
async function start(it) {
  current = it; ui.show(it)
  try {
    await audio.start(it)
    audio.analyser.fftSize = +$('fft').value
    if (audio.context.sampleRate !== rate) { rate = audio.context.sampleRate; n = 0; setBand(band[0], Math.min(band[1], nyquist())) }
  } catch (e) { audio.stop(); ui.show(it, e.message) }
}
$('play').onclick = () => audio.element || audio.playing ? audio.toggle() : start(current)

// v3's set(): weight in dB, clamp to -100..0, bring to 0..1, smooth; the trail holds the maximum
requestAnimationFrame(function frame() {
  requestAnimationFrame(frame)
  bins()
  sp.clear()
  if (!n) return
  audio.analyser.getFloatFrequencyData(raw)
  const s = +$('smoothing').value
  let peak = 0
  for (let i = 0; i < n; i++) {
    const v = .01 * (clamp(raw[i] + curve[i], -100, 0) + 100)
    if (v > peak) peak = v
    mags[i] = v * (1 - s) + mags[i] * s
    if (mags[i] > top[i]) top[i] = mags[i]
    db[i] = mags[i] * 100 - 100; held[i] = top[i] * 100 - 100
  }
  if ($('type').value === 'fill' && !look.flat) sp.update({ fill: shade(peak) })
  sp.render()
  if ($('trail').checked) hold.render()
  const el = audio.element
  ui.progress(el && isFinite(el.duration) ? el.currentTime / el.duration : 0)
})

ui.show(current)
layout(); setBand(...band)
document.fonts?.ready.then(rule)
