# @a-vis/spectrum [![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

Audio spectrum rendering custom element.

[![Spectrum](https://raw.githubusercontent.com/a-vis/spectrum/gh-pages/preview.png "Spectrum")](http://a-vis.github.io/spectrum/)


## Usage

[![npm install @a-vis/spectrum](https://nodei.co/npm/@a-vis/spectrum.png?mini=true)](https://npmjs.org/package/@a-vis/spectrum/)

### Custom Element

```html
<script src="//unpkg.com/@a-vis/spectrum"></script>
<script src="//unpkg.com/@a-vis/plot"></script>

<a-source></a-source>
<a-grid type="frequency"></a-grid>
<a-spectrum></a-spectrum>
```

### Class

```js
import Spectrum from '@a-vis/spectrum'

const spectrum = new Spectrum({
	// TODO: a bit weird to collapse decibels in symmetrical mode, that subrange can be done on data prep stage
	// maxDb: 0,
	// minDb: -100,

	//visible range
	maxFrequency: 20000,
	minFrequency: 20,
	sampleRate: 44100,

	//place frequencies logarithmically
	// TODO: there can be different types of logs, some are musical
	// instead would be fair to generalize data
	// log: true,

	//smooth series of data
	smoothing: 0.75,

	//0 - bottom, .5 - symmetrically, 1. - top
	verticalAlign: 0,

	//display max value trail, number for seconds
	trail: 1,

	//style of rendering: line, bar or fill
	type: 'line',

	//width of bar or line
	width: 2,

	//colormap for the levels of magnitude.
	// Can be a single color, list of colors or gradient strops {.1: a, .9:b}
	colormap: ['black', 'white'],
	//peak highlight balance
	// TODO: maybe replace alongside with palette with gradient?
	// even contrast is possible to be organized with colormap
	// peakHighlight: .5,

	//by default transparent, to draw waveform
	background: null,

	//pan and zoom to show detailed view
	interactions: false
})

document.body.appendChild(spectrum)

//pass values in decibels (-100...0 range)
spectrum.set(magnitudes)

// update options
spectrum.maxFrequency = 10000
spectrum.minFrequency = 100
```


## Related

* [gl-waveform](https://github.com/audio-lab/gl-waveform)
* [gl-spectrogram](https://github.com/audio-lab/gl-spectrogram)
* [a-weighting](https://github.com/audio-lab/a-weighting) — perception loudness weighting for audio.
* [colormap](https://github.com/bpostlethwaite/colormap) — list of js color maps.
* [cli-visualizer](https://github.com/dpayne/cli-visualizer) — C++ spectrum visualizer.
* [spectrum](https://github.com/mattdesl/spectrum) by mattdesl
* [audioMotion](https://github.com/hvianna/audioMotion.js/)
