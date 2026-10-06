import test from 'node:test'
import assert from 'node:assert/strict'
import { open, origin } from './browser.js'
import { generator, spectrum } from '../example/data.js'

test('demo spectrum: a full-scale sine on its bin reads 0 dB, Hann neighbours -6.02 dB; 0.1 reads -20 dB', () => {
  const N = 4096, out = new Float32Array(N / 2), sine = a => Float32Array.from({ length: N }, (_, i) => a * Math.sin(2 * Math.PI * 100 * i / N))
  spectrum(sine(1), out, new Float64Array(N / 2))
  assert.ok(Math.abs(out[100]) < 1e-6, `${out[100]}`)
  assert.ok(Math.abs(out[99] + 6.0206) < 1e-3 && Math.abs(out[101] + 6.0206) < 1e-3, `${out[99]}, ${out[101]}`) // 20·log10(1/2)
  spectrum(sine(.1), out, new Float64Array(N / 2))
  assert.ok(Math.abs(out[100] + 20) < 1e-6, `${out[100]}`)
})

test('demo signals continue across blocks without restarting', () => {
  for (const source of ['sweep', 'chord', 'tones', 'clicks', 'noise']) {
    const whole = generator(source)(10000), chunks = generator(source)
    assert.deepEqual([...whole], [...chunks(3333), ...chunks(6667)], source)
  }
})

test('playground: moves from the start without sound, palettes, align, scale/band, levels, sound, files and reset', async () => {
  const { browser, page } = await open({ width: 1000, height: 850 }), errors = []
  page.on('pageerror', e => errors.push(e.message))
  const text = id => page.locator('#' + id).textContent()
  const wait = str => page.waitForFunction(s => { const status = document.getElementById('status').textContent; return !status.startsWith('Opening ') && status.includes(s) }, str)
  const pixels = () => page.locator('#chart').evaluate(c => c.toDataURL())
  const change = async (id, val) => { await page.locator('#' + id).fill(val); await page.locator('#' + id).press('Tab') }
  const playing = () => page.locator('#player').evaluate(p => !p.paused)
  try {
    // the default source downloads a recording; tests stay offline with a test signal
    await page.goto(origin + '/index.html?source=sweep'); await page.waitForURL(origin + '/example/?source=sweep')
    await wait('Frequency sweep'); await page.waitForFunction(() => document.getElementById('perf').textContent.includes('ms/frame'))
    assert.equal(await page.locator('#panel').isHidden(), true)
    const options = await page.locator('#source optgroup').evaluateAll(gs => gs.map(g => [g.label, g.children.length]))
    assert.deepEqual(options, [['Recordings', 6], ['Live', 3], ['Test signals', 5]], 'recordings, live radio and the microphone, test signals')
    assert.equal(await page.locator('#credit').isHidden(), true, 'test signals need no credit')
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'false', 'sound is off till asked for')
    assert.equal(await playing(), false)
    const a = await pixels(); await page.waitForTimeout(300); assert.notEqual(await pixels(), a, 'the spectrum moves without sound')
    const seek = () => page.locator('#seek').evaluate(s => +s.value)
    await page.locator('#play').click(); assert.equal(await text('play'), 'Play')
    await page.waitForTimeout(100) // a frame to draw the paused position
    const at = await seek(); await page.waitForTimeout(300); assert.equal(await seek(), at, 'paused, the playhead stays')
    await page.locator('#sound').click(); assert.equal(await playing(), false, 'paused, sound waits')
    await page.locator('#play').click(); assert.equal(await playing(), true, 'sound plays from the playhead')
    assert.ok(Math.abs(await page.locator('#player').evaluate(p => p.currentTime) - at / 1000 * 24) < .5)
    assert.equal(await page.locator('#sound').getAttribute('aria-pressed'), 'true')
    await page.locator('#seek').fill('500'); await page.locator('#seek').dispatchEvent('input')
    assert.ok(await page.locator('#player').evaluate(p => p.currentTime >= 11.9))
    await page.locator('#sound').click(); assert.equal(await playing(), false)
    assert.ok(await seek() >= 495, 'the clock carries on from where sound stopped')
    await page.locator('#play').click()
    const box = await page.locator('#chart').boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    assert.match(await text('readout'), /Hz.*(dB|silence)/)

    await page.locator('#settings').click()
    const before = await pixels()
    await page.locator('#palette').selectOption('lagoon'); await page.waitForTimeout(100); const lagoon = await pixels(); assert.notEqual(lagoon, before)
    await page.locator('#align').selectOption('0'); await page.waitForTimeout(100); assert.notEqual(await pixels(), lagoon)
    for (const scale of ['mel', 'erb', 'lin', 'log']) { await page.locator('#scale').selectOption(scale); assert.equal(await page.locator('#low').inputValue(), scale === 'log' ? '20' : '0') }
    await page.locator('#close-settings').click(); await page.locator('#voice-band').click(); await page.locator('#settings').click()
    assert.deepEqual([await page.locator('#low').inputValue(), await page.locator('#high').inputValue()], ['80', '4000'])
    await change('low', '5000'); assert.match(await text('error'), /below high/)
    await change('low', '100'); assert.equal(await page.locator('#error').isHidden(), true)
    await change('floor', '10'); assert.match(await text('error'), /below the top/)
    await change('floor', '-90'); assert.equal(await page.locator('#error').isHidden(), true)
    await page.locator('#fft').selectOption('1024'); await wait('FFT 1024')
    await page.locator('#close-settings').click()
    await page.locator('#chart').focus(); await page.keyboard.press('Home')
    assert.deepEqual([await page.locator('#low').inputValue(), await page.locator('#high').inputValue()], ['20', '24000'])
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -200); await page.waitForTimeout(50)
    assert.ok(+(await page.locator('#high').inputValue()) < 24000, 'wheel zooms the band')

    await page.locator('#source').selectOption('chord'); await wait('Chords')
    // Decode a real mono WAV at another rate; the band follows its Nyquist
    const bytes = Buffer.alloc(44 + 8000 * 2); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(16000, 40)
    for (let i = 0; i < 8000; i++) bytes.writeInt16LE(Math.sin(i * Math.PI / 4) * 16000, 44 + i * 2)
    await page.locator('#file').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: bytes }); await wait('tone.wav')
    const rate = +(await text('status')).match(/([\d.]+) kHz/)[1] * 1000
    assert.equal(+(await page.locator('#high').inputValue()), rate / 2)
    await page.locator('#file').setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('not audio') })
    await page.waitForFunction(() => !document.getElementById('error').hidden); assert.match(await text('status'), /tone.wav/)
    await page.locator('#settings').click(); await page.locator('[type=reset]').click(); await wait('Frequency sweep')
    assert.equal(await page.locator('#error').isHidden(), true)
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 850 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.locator('#settings').click(); await page.locator('#settings').click()
    }
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
