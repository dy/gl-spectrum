var test = require('tst');
var Spectrum = require('./');
var Formant = require('audio-formant');
var Speaker = require('audio-speaker');
var Sink = require('audio-sink');
var Slice = require('audio-slice');
var ft = require('fourier-transform');
var isBrowser = require('is-browser');

var N = 4096;
var sine = new Float32Array(N);
var saw = new Float32Array(N);
var noise = new Float32Array(N);
var rate = 44100;

for (var i = 0; i < N; i++) {
	sine[i] = Math.sin(2000 * Math.PI * 2 * (i / rate));
	saw[i] = 2 * ((2000 * i / rate) % 1) - 1;
	noise[i] = Math.random() * 2 - 1;
}

if (isBrowser) {
	document.body.style.margin = '0';
	document.body.style.boxSizing = 'border-box';
}

test('linear classics', function () {
	var frequencies = ft(sine);

	var spectrum = new Spectrum({
		// container: el,
		frequencies: new Float32Array(frequencies),
		viewport: function (w, h) {
			return [30,0,w-30,h-20];
		}
	});
});

test('log scale', function () {

});

test.skip('streaming', function () {
	var spectrum = new Spectrum({

	});

	Formant([1/1000, 1, 1, 0.5])
	.on('data', function (buffer) {
		spectrum.setFrequencies(buffer)
	})
	.pipe(Slice(1))
	.pipe(Sink());
});

test.skip('2d', function () {

});

test.skip('node', function () {

});


test.skip('viewport', function () {

});


test('clannels');

test('classic');

test('bars');

test('bars line');

test('dots');

test('dots line');

test('colormap (heatmap)');

test('multilayered (max values)');

test('line');

test('oscilloscope');

