var test = require('tst');
var Spectrum = require('./');
// var Formant = require('audio-formant');
// var Speaker = require('audio-speaker');
// var Sink = require('audio-sink');
// var Slice = require('audio-slice');
var ft = require('fourier-transform');
var isBrowser = require('is-browser');
var SCBadge = require('soundcloud-badge');
var Analyser = require('web-audio-analyser');


//stream soundcloud
var audio = new Audio;
var badge = SCBadge({
	client_id: '6b7ae5b9df6a0eb3fcca34cc3bb0ef14'
	, song: 'https://soundcloud.com/einmusik/einmusik-live-watergate-4th-may-2016'
	, dark: false
	, getFonts: false
}, function(err, src, data, div) {
	if (err) throw err;

	//TODO: read url from href here
	audio.src = src;//'https://api.soundcloud.com/tracks/263762161/stream?client_id=6b7ae5b9df6a0eb3fcca34cc3bb0ef14';
	audio.crossOrigin = 'Anonymous';
	audio.addEventListener('canplay', function() {
		audio.play();
	}, false);
});

var analyser = Analyser(audio, { audible: true, stereo: false })



//generate input sine
var N = 4096;
var sine = new Float32Array(N);
var saw = new Float32Array(N);
var noise = new Float32Array(N);
var rate = 44100;

for (var i = 0; i < N; i++) {
	sine[i] = Math.sin(50 * Math.PI * 2 * (i / rate));
	saw[i] = 2 * ((1000 * i / rate) % 1) - 1;
	noise[i] = Math.random() * 2 - 1;
}

//normalize browser style
if (isBrowser) {
	document.body.style.margin = '0';
	document.body.style.boxSizing = 'border-box';
}



test('linear classics', function () {
	// var frequencies = new Float32Array(ft(sine));
	// var frequencies = new Float32Array(1024).fill(0.5);
	var frequencies = new Float32Array(analyser.analyser.frequencyBinCount);

	var spectrum = new Spectrum({
		gridAxes: false,
		frequencies: frequencies,
		minFrequency: 40,
		// logarithmic: false
		// viewport: function (w, h) {
		// 	return [50,20,w-70,h-60];
		// }
	}).on('render', function () {
		analyser.analyser.getFloatFrequencyData(frequencies);
		frequencies = frequencies.map(function (v) {
			return (100 + v) / 100;
		});
		spectrum.setTexture({frequencies: frequencies});
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

