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
	axes: false,

	//The levels of magnitude/frequency.
	//A colormap name, colormap, pixels array, imageData, imageElement or canvas
	fill: null,

	//undefined background takes the 0-level of the fill
	background: null,

	//0 - place at the bottom, .5 - place symmetrically, 1. - place at the top
	align: 0,

	//WIP shadow frequencies
	shadow: [],

	//snap magnitude to step. Number.
	snap: null,

	//defines the width or style of bars. A number (for width), image, imageData or canvasElement.
	mask: null,

	//perceptual loudness weighting, 'a', 'b', 'c', 'd', 'itu' or 'z' (see a-weighting)
	weighting: 'itu'
});

//pass db frequencies in -100...0 range
spectrum.setFrequencies(frequencies);
spectrum.setFill(colors, inverse?);
spectrum.setMask(mask);

//update state according to the params
spectrum.update();
```

## Related

* [colormap](https://github.com/bpostlethwaite/colormap) — list of js color maps.
* [cli-visualizer](https://github.com/dpayne/cli-visualizer) — C++ spectrum visualizer.