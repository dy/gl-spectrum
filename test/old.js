import test from 'node:test'
import assert from 'node:assert/strict'
import { open, origin } from './browser.js'

// Two seconds of 220, 1000 and 4000 Hz as a 16-bit mono WAV: the page is fed a file, never the network
function tones(rate = 44100, frames = 88200) {
  const b = Buffer.alloc(44 + frames * 2)
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 2, 40)
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(8000 * [220, 1000, 4000].reduce((s, f) => s + Math.sin(2 * Math.PI * f * i / rate), 0)), 44 + i * 2)
  return b
}

test('v3 demo: loads with its libraries offline, draws a local file, the palette swatch recolors it', async () => {
  const { browser, page } = await open({ width: 1000, height: 700 }), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route(url => !url.href.startsWith(origin), route => route.abort()) // esm.sh and fonts: the page's stand-ins
  // Drawn pixels of the spectrum canvas, and how many of them have a hue
  const ink = () => page.locator('#spectrum').evaluate(c => {
    const t = Object.assign(document.createElement('canvas'), { width: c.width, height: c.height }).getContext('2d')
    t.drawImage(c, 0, 0)
    const d = t.getImageData(0, 0, c.width, c.height).data
    let drawn = 0, hued = 0
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { drawn++; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 24) hued++ }
    return { drawn, hued }
  })
  try {
    await page.goto(origin + '/example/old.html')
    await page.waitForFunction(() => document.querySelectorAll('#swatch span').length === 2)
    assert.equal(await page.locator('#title').textContent(), 'Bach – Cello Suite No. 1, Prélude', 'the cello waits for a click')
    assert.deepEqual(await ink(), { drawn: 0, hued: 0 }, 'nothing drawn before sound')

    await page.locator('summary').click()
    await page.locator('#file').setInputFiles({ name: 'tones.wav', mimeType: 'audio/wav', buffer: tones() })
    await page.waitForFunction(() => document.getElementById('play').getAttribute('aria-label') === 'Pause')
    assert.equal(await page.locator('#title').textContent(), 'tones.wav')
    await page.waitForFunction(() => { const c = document.getElementById('spectrum'); return c.width > 0 }, null)
    await page.waitForTimeout(500)
    const black = await ink()
    assert.ok(black.drawn > 1000, `the tones draw: ${black.drawn} px`)
    assert.ok(black.hued < black.drawn / 100, 'v3 starts black on white')

    const before = await page.screenshot()
    await page.locator('#swatch').click(); await page.waitForTimeout(300)
    assert.notDeepEqual(await page.screenshot(), before, 'the swatch changes the picture')
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 255, 255)', 'the page takes the palette')
    const colored = await ink()
    assert.ok(colored.hued > colored.drawn / 2, `the spectrum takes the palette: ${colored.hued} of ${colored.drawn} px`)
    assert.equal(await page.locator('#swatch span').count(), 3)

    for (const [id, value] of [['type', 'line'], ['weighting', 'z']]) await page.locator('#' + id).selectOption(value)
    for (const id of ['log', 'grid-on', 'trail']) await page.locator('#' + id).click()
    await page.waitForTimeout(200)
    assert.ok((await ink()).drawn > 100, 'the line draws on a linear axis')
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
