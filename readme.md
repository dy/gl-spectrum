# gl-spectrum [![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

Spectrum rendering component.

[![Spectrum](https://raw.githubusercontent.com/audio-lab/gl-spectrum/gh-pages/preview.png "Spectrum")](http://audio-lab.github.io/gl-spectrum/)

* [Colormaps](https://github.com/bpostlethwaite/colormap).
* _Bars_, _dots_ or _line_ styles.
* Symmetrical mode.
* [A-weighting](https://github.com/audio-lab/a-weighting).
* FPS 60.
* Frequency / decibels ranges.
* Logarithmic / linear scale.
* Customizable [grid](https://github.com/dfcreative/plot-grid).


## Usage

[![npm install gl-spectrum](https://nodei.co/npm/gl-spectrum.png?mini=true)](https://npmjs.org/package/gl-spectrum/)

```js
var Spectrum = require('gl-spectrum');

var spectrum = new Spectrum({
	container: document.body,
	canvas: canvas,
	context: 'webgl',

	//decibels data, -100...0
	frequencies: frequenciesData,

	//magnitude range to show
	maxDecibels: -30,
	minDecibels: -100,

	//frequency range
	maxFrequency: 20000,
	minFrequency: 20,
	sampleRate: 44100,

	//show logarithmic frequencies
	logarithmic: true,

	smoothing: 0.5,

	//draw frequency/decibels grid
	grid: true,
	gridAxes: false,

	//colormap name or array of colors, e. g. [[255, 255, 255, 1], [255, 0, 0, 1]]
	colormap: 'jet',
	colormapInverse: false,

	//place spectrum at the center
	symmetrical: false,

	//WIP shadow frequencies
	shadow: [],

	//mask defines the style of bars, dots or a line
	mask: 'bars',

	//perceptual loudness weighting, 'a', 'b', 'c', 'd', 'itu' or 'z' (see a-weighting)
	weighting: 'itu'
});

//pass db frequencies in -100...0 range
spectrum.setFrequencies(frequencies);
spectrum.setColormap(colors);
```

## Related

* [colormap](https://github.com/bpostlethwaite/colormap) — list of js color maps.
* [cli-visualizer](https://github.com/dpayne/cli-visualizer) — C++ spectrum visualizer.
* []