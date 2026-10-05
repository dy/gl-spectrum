import voice from './voice.js'

// Fill colormaps from the floor to the top, and the line over them
export const palettes = {
  ember: { fill: ['#4a0d1a', '#9e1530', '#d8283f', '#f59a87'], line: '#7a0f22' },
  lagoon: { fill: ['#2c4e4d', '#3f8f90', '#89d3c8', '#edf4bc'], line: '#245150' },
  ink: { fill: ['#3a3a3a', '#8c8c8c', '#e2e2e2'], line: '#1e1e1e' }
}

export function generator(source, rate = 48000) {
  let pos = 0, phase = 0, seed = 1
  const fill = voice(1, rate)
  return n => {
    const data = new Float32Array(n)
    if (source === 'voice') { fill(data, 0, n); return data }
    for (let i = 0; i < n; i++, pos++) {
      const t = pos / rate
      if (source === 'noise') { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; data[i] = seed / 2 ** 31 * .2 }
      else if (source === 'ensemble') {
        // A repeating four-bar phrase: plucked harmonics, bass, kick and brushed hats.
        const beat = t * 2, tick = Math.floor(beat * 2), age = (beat * 2 % 1) / 4
        const chords = [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]]
        const chord = chords[Math.floor(beat / 4) % 4], midi = chord[[0, 2, 1, 3, 2, 1, 3, 1][tick % 8]] + 12
        const f = 440 * 2 ** ((midi - 69) / 12)
        for (let h = 1; h <= 8; h++) if (f * h < rate / 2) data[i] += .32 / h * Math.exp(-age * (5 + h * 3)) * Math.sin(2 * Math.PI * f * h * age)
        const bass = 440 * 2 ** ((chord[0] - 69) / 12), b = (beat % 2) / 2
        data[i] += .22 * Math.exp(-b * 4) * Math.sin(2 * Math.PI * bass * b)
        const k = beat % 1 / 2
        data[i] += .28 * Math.exp(-k * 30) * Math.sin(2 * Math.PI * (48 * k + 2 * (1 - Math.exp(-k * 35))))
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
        data[i] += seed / 2 ** 31 * .1 * Math.exp(-age * 90)
        data[i] *= Math.min(1, age * 1200)
      } else if (source === 'birds') {
        const phrase = Math.floor(t / 2.4), u = t % 2.4, call = u % .32
        const f = (1800 + 450 * Math.sin(phrase * 2.3)) + 3000 * (call / .32) ** 2 + 300 * Math.sin(u * 75)
        phase += Math.PI * 2 * f / rate
        const env = u < 1.5 && call < .22 ? Math.sin(Math.PI * call / .22) ** 2 : 0
        data[i] = .3 * env * (Math.sin(phase) + .2 * Math.sin(phase * 2))
      } else if (source === 'sweep') { phase += Math.PI * 2 * 30 * (rate / 2 / 30) ** ((t % 6) / 6) / rate; data[i] = Math.sin(phase) * .6 }
      else if (source === 'clicks') data[i] = pos % Math.round(rate / 4) === 0 ? 1 : 0
      else if (source === 'chord') {
        const notes = Math.floor(t / 3) % 2 ? [220, 261.63, 329.63] : [261.63, 329.63, 392]
        for (const f of notes) for (let h = 1; h <= 8; h++) data[i] += .1 / h * Math.exp(-(t % 3) * (.4 + h * .2)) * Math.sin(Math.PI * 2 * f * h * t)
      } else {
        const f = [110, 146.83, 164.81, 130.81][Math.floor(t / 1.5) % 4] * (1 + .025 * Math.sin(t * 5))
        phase += Math.PI * 2 * f / rate
        const env = .25 + .75 * Math.sin(Math.PI * (t % .5) / .5) ** 2
        for (let h = 1; h <= 16; h++) data[i] += .3 / h * Math.sin(phase * h) * env
      }
    }
    return data
  }
}

// Hann-windowed spectrum of frame[0..N), in dB per bin, N / 2 bins; a full-scale sine reads 0 dB: Hann's coherent gain
// of 1/2 makes its bin's magnitude N / 4 (Harris 1978). Magnitudes are smoothed over calls as AnalyserNode does,
// m = τ · m + (1 − τ) · |X| (Web Audio API, "Smoothing over time").
export function spectrum(frame, out, mags, smoothing = 0) {
  const N = frame.length, re = new Float64Array(N), im = new Float64Array(N)
  for (let i = 0; i < N; i++) re[i] = frame[i] * (.5 - .5 * Math.cos(2 * Math.PI * i / N))
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]] }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a)
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti
        const c = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = c
      }
    }
  }
  for (let k = 0; k < N / 2; k++) {
    mags[k] = smoothing * mags[k] + (1 - smoothing) * Math.hypot(re[k], im[k]) * 4 / N
    out[k] = 20 * Math.log10(mags[k])
  }
  return out
}
