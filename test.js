// var test = require('tst');
// var Formant = require('audio-formant');
// var Speaker = require('audio-speaker');
// var Sink = require('audio-sink');
// var Slice = require('audio-slice');
var Spectrum = require('./2d');
var ft = require('fourier-transform');
var blackman = require('scijs-window-functions/blackman-harris');
var isBrowser = require('is-browser');
var db = require('decibels');
var colorScales = require('colormap/colorScales');
var startApp = require('start-app');
var ctx = require('audio-context');
var isMobile = require('is-mobile')();
// var createAudioContext = require('ios-safe-audio-context')


var app = startApp({
	context: ctx,
	color: '#E86F56',
	token: '6b7ae5b9df6a0eb3fcca34cc3bb0ef14',
	// source: './Liwei.mp3',
	// source: 'https://soundcloud.com/wooded-events/wooded-podcast-cinthie',
	// source: 'https://soundcloud.com/compost/cbls-362-compost-black-label-sessions-tom-burclay',
	// source: isMobile ? './sample.mp3' : 'https://soundcloud.com/vertvrecords/trailer-mad-rey-hotel-la-chapelle-mp3-128kbit-s',
	source: isMobile ? './sample.mp3' : 'https://soundcloud.com/crossingsofficial/podcast-023-sam-pauli',
	params: true,
	github: 'audio-lab/gl-spectrum',
	history: false,
	// source: 'https://soundcloud.com/einmusik/einmusik-live-watergate-4th-may-2016',
	// source: 'https://soundcloud.com/when-we-dip/atish-mark-slee-manjumasi-mix-when-we-dip-062',
	// source: 'https://soundcloud.com/dark-textures/dt-darkambients-4',
	// source: 'https://soundcloud.com/deep-house-amsterdam/diynamic-festival-podcast-by-kollektiv-turmstrasse',
});

var source = null;
var analyser = ctx.createAnalyser();
analyser.smoothingTimeConstant = .1;
analyser.connect(ctx.destination);

app.on('source', function (node) {
	source = node;
	source.connect(analyser);
});


//generate input sine
var N = 2048;
var sine = new Float32Array(N);
var saw = new Float32Array(N);
var noise = new Float32Array(N);
var rate = 44100;

for (var i = 0; i < N; i++) {
	sine[i] = Math.sin(10000 * Math.PI * 2 * (i / rate));
	saw[i] = 2 * ((1000 * i / rate) % 1) - 1;
	noise[i] = Math.random() * 2 - 1;
}

// var frequencies = ft(sine);
// var frequencies = new Float32Array(1024).fill(0.5);
// var frequencies = ft(noise);
//NOTE: ios does not allow setting too big this value
analyser.fftSize = 1024;
var frequencies = new Float32Array(analyser.frequencyBinCount);
// for (var i = 0; i < frequencies.length; i++) frequencies[i] = -150;

frequencies = frequencies
.map((v, i) => v*blackman(i, N))
.map((v) => db.fromGain(v));

var colormaps = [];
for (var name in colorScales) {
	if (name === 'alpha') continue;
	if (name === 'hsv') continue;
	if (name === 'rainbow') continue;
	if (name === 'rainbow-soft') continue;
	if (name === 'phase') continue;
	colormaps.push(name);
}
var colormap = colormaps[(Math.random() * colormaps.length) | 0];

var spectrum = new Spectrum({
	// autostart: false,
	// magnitudes: frequencies,
	fill: colormap,
	grid: true,
	minFrequency: 40,
	maxFrequency: 20000,
	logarithmic: true,
	// smoothing: .7,
	details: 1,
	maxDecibels: 0,
	mask: createMask(10, 10),
	align: .5,
	trail: 38,
	// autostart: false,
	// balance: .5,
	// antialias: true,
	// fill: [1,1,1,0],
	// fill: './images/stretch.png',
	group: 6,
	type: 'bar',
	width: 3,
	// background: [27/255,0/255,37/255, 1],
	//background: [1,0,0,1]//'./images/bg-small.jpg'
	// viewport: function (w, h) {
	// 	return [50,20,w-70,h-60];
	// }
}).on('render', function () {
	// frequencies = ft(waveform.map((v, i) => v*blackman(i, waveform.length)));
	// frequencies = frequencies.map((f, i) => db.fromGain(f));

	analyser.getFloatFrequencyData(frequencies);
	spectrum.setFrequencyData(frequencies);
});

