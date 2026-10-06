import test from 'node:test'
import assert from 'node:assert/strict'
import { open, origin } from './browser.js'

// A tone, a 16-bit mono WAV
export function wav(f = 1000, seconds = 3, rate = 48000) {
  const n = rate * seconds, bytes = Buffer.alloc(44 + n * 2)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24)
  bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * f * i / rate) * 16000), 44 + i * 2)
  return bytes
}
// Pixels drawn in a canvas, in [x0, x1) of its width
const ink = (page, id, x0 = 0, x1 = 1) => page.evaluate(([id, x0, x1]) => {
  const c = document.getElementById(id), t = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height }), g = t.getContext('2d')
  g.drawImage(c, 0, 0)
  const a = Math.floor(x0 * c.width), b = Math.ceil(x1 * c.width), d = g.getImageData(a, 0, b - a, c.height).data
  let s = 0
  for (let i = 3; i < d.length; i += 4) s += d[i] > 0
  return s
}, [id, x0, x1])

test('demo: the v3 page; a file plays into the spectrum; palettes, scale, align, fft, smoothing, zoom', async () => {
  const { browser, page } = await open({ width: 1000, height: 700 }), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route(url => !url.href.startsWith(origin), route => route.abort()) // offline: the libraries' stand-ins
  try {
    await page.goto(origin + '/index.html')
    await page.waitForFunction(() => document.getElementById('title').textContent.startsWith('Bach'))
    assert.equal(await page.locator('#credit').textContent(), 'John Michel, CC BY-SA 3.0')
    assert.equal(await page.locator('#hint').isVisible(), true)
    assert.equal(await ink(page, 'chart'), 0, 'nothing before a click')
    for (const id of ['type', 'swatch', 'scale', 'align', 'fft', 'smoothing', 'weighting', 'grid-on', 'trail']) assert.ok(await page.locator('#' + id).count(), id)

    await page.locator('#file').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav() })
    await page.waitForFunction(() => document.getElementById('title').textContent === 'tone.wav')
    await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-label') === 'Pause')
    assert.equal(await page.locator('#hint').isHidden(), true)
    await page.waitForTimeout(500)
    assert.ok(await ink(page, 'chart') > 100, 'the tone draws')

    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const before = await bg(); await page.locator('#swatch').click(); assert.notEqual(await bg(), before, 'a new palette')
    const grid = () => page.locator('#grid').evaluate(c => c.toDataURL())
    let g = await grid(); await page.locator('#scale').selectOption('mel'); assert.notEqual(await grid(), g, 'the grid follows the scale')
    await page.locator('#align').selectOption('0'); await page.locator('#fft').selectOption('1024')
    await page.locator('#smoothing').fill('0.9'); assert.equal(await page.locator('#smoothing-value').textContent(), '0.9')
    g = await grid()
    const box = await page.locator('#chart').boundingBox()
    await page.mouse.move(box.x + 500, box.y + 300); await page.mouse.wheel(0, -300); await page.waitForTimeout(100)
    assert.notEqual(await grid(), g, 'wheel zooms the band')
    g = await grid(); await page.locator('#chart').dblclick(); assert.notEqual(await grid(), g, 'double click fits')
    await page.waitForTimeout(300)
    assert.ok(await ink(page, 'chart') > 100, 'still drawn after the settings changed')

    await page.locator('#play').click(); await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-label') === 'Play')
    for (const width of [375, 768]) { await page.setViewportSize({ width, height: 700 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true) }
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
