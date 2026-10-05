// npm run bench: frame timings for 1024 to 65536 bins on a log axis, hardware GPU, one view of 1440×400 CSS px at DPR 2.
// CPU time is the render() call: bins to vertices, upload, draw call; GPU time comes from EXT_disjoint_timer_query_webgl2,
// as gl.finish() returns before the GPU is done in Chrome on Metal
import { open } from './browser.js'

let { browser, page } = await open({ gpu: true })

let res = await page.evaluate(async () => {
  let { default: Spectrum } = await import('/index.js')
  let W = 1440, H = 400, pr = 2, c = document.createElement('canvas')
  c.width = W * pr; c.height = H * pr
  document.body.append(c)
  let sp = new Spectrum(c, { pixelRatio: pr, sampleRate: 48000, align: .5, fill: ['#4a0d1a', '#d8283f', '#f59a87'] })
  let gl = sp.gl, tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info')
  let gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  let now = () => performance.now(), idle = () => new Promise(r => setTimeout(r))
  let stats = t => { t.sort((a, b) => a - b); return { mean: t.reduce((a, b) => a + b) / t.length, p95: t[Math.floor(t.length * .95)] } }
  await new Promise(done => { let t0 = now(); requestAnimationFrame(function f() { now() - t0 < 1000 ? requestAnimationFrame(f) : done() }) }) // compositor warm-up

  let out = []
  for (let n of [1024, 16384, 65536]) {
    let d = new Float32Array(n), seed = 1, rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647
    sp.update({ data: d, band: null })
    // frames: new levels in the array given as data, then clear and render; CPU time of render(), GPU time from a query each
    let frames = async () => {
      let cpu = [], qs = []
      for (let i = 0; i < 300; i++) {
        for (let k = 0; k < n; k++) d[k] = -40 - 30 * Math.log10(1 + k / 40) - 20 * rnd()
        let q = gl.createQuery()
        gl.beginQuery(tq.TIME_ELAPSED_EXT, q)
        let t = now()
        sp.clear().render()
        cpu.push(now() - t)
        gl.endQuery(tq.TIME_ELAPSED_EXT)
        qs.push(q)
        if (i % 20 === 19) await idle()
      }
      let gpu = []
      for (let q of qs) { while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) await idle(); gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q) }
      return { cpu: stats(cpu), gpu: stats(gpu) }
    }
    await frames()
    let full = await frames()
    sp.update({ band: [2000, 2500] }) // zoomed in: every bin a vertex, with dots
    let zoomed = await frames()
    out.push({ n, full, zoomed })
  }
  c.remove()
  return { gpu, out }
})
await browser.close()

let ms = v => v < 1 ? v.toFixed(2) : v.toFixed(1), cell = t => `${ms(t.cpu.mean)} / ${ms(t.cpu.p95)} | ${ms(t.gpu.mean)} / ${ms(t.gpu.p95)}`
console.log(`${res.gpu}\n\nBins | Whole axis: CPU, mean / p95 | GPU | 2–2.5 kHz: CPU | GPU\n---|---|---|---|---`)
for (let r of res.out) console.log(`${r.n} | ${cell(r.full)} | ${cell(r.zoomed)}`)
