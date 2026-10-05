import Spectrum, { scales } from '../index.js'
import { palettes, generator, spectrum } from './data.js'
import { $, css, num, clamp, error, frame, step, label, setup, decode } from './ui.js'

const canvas = $('chart'), ax = $('axes').getContext('2d'), grid = $('grid').getContext('2d'), player = $('player')
const LEFT = 48, TOP = 8, BOTTOM = 24, DURATION = 24, FALL = 20 // peak hold falls 20 dB a second
const sp = new Spectrum(canvas), hold = new Spectrum(sp.gl, { fill: false })
let samples = new Float32Array(0), rate = 48000, title = '', url = null, mic = null, saved = null, task = 0
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
// The window under the playhead, or the microphone's latest, to dB per bin; the peak hold falls behind it
function analyse(now) {
  const N = num('fft'), n = N / 2, dt = Math.min((now - last) / 1000, .1)
  last = now
  if (bins?.length !== n) {
    bins = new Float32Array(n); mags = new Float64Array(n); peaks = new Float32Array(n).fill(-Infinity); win = new Float32Array(N)
    sp.update({ data: bins }); hold.update({ data: peaks })
  }
  if (mic) { mic.analyser.getFloatTimeDomainData(mic.buf); win.set(mic.buf.subarray(mic.buf.length - N)) }
  else {
    const at = Math.round(player.currentTime * rate) - N / 2
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
  $('status').value = mic ? `Microphone  ${rate / 1000} kHz  FFT ${num('fft')}`
    : `${title}  ${time(player.currentTime)} / ${time(samples.length / rate)}  ${rate / 1000} kHz  FFT ${num('fft')}`
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
// Sound plays muted from the start, so the spectrum moves; Sound unmutes it
function load(data, sr, heading, blob) {
  samples = data; rate = sr; title = heading
  mags?.fill(0); peaks?.fill(-Infinity)
  if (url) URL.revokeObjectURL(url)
  player.src = url = URL.createObjectURL(blob)
  player.play().catch(() => {})
  $('seek').disabled = false; $('seek').value = 0
  setBand(); error(''); status()
}
async function generate() {
  const id = ++task, source = $('source').value
  if (source === 'file' || source === 'mic') return
  stopMic(); $('status').value = 'Generating…'
  try {
    const sr = 48000, n = DURATION * sr, gen = generator(source, sr), data = new Float32Array(n)
    for (let a = 0; a < n; a += 262144) {
      data.set(gen(Math.min(262144, n - a)), a)
      await frame(); if (id !== task) return
    }
    $('source').querySelector('[value=file]').hidden = true
    load(data, sr, $('source').selectedOptions[0].textContent, wav(data, sr))
  } catch (e) { if (id === task) error(e.message) }
}
async function startMic() {
  const id = ++task
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), ctx = new AudioContext(), analyser = ctx.createAnalyser()
    analyser.fftSize = 32768; ctx.createMediaStreamSource(stream).connect(analyser)
    if (id !== task) { stream.getTracks().forEach(t => t.stop()); return ctx.close() }
    saved = { source: $('source').value, rate }
    player.pause(); mic = { stream, ctx, analyser, buf: new Float32Array(32768) }; rate = ctx.sampleRate
    $('source').querySelector('[value=mic]').hidden = false; $('source').value = 'mic'
    $('mic').setAttribute('aria-pressed', 'true'); $('play').disabled = $('sound').disabled = $('seek').disabled = true
    mags?.fill(0); peaks?.fill(-Infinity); setBand(); error(''); status()
  } catch (e) { if (id === task) error(`Microphone: ${e.message}`) }
}
function stopMic() {
  if (!mic) return
  mic.stream.getTracks().forEach(t => t.stop()); mic.ctx.close(); mic = null
  $('source').querySelector('[value=mic]').hidden = true; $('mic').setAttribute('aria-pressed', 'false')
  $('play').disabled = $('sound').disabled = $('seek').disabled = false
  rate = saved.rate; if ($('source').value === 'mic') $('source').value = saved.source
  mags?.fill(0); peaks?.fill(-Infinity); setBand(); status()
}

setup({ resize: (width, height, ratio) => { w = width; h = height; pr = ratio; layout() }, zoom, pan, fit: () => setBand(), inspect })
$('source').onchange = generate
$('voice-band').onclick = () => setBand(Math.max(80, scales[scale].low), Math.min(4000, rate / 2))
$('mic').onclick = () => mic ? (stopMic(), player.play().catch(() => {})) : startMic()
$('play').onclick = () => player.paused ? player.play().catch(e => error(e.message)) : player.pause()
$('sound').onclick = () => {
  player.muted = !player.muted
  $('sound').setAttribute('aria-pressed', String(!player.muted))
  if (!player.muted && player.paused) player.play().catch(e => error(e.message))
}
for (const event of ['play', 'pause']) player.addEventListener(event, () => {
  $('play').textContent = player.paused ? 'Play' : 'Pause'; $('play').setAttribute('aria-label', $('play').textContent)
})
player.addEventListener('timeupdate', () => { if (Number.isFinite(player.duration)) $('seek').value = player.currentTime / player.duration * 1000 })
$('seek').oninput = () => { if (Number.isFinite(player.duration)) player.currentTime = num('seek') / 1000 * player.duration }
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
  if (mic) stopMic()
  $('source').value = 'ensemble'; generate()
})
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file) return
  const id = ++task; $('status').value = `Opening ${file.name}…`
  try {
    const { data, rate: sr } = await decode(file)
    if (id !== task) return
    // channels mixed to one
    const mono = data.length === 1 ? data[0] : data[0].map((_, i) => data.reduce((s, d) => s + d[i], 0) / data.length)
    stopMic()
    $('source').querySelector('[value=file]').hidden = false; $('source').value = 'file'
    load(mono, sr, file.name, file)
  } catch (e) { if (id === task) { error(`Cannot open ${file.name}: ${e.message}`); status() } }
  finally { $('file').value = '' }
}
player.addEventListener('error', () => { if (player.getAttribute('src')) error('The browser cannot play this audio.') })
window.addEventListener('pagehide', () => { stopMic(); if (url) URL.revokeObjectURL(url) })

requestAnimationFrame(function draw(now) {
  requestAnimationFrame(draw)
  if (!samples.length && !mic) return
  const start = performance.now()
  try {
    analyse(now)
    if (paint) { look(); paint = false }
    sp.clear().render()
    if ($('hold').checked) hold.render()
    if (!ruled) axes()
    readout()
    if (now - reported >= 250) {
      $('perf').value = `${(performance.now() - start).toFixed(1)} ms/frame`
      $('perf').title = 'CPU time of a frame: the FFT, then drawing the spectrum and the peak hold; excludes GPU completion.'
      status(); reported = now
    }
  } catch (e) { error(e.message) }
})
await generate()
