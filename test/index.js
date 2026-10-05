// npm test: headless Chromium (SwiftShader WebGL2, deterministic), node:test runner
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { open } from './browser.js'

let browser, page
before(async () => ({ browser, page } = await open()))
after(() => browser?.close())

// Run an export of test/page.js in the browser
const run = (name, arg) => page.evaluate(async ([name, arg]) => (await import('/test/page.js'))[name](arg), [name, arg])

const clean = (res, what) => assert.equal(res.nbad, 0, `${res.nbad} of ${res.cols} ${what} differ from the reference, e.g. ${JSON.stringify(res.bad)}`)

// ── columns: pick() per column vs brute force over the bins ───────────

test('columns: log, mel, erb and lin axes, whole, zoomed and past-Nyquist bands, 1 to 65539 bins', async () => {
  for (let [seed, n, W, pr, x0] of [[1, 65539, 640, 1, 0], [2, 4096, 333, 1.5, 30], [3, 1024, 97, 2, 7], [4, 100, 500, 1, 0], [5, 3, 50, 1, 0], [6, 1, 40, 1, 0]]) {
    clean(await run('columns', { seed, n, W, pr, x0 }), 'columns')
  }
})

test('columns: NaN runs and ±Infinity', async () => {
  for (let [seed, n, W] of [[11, 16384, 500], [12, 2048, 211]]) clean(await run('columns', { seed, n, W, pr: 1, nan: 12, inf: 20 }), 'columns')
})

// ── pixels ───────────────────────────────────────────────────────────

test('render: one loud bin among 65536 reaches the top of its column', async () => {
  let { col, pick, others } = await run('peak')
  assert.ok(col >= 0, 'a column reaches the top row')
  assert.equal(pick.bin, 40000)
  assert.equal(pick.level, 0)
  assert.equal(others, 0, 'no column but the peak and the line down from it on either side rises off the floor')
})

test('render: a line through bins 100 px apart, with a dot at each', async () => {
  let { rows, dots, after } = await run('line')
  assert.deepEqual(rows.filter(y => y < 48 || y > 52), [], `the line stays on row 50: ${rows}`)
  assert.ok(rows.includes(50))
  assert.equal(dots, 8, 'a dot at each bin')
  assert.equal(after, null, 'nothing past the last bin')
})

test('render: align puts level 0 at the bottom, the middle or the top', async () => {
  let r = await run('align')
  assert.deepEqual(r[0], [50, 100], 'from the bottom up to the level')
  assert.deepEqual(r[1], [0, 50], 'from the top down')
  assert.deepEqual(r[.5], [25, 75], 'mirrored about the middle')
})

test('render: fill by colormap from the floor to the top; default tint; none', async () => {
  let { low, high, mid, tint, none } = await run('colormap')
  assert.ok(low[0] > 240 && low[2] < 30, `red at the floor: ${low}`)
  assert.ok(high[2] > 240 && high[0] < 30, `blue at the top: ${high}`)
  assert.ok(mid[0] > 60 && mid[2] > 60, `between, both: ${mid}`)
  assert.ok(Math.abs(tint[3] - 85) <= 1 && Math.abs(tint[0] - 85) <= 1, `default fill: the line color at a third: ${tint}`)
  assert.deepEqual(none, [0, 0, 0, 0], 'fill: false')
})

test('render: transparent above the spectrum, premultiplied', async () => {
  let r = await run('transparent')
  assert.equal(r.notPremul, 0, 'color never exceeds alpha')
  assert.equal(r.above, 0, 'nothing above the loudest level')
  assert.ok(r.total > 10000)
})

test('render: NaN is a gap, ±Infinity is clamped to the edge', async () => {
  let r = await run('gaps')
  assert.equal(r.inGap, 0, 'nothing drawn over NaN')
  assert.equal(r.gapPick, null)
  assert.equal(r.up[0], 0, '+Infinity reaches the top')
  assert.equal(r.upPick.level, Infinity)
  assert.ok(r.down[0] > 90, `-Infinity is the floor: ${r.down}`)
  assert.ok(r.beside[0] >= 48 && r.beside[0] <= 50, `-50 dB at the middle: ${r.beside}`)
})

test('render: lanes sharing a canvas stay inside their viewports', async () => {
  let r = await run('lanes')
  assert.ok(r.aInk > 1000 && r.bInk > 1000, 'both lanes draw')
  assert.equal(r.bleedA, 0, 'lane A does not draw outside its viewport')
  assert.ok(r.aKept, 'drawing lane B leaves lane A untouched')
  assert.equal(r.aCleared, 0, 'clear() empties lane A')
  assert.ok(r.bKept, 'clearing lane A leaves lane B untouched')
  assert.equal(r.programs, 1, 'one shader program per context')
})

test('render: data refilled in place draws at the next render', async () => {
  let { before, after } = await run('live')
  assert.ok(before[0] > 95, `floor: ${before}`)
  assert.ok(after[0] < 25, `-20 dB: ${after}`)
})

test('render: the default viewport follows a resized canvas', async () => {
  let r = await run('resize')
  assert.ok(r.before > 0 && r.after > 0, `drawn in the new right half: ${JSON.stringify(r)}`)
})

test('colors: CSS strings including oklch match the 2D canvas; invalid throws', async () => {
  let r = await run('colors')
  for (let c of ['oklch(0.7 0.15 250)', 'rebeccapurple', '#0f08']) {
    r[c].gl.forEach((v, i) => assert.ok(Math.abs(v - r[c].css[i]) <= 1, `${c}: ${r[c].gl} vs ${r[c].css}`))
  }
  assert.match(r.invalid, /invalid color/)
})

test('context loss: no throws while lost, redraws on restore', async () => {
  let r = await run('lose')
  assert.deepEqual(r.errors, [])
  assert.ok(r.ink > 100, 'drawn again after restore')
})

test('api: errors, getters, null defaults, data referenced, destroy', async () => {
  let r = await run('api')
  assert.equal(r.ctor, 'TypeError', 'a canvas without WebGL2 throws')
  for (let k of ['band', 'levels', 'viewport', 'thickness', 'pixelRatio', 'sampleRate', 'scale', 'fill', 'align']) assert.equal(r.errors[k], 'TypeError', `bad ${k} throws`)
  for (let k of ['{"band":[0,100]}', '{"band":[200,100]}', '{"levels":[0,-10]}', '{"align":2}']) assert.equal(r.errors[k], 'RangeError', `${k} throws`)
  assert.deepEqual(r.empty, [0, null, true], 'no data: nothing to pick or draw')
  assert.deepEqual(r.converted, [4, [20, 4000], [-100, 0]], 'arrays are converted; defaults')
  assert.deepEqual(r.getters, [[100, 3000], [-60, 6]])
  assert.deepEqual(r.defaults, [[0, 4000], [-100, 0]], 'null restores defaults, the band from the lin floor')
  assert.equal(r.referenced.level, -7, 'a Float32Array is referenced')
  assert.deepEqual(r.afterDestroy, [0, 0], 'destroyed: no data, draws nothing')
})
