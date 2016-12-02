# gl-spectrum [![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

Spectrum rendering component with webgl or context2d.

[![Spectrum](https://raw.githubusercontent.com/audio-lab/gl-spectrum/gh-pages/preview.png "Spectrum")](http://audio-lab.github.io/gl-spectrum/)


## Usage

[![npm install gl-spectrum](https://nodei.co/npm/gl-spectrum.png?mini=true)](https://npmjs.org/package/gl-spectrum/)

```js
var Spectrum = require('gl-spectrum');

var spectrum = new Spectrum({
	container: document.body,
	canvas: canvas,
	context: 'webgl',

	//visible range
	maxDb: -30,
	minDb: -100,
	maxFrequency: 20000,
	minFrequency: 20,
	sampleRate: 44100,

	//perceptual loudness weighting, 'a', 'b', 'c', 'd', 'itu' or 'z' (see a-weighting)
	weighting: 'itu',

	//display grid, can be an object with plot-grid settings
	grid: true,

	//place frequencies logarithmically
	log: true,

	//rendering settings
	smoothing: 0.5,

	//0 - bottom, .5 - symmetrically, 1. - top
	align: 0,

	//peak highlight balance
	balance: .5,

	//display max value trail for the all time.
	trail: true,

	//style of rendering: line, bar or fill
	type: 'line',

	//width of the bar, applicable only in bar mode
	barWidth: 2,

	//colormap for the levels of magnitude. Can be single color for flat fill.
	palette: ['black', 'white'],

	//by default transparent
	background: null
});

//pass db values (-100...0 range)
spectrum.set(magnitudes);

//update style/options
spectrum.update(options);
```

Canvas 2d version is available as `require('gl-spectrum/2d')`.

## Related

* [gl-waveform](https://github.com/audio-lab/gl-waveform)
* [gl-spectrogram](https://github.com/audio-lab/gl-spectrogram)
* [a-weighting](https://github.com/audio-lab/a-weighting) — perception loudness weighting for audio.
* [colormap](https://github.com/bpostlethwaite/colormap) — list of js color maps.
* [cli-visualizer](https://github.com/dpayne/cli-visualizer) — C++ spectrum visualizer.
* [spectrum](https://github.com/mattdesl/spectrum) by mattdesl
