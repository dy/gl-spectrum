var test = require('tst');
var Spectrum = require('./');
var Formant = require('audio-formant');
var Speaker = require('audio-speaker');
var Sink = require('audio-sink');
var Slice = require('audio-slice');

test('simple', function () {
	var data = new Float32Array([0, 0, 0.5, 1,
								0.4, 0.5, 0.5, 0.3,
								0.5, 0.2, 0, 0,
								0, 0, 0, 0]);

	var spectrum = new Spectrum({
		frequencies: data
	});
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