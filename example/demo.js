import Spectrum, { scales } from '../index.js'
import { palettes, generator, spectrum } from './data.js'
import { recordings, streams, download, listen as radio, record } from './sources.js'
import { $, css, num, clamp, error, frame, step, label, setup, decode } from './ui.js'

const canvas = $('chart'), ax = $('axes').getContext('2d'), grid = $('grid').getContext('2d'), player = $('player')
const LEFT = 48, TOP = 8, BOTTOM = 24, DURATION = 24, FALL = 20 // peak hold falls 20 dB a second
const sp = new Spectrum(canvas), hold = new Spectrum(sp.gl, { fill: false })
let samples = new Float32Array(0), rate = 48000, title = '', url = null, live = null, task = 0
const ring = new Float32Array(32768), cache = new Map() // the latest live samples; recordings already decoded
let ringAt = 0
let running = true, sound = false, clockAt = 0, clockSince = 0
let band = [20, 24000], scale = 'log', bins = null, mags = null, peaks = null, win = null, last = 0
let w = 1, h = 1, pr = 1, pw = 1, ph = 1, paint = true, ruled = false, pointer = null, reported = 0

function setBand(lo = scales[scale].low, hi = rate / 2) {
  band = [lo, hi]; $('low').value = Number(lo.toPrecision(7)); $('high').value = Number(hi.toPrecision(7))
  $('low').min = scales[scale].low; $('low').max = rate / 2 - 1; $('high').max = rate / 2
  paint = true
}
// Zoom and pan in the scale's own units, so the point under the pointer stays put
function view(fn) {
  const S = scales[scale], lo = S.low, hi = rate / 2, [a, b] = band.map(f => S.at(f, lo, hi))
  let [start, span] = fn(a, b)
  span = clamp(span, 1 / 512, 1); start = clamp(start, 0, 1 - span)
  setBand(S.of(start, lo, hi), S.of(start + span, lo, hi))
}
const zoom = (x, factor) => view((a, b) => { const u = clamp((x - LEFT) / pw, 0, 1), m = a + u * (b - a), s = (b - a) * factor; return [m - u * s, s] })
const pan = dx => view((a, b) => [a + dx / pw * (b - a), b - a])
function layout() {
  pw = Math.max(1, w - LEFT - 12); ph = Math.max(1, h - TOP - BOTTOM)
  for (const s of [sp, hold]) s.update({ viewport: [LEFT, TOP, pw, ph], pixelRatio: pr })
  paint = true
}
function look() {
  const p = palettes[$('palette').value], shared = { align: num('align'), levels: [num('floor'), num('top')], scale, band, sampleRate: rate }
  sp.update({ ...shared, fill: p.fill, color: num('thickness') ? p.line : [0, 0, 0, 0], thickness: num('thickness') || 1 })
  hold.update({ ...shared, color: p.line + '70' })
  ruled = false
}
// The window under the playhead, or the latest live samples, to dB per bin; the peak hold falls behind it
function analyse(now) {
  const N = num('fft'), n = N / 2, dt = Math.min((now - last) / 1000, .1)
  last = now
  if (bins?.length !== n) {
    bins = new Float32Array(n); mags = new Float64Array(n); peaks = new Float32Array(n).fill(-Infinity); win = new Float32Array(N)
    sp.update({ data: bins }); hold.update({ data: peaks })
  }
  if (live) for (let i = 0, L = ring.length; i < N; i++) win[i] = ring[(ringAt - N + i + L) % L]
  else {
    const at = Math.round(position() * rate) - N / 2
    for (let i = 0; i < N; i++) { const k = at + i; win[i] = k >= 0 && k < samples.length ? samples[k] : 0 }
  }
  spectrum(win, bins, mags, num('smoothing'))
  for (let k = 0; k < n; k++) peaks[k] = Math.max(bins[k], peaks[k] - FALL * dt)
}
function axes() {
  for (const ctx of [ax, grid]) { ctx.setTransform(pr, 0, 0, pr, 0, 0); ctx.clearRect(0, 0, w, h) }
  ax.font = `11px ${css('--font')}`; ax.fillStyle = css('--dim'); grid.fillStyle = css('--grid')
  const on = $('grid-on').checked, S = scales[scale], [lo, hi] = band, bottom = TOP + ph
  const marks = scale === 'log' ? [20, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000] : []
  if (scale !== 'log') { const d = step(hi - lo, pw); for (let f = Math.ceil(lo / d) * d; f <= hi; f += d) marks.push(f) }
  let prev = -Infinity
  for (const f of marks) {
    if (f < lo || f > hi) continue
    const x = LEFT + S.at(f, lo, hi) * pw, text = f >= 1000 ? label(f / 1000) + 'k' : label(f)
    if (x - prev < 36) continue
    prev = x
    if (on) grid.fillRect(Math.round(x), TOP, 1, ph)
    if (x + ax.measureText(text).width < w) ax.fillText(text, x + 3, bottom + 15)
  }
  ax.fillText('Hz', 8, bottom + 15)
  // a level's rows: up from the base, down from it, or both, as align puts them
  const a = num('align'), [fl, tp] = [num('floor'), num('top')], base = TOP + ph * (1 - a), dy = step(tp - fl, ph * (a === .5 ? 1 : 2))
  ax.textAlign = 'right'
  for (let v = Math.ceil(fl / dy) * dy; v <= tp; v += dy) {
    const t = (v - fl) / (tp - fl)
    for (const y of [a < 1 ? base - t * (1 - a) * ph : null, a > 0 && t > 0 ? base + t * a * ph : null]) {
      if (y == null) continue
      if (on) grid.fillRect(LEFT, Math.round(y), pw, 1)
      ax.fillText(label(v), LEFT - 8, clamp(y + 4, TOP + 10, bottom))
    }
  }
  ax.textAlign = 'left'; ax.fillText('dB', 8, TOP + 10)
  ruled = true
}
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
function note(f) {
  if (!(f >= 16)) return ''
  const m = 69 + 12 * Math.log2(f / 440), k = Math.round(m), cents = Math.round((m - k) * 100)
  return `${NOTES[k % 12]}${Math.floor(k / 12) - 1}${cents ? ` ${cents > 0 ? '+' : '−'}${Math.abs(cents)}¢` : ''}`
}
function inspect(x, y) { pointer = x >= LEFT && x < LEFT + pw && y >= TOP && y < TOP + ph ? x : null; readout() }
function readout() {
  const p = pointer == null ? null : sp.pick(pointer - LEFT)
  $('readout').value = p ? `${label(Math.round(p.frequency))} Hz  ${note(p.frequency)}  ${Number.isFinite(p.level) ? p.level.toFixed(1) + ' dB' : 'silence'}` : ''
}
const time = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
function status() {
  $('status').value = live ? `${title}  live  ${rate / 1000} kHz  FFT ${num('fft')}`
    : `${title}  ${time(position())} / ${time(samples.length / rate)}  ${rate / 1000} kHz  FFT ${num('fft')}`
}
function wav(data, sr) {
  const bytes = new ArrayBuffer(44 + data.length * 2), v = new DataView(bytes)
  const str = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, bytes.byteLength - 8, true); str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, data.length * 2, true)
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, clamp(data[i], -1, 1) * 32767, true)
  return new Blob([bytes], { type: 'audio/wav' })
}
// The playhead: a clock, so the spectrum moves from the start, as no browser plays sound before a click; the player's
// position while it sounds
function clock() {
  const d = samples.length / rate, t = clockAt + (running ? (performance.now() - clockSince) / 1000 : 0)
  return d ? t % d : 0
}
const position = () => sound && running && !player.paused ? player.currentTime : clock()
function setClock(t = position()) { clockAt = t; clockSince = performance.now() }
function listen() {
  if (!(sound && running && !live)) return player.pause()
  player.currentTime = clock()
  player.play().catch(e => { sound = false; controls(); error(e.message) })
}
function controls() {
  $('play').textContent = running ? 'Pause' : 'Play'; $('play').setAttribute('aria-label', $('play').textContent)
  $('sound').setAttribute('aria-pressed', String(sound))
}
function credit(info) {
  $('credit').hidden = !info
  if (!info) return
  $('credit').href = info.page; $('credit').textContent = info.credit ? `${info.credit} · ${info.license}` : new URL(info.page).hostname
}
function notice(text = '') { $('note').value = text; $('note').hidden = !text }
function load(data, sr, heading, blob, info) {
  samples = data; rate = sr; title = heading
  mags?.fill(0); peaks?.fill(-Infinity)
  if (url) URL.revokeObjectURL(url)
  player.src = url = URL.createObjectURL(blob)
  setClock(0); listen()
  $('seek').disabled = false; $('seek').value = 0
  credit(info); notice(); setBand(); error(''); status()
}
const mono = data => data.length === 1 ? data[0] : data[0].map((_, i) => data.reduce((s, d) => s + d[i], 0) / data.length)
// Live chunks, mixed to one channel, into the ring the analysis reads
function push(chunk) {
  for (let i = 0, n = chunk[0].length; i < n; i++) {
    let s = 0
    for (const c of chunk) s += c[i]
    ring[ringAt] = s / chunk.length; ringAt = (ringAt + 1) % ring.length
  }
}
function stopLive() {
  if (!live) return
  live.stop(); live = null
  $('play').disabled = $('sound').disabled = $('seek').disabled = false
}
// A recording (downloaded once), live radio, the microphone or a test signal
async function choose() {
  const id = ++task, value = $('source').value, rec = recordings.find(r => r.id === value), station = streams.find(s => s.id === value)
  if (value === 'file') return
  const name = $('source').selectedOptions[0].textContent
  stopLive(); error('')
  try {
    if (rec) {
      let got = cache.get(value)
      if (!got) {
        notice(`Downloading ${name}…`)
        const blob = await download(rec.url, p => { if (id === task) notice(`Downloading ${name}  ${Math.round(p * 100)}%`) })
        if (id !== task) return
        notice(`Decoding ${name}…`)
        const { data, rate: sr } = await decode(blob)
        cache.set(value, got = { data: mono(data), rate: sr, blob })
      }
      if (id === task) load(got.data, got.rate, name, got.blob, rec)
    } else if (station || value === 'mic') {
      notice(station ? `Tuning in to ${name}…` : 'Waiting for the microphone…')
      const tap = await (station ? radio(station.url, push) : record(push))
      if (id !== task) return tap.stop()
      live = tap; rate = tap.rate; title = name; ring.fill(0)
      player.pause(); $('play').disabled = $('sound').disabled = $('seek').disabled = true
      mags?.fill(0); peaks?.fill(-Infinity); credit(station); notice(); setBand(); status()
    } else {
      notice('Generating…')
      const sr = 48000, n = DURATION * sr, gen = generator(value, sr), data = new Float32Array(n)
      for (let a = 0; a < n; a += 262144) {
        data.set(gen(Math.min(262144, n - a)), a)
        await frame(); if (id !== task) return
      }
      load(data, sr, name, wav(data, sr))
    }
    $('source').querySelector('[value=file]').hidden = true
  } catch (e) { if (id === task) { notice(); error(`${name}: ${e.message}`); status() } }
}

