# gl-spectrum [![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

Spectrum rendering component.

[![Spectrum](https://raw.githubusercontent.com/audio-lab/gl-spectrum/gh-pages/preview.png "Spectrum")](http://audio-lab.github.io/gl-spectrum/)

## Usage

[![npm install gl-spectrum](https://nodei.co/npm/gl-spectrum.png?mini=true)](https://npmjs.org/package/gl-spectrum/)

```js
var Spectrum = require('gl-spectrum');

var spectrum = new Spectrum({
	container: document.body,

	//pass existing canvas or it will be created
	canvas: canvas,
	context: 'webgl',

	//evenly distributed within indicated diapasone
	data: frequencies,

	maxDecibels: 0,
	minDecibels: -90,

	maxFrequency: 20000,
	minFrequency: 20,

	//to detect resolution frequency
	sampleRate: 44100,
	logarithmic: true,

	smoothing: 0.2,

	grid: true,
	gridAxes: false,

	style: 'classic',
	backgroundColor: [0,0,0,1],
	//todo: replace this with color map or texture
	fillColor: [100,100,100,255],
	lineColor: [100,100,100,255],
	maxColor: [100,100,100,255],
	lineWidth: 1
});

//update spectrum data
spectrum.setData(frequencies);

//render spectrum data
spectrum.draw();
```

## Styles

### `classic`