spectrum.render();

createColormapSelector(spectrum);


// test('line webgl');

// test('bars 2d');

// test('node');

// test('viewport');

// test('clannels');

// test('classic');

// test('bars');

// test('bars line');

// test('dots');

// test('dots line');

// test('colormap (heatmap)');

// test('multilayered (max values)');

// test('line');

// test('oscilloscope');




function createColormapSelector (spectrum) {
	app.addParam('colormap', {
		values: colormaps,
		value: colormap,
		change: (value, state) => {
			spectrum.setFill(value, app.getParamValue('inversed'));
			updateView();
		}
	});

	app.addParam('type', {
		values: ['line', 'bar', 'fill'],
		value: spectrum.type,
		change: (value, state) => {
			spectrum.type = value;
			updateView();
		}
	});


	//inversed colormap checkbox
	app.addParam('inversed', {
		value: false,
		change: (value) => {
			spectrum.setFill(app.getParamValue('colormap'), value);
			updateView();
		}
	});


	//weighting switcher
	app.addParam('weighting', {
		values: {
			A: 'a',
			B: 'b',
			C: 'c',
			D: 'd',
			ITU: 'itu',
			Z: 'z'
		},
		value: spectrum.weighting,
		change: (value) => {
			spectrum.weighting = value;
			updateView();
		}
	});


	//logarithmic
	app.addParam('log', {
		value: spectrum.logarithmic,
		change: (v) => {
			spectrum.logarithmic = v;
			updateView();
		}
	});

	app.addParam('align', spectrum.align, (v) => {
		spectrum.align = v;
		updateView();
	});

	app.addParam('grid', spectrum.grid, (v) => {
		spectrum.grid = v;
		updateView();
	});

	app.addParam('mask', !!spectrum.mask, (v) => {
		spectrum.setMask(v ? createMask(10, 10) : null);
		updateView();
	});

	app.addParam('group', {
		min: 0,
		max: 50,
		step: 1,
		value: spectrum.group
	}, (v) => {
		spectrum.group = v;
		updateView();
	});

	app.addParam('trail', {
		min: 0,
		max: 50,
		step: 1,
		value: spectrum.trail
	}, (v) => {
		spectrum.trail = parseFloat(v);
		updateView();
	});

	app.addParam('smoothing',
		spectrum.smoothing,
		(v) => {
			spectrum.smoothing = v;
			updateView();
	});


	updateView();

	function updateView () {
		spectrum.update();
		if (Array.isArray(spectrum.fillData)) {
			app.setColor('rgb(' + spectrum.fillData.slice(-4, -1).join(', ') + ')');
		}
	}
}



//create mask
function createMask (w, h) {
	w = w || 10;
	h = h || 10;
	var rect = [w, h];
	var radius = w/1.5;
	var canvas = document.createElement('canvas');
	canvas.width = rect[0] + 2;
	canvas.height = rect[1] + 2;
	var ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, rect[0] + 2, rect[1] + 2);
	ctx.fillStyle = 'rgb(0,0,0)';
	ctx.fillRect(0, 0, rect[0] + 2, rect[1] + 2);
	ctx.strokeStyle = 'rgb(255,255,255)';
	ctx.fillStyle = 'rgb(255,255,255)';
	ctx.lineJoin = 'round';
	ctx.lineWidth = radius;
	ctx.strokeRect(1 + (radius/2), 1 + (radius/2), rect[0]-radius - 1, rect[1]-radius - 1);
	ctx.fillRect(1 + (radius/2), 1 + (radius/2), rect[0]-radius - 1, rect[1]-radius - 1);

	// document.body.appendChild(canvas);
	// canvas.style.zIndex = 999;
	// canvas.style.position = 'absolute';
	// canvas.style.top = '0px';
	// canvas.style.left = '0px';

	return canvas;
}