setup({ resize: (width, height, ratio) => { w = width; h = height; pr = ratio; layout() }, zoom, pan, fit: () => setBand(), inspect })
$('source').prepend(...[['Recordings', recordings], ['Live', [...streams, { id: 'mic', name: 'Microphone' }]]].map(([label, list]) => {
  const group = document.createElement('optgroup')
  group.label = label
  group.append(...list.map(s => new Option(s.name, s.id)))
  return group
}))
$('source').onchange = choose
$('voice-band').onclick = () => setBand(Math.max(80, scales[scale].low), Math.min(4000, rate / 2))
$('play').onclick = () => { setClock(); running = !running; controls(); listen() }
$('sound').onclick = () => { setClock(); sound = !sound; controls(); listen() }
$('seek').oninput = () => { setClock(num('seek') / 1000 * samples.length / rate); listen() }
$('controls').oninput = e => {
  if (!e.target.validity.valid || (e.target.type === 'number' && !e.target.value)) return
  if (e.target.id === 'scale') { scale = $('scale').value; setBand() }
  if (['low', 'high'].includes(e.target.id)) {
    if (num('low') >= num('high')) return error('Low frequency must be below high frequency.')
    setBand(num('low'), num('high'))
  }
  if (num('floor') >= num('top')) return error('Floor must be below the top.')
  if (e.target.id === 'fft') { mags?.fill(0) }
  $('thickness-value').value = `${num('thickness')} px`; $('smoothing-value').value = num('smoothing')
  error(''); paint = true
}
$('controls').onreset = () => queueMicrotask(() => {
  scale = 'log'; $('thickness-value').value = '1 px'; $('smoothing-value').value = '0.8'
  $('source').value = initial; choose()
})
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file) return
  const id = ++task; $('status').value = `Opening ${file.name}…`
  try {
    const { data, rate: sr } = await decode(file)
    if (id !== task) return
    stopLive()
    $('source').querySelector('[value=file]').hidden = false; $('source').value = 'file'
    load(mono(data), sr, file.name, file)
  } catch (e) { if (id === task) { error(`Cannot open ${file.name}: ${e.message}`); status() } }
  finally { $('file').value = '' }
}
player.addEventListener('error', () => { if (player.getAttribute('src')) error('The browser cannot play this audio.') })
window.addEventListener('pagehide', () => { stopLive(); if (url) URL.revokeObjectURL(url) })

requestAnimationFrame(function draw(now) {
  requestAnimationFrame(draw)
  if (!samples.length && !live) return
  const start = performance.now()
  try {
    analyse(now)
    if (paint) { look(); paint = false }
    sp.clear().render()
    if ($('hold').checked) hold.render()
    if (!ruled) axes()
    readout()
    if (!live && document.activeElement !== $('seek')) $('seek').value = position() / (samples.length / rate) * 1000
    if (now - reported >= 250) {
      $('perf').value = `${(performance.now() - start).toFixed(1)} ms/frame`
      $('perf').title = 'CPU time of a frame: the FFT, then drawing the spectrum and the peak hold; excludes GPU completion.'
      status(); reported = now
    }
  } catch (e) { error(e.message) }
})
// ?source= picks the first source: a recording, a stream, mic or a test signal
const asked = new URLSearchParams(location.search).get('source'), initial = $('source').querySelector(`option[value="${CSS.escape(asked ?? '')}"]`) ? asked : 'cello'
$('source').value = initial
await choose()
