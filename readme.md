# gl-spectrum [![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

Spectrum rendering component with webgl or context2d.

[![Spectrum](https://raw.githubusercontent.com/audio-lab/gl-spectrum/gh-pages/preview.png "Spectrum")](http://audio-lab.github.io/gl-spectrum/)


## Usage

[![npm install gl-spectrum](https://nodei.co/npm/gl-spectrum.png?mini=true)](https://npmjs.org/package/gl-spectrum/)

```js
var Spectrum = require('gl-spectrum');

var spectrum = new Spectrum({
	container: document.body,

	//if undefined, new canvas will be created
	canvas: null,

	//existing webgl-context and some context options
	context: null,
	alpha: false,

	//enable render on every frame, disable for manual rendering
	autostart: true,

	//visible range
	maxDb: 0,
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

	//smooth series of data
	smoothing: 0.75,

	//0 - bottom, .5 - symmetrically, 1. - top
	align: 0,

	//peak highlight balance
	balance: .5,

	//display max value trail
	trail: true,

	//style of rendering: line, bar or fill
	type: 'line',

	//width of the bar, applicable only in bar mode
	barWidth: 2,

	//colormap for the levels of magnitude. Can be a single color for flat fill.
	palette: ['black', 'white'],

	//by default transparent, to draw waveform
	background: null,

	//pan and zoom to show detailed view
	interactions: false
});

//pass values in decibels (-100...0 range)
spectrum.set(magnitudes);

//update style/options
spectrum.update(options);

//hook up every data set
spectrum.on('data', (magnitudes, trail) => {});

//for manual mode of rendering you may want to call this whenever you feel right
spectrum.render();
spectrum.draw();
```


## Related

* [gl-waveform](https://github.com/audio-lab/gl-waveform)
* [gl-spectrogram](https://github.com/audio-lab/gl-spectrogram)
* [a-weighting](https://github.com/audio-lab/a-weighting) — perception loudness weighting for audio.
* [colormap](https://github.com/bpostlethwaite/colormap) — list of js color maps.
* [cli-visualizer](https://github.com/dpayne/cli-visualizer) — C++ spectrum visualizer.
* [spectrum](https://github.com/mattdesl/spectrum) by mattdesl
