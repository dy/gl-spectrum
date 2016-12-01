require('enable-mobile')
const Spectrum = require('./gl');
const isBrowser = require('is-browser');
const db = require('decibels');
const colormap = require('colormap');
const colorScales = require('colormap/colorScales');
const appAudio = require('../app-audio');
const ctx = require('audio-context');
const isMobile = require('is-mobile')();
const Color = require('tinycolor2');
const createFps = require('fps-indicator');
let palettes = require('nice-color-palettes');
// require('get-float-time-domain-data');


let colormaps = {};

for (var name in colorScales) {
	if (name === 'alpha') continue;
	if (name === 'hsv') continue;
	if (name === 'rainbow') continue;
	if (name === 'rainbow-soft') continue;
	if (name === 'phase') continue;

	colormaps[name] = colormap({
		colormap: colorScales[name],
		nshades: 16,
		format: 'rgbaString'
	});
	palettes.push(colormaps[name]);
}

palettes = palettes
//filter not readable palettes
.filter((palette) => {
	return Color.isReadable(palette[0], palette.slice(-1)[0], {
		level:"AA", size:"large"
	});
});


//show framerate
let fps = createFps();
// fps.element.style.color = theme.palette[0];
// fps.element.style.fontFamily = theme.fontFamily;
fps.element.style.fontWeight = 500;
fps.element.style.fontSize = '12px';
fps.element.style.marginTop = '1rem';
fps.element.style.marginRight = '1rem';



var analyser;
var audio = appAudio({
	context: ctx,
	color: '#E86F56',
	token: '6b7ae5b9df6a0eb3fcca34cc3bb0ef14',
	// source: './Liwei.mp3',
	source: 'https://soundcloud.com/wooded-events/wooded-podcast-cinthie',
	// source: 'https://soundcloud.com/compost/cbls-362-compost-black-label-sessions-tom-burclay',
	// source: isMobile ? './sample.mp3' : 'https://soundcloud.com/vertvrecords/trailer-mad-rey-hotel-la-chapelle-mp3-128kbit-s',
	// source: isMobile ? './sample.mp3' : 'https://soundcloud.com/robbabicz/rbabicz-lavander-and-the-firefly',
	// source: 'https://soundcloud.com/einmusik/einmusik-live-watergate-4th-may-2016',
	// source: 'https://soundcloud.com/when-we-dip/atish-mark-slee-manjumasi-mix-when-we-dip-062',
	// source: 'https://soundcloud.com/dark-textures/dt-darkambients-4',
	// source: 'https://soundcloud.com/deep-house-amsterdam/diynamic-festival-podcast-by-kollektiv-turmstrasse',
}).on('load', (node) => {
	analyser = audio.context.createAnalyser();
	analyser.smoothingTimeConstant = 0;
	analyser.fftSize = 1024;
	analyser.minDecibels = -100;
	analyser.maxDecibels = 0;

	node.disconnect();
	node.connect(analyser);
	analyser.connect(audio.context.destination);
});

// audio.element.style.fontFamily = theme.fontFamily;
// audio.element.style.fontSize = theme.fontSize;
// audio.update();




var spectrum = new Spectrum({
	autostart: true,
	align: .5,
	// fill: colormap,
	// grid: true,
	// minFrequency: 20,
	// maxFrequency: 20000,
	// logarithmic: true,
	// smoothing: .7,
	// maxDecibels: 0,
	// align: .5,
	// trail: 38,
	// autostart: false,
	// balance: .5,
	// antialias: true,
	// fill: [1,1,1,0],
	// fill: './images/stretch.png',
	// type: 'line',
	// width: 2,
	// weighting: 'z',
	// background: [27/255,0/255,37/255, 1],
	//background: [1,0,0,1]//'./images/bg-small.jpg'
	// viewport: function (w, h) {
	// 	return [50,20,w-70,h-60];
	// }
}).on('render', upd)



function upd () {
	if (!analyser) return;

	var dbMagnitudes = new Float32Array(analyser.frequencyBinCount);
	// dbMagnitudes = ft(waveform.map((v, i) => v*blackman(i, waveform.length)));
	// dbMagnitudes = dbMagnitudes.map((f, i) => db.fromGain(f));

	analyser.getFloatFrequencyData(dbMagnitudes);
	spectrum.set(dbMagnitudes);
}

// spectrum.render();

// createColormapSelector(spectrum);


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
	app.addParam('type', {
		values: ['line', 'bar', 'fill'],
		value: spectrum.type,
		change: (value, state) => {
			spectrum.type = value;
			updateView();
		}
	});

	app.addParam('colormap', {
		values: colormaps,
		value: colormap,
		change: (value, state) => {
			spectrum.setFill(value, app.getParamValue('inversed'));
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

	app.addParam('width', {
		min: 0.5,
		max: 150,
		step: .5,
		value: spectrum.width
	}, (v) => {
		spectrum.width = v;
		updateView();
	});

	app.addParam('trail', {
		min: 0,
		max: 100,
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


	app.addParams({
		minDecibels: {
			type: 'range',
			value: spectrum.minDecibels,
			min: -100,
			max: 0,
			change: (v) => {
				spectrum.minDecibels = v;
				updateView();
			}
		},
		maxDecibels: {
			type: 'range',
			value: spectrum.maxDecibels,
			min: -100,
			max: 0,
			change: (v) => {
				spectrum.maxDecibels = v;
				updateView();
			}
		},
		minFrequency: {
			type: 'range',
			value: spectrum.minFrequency,
			min: 0,
			max: 1000,
			change: (v) => {
				spectrum.minFrequency = v;
				updateView();
			}
		},
		maxFrequency: {
			type: 'range',
			value: spectrum.maxFrequency,
			min: 1000,
			max: spectrum.sampleRate / 2,
			change: (v) => {
				spectrum.maxFrequency = v;
				updateView();
			}
		}
	});


	updateView();

	function updateView () {
		spectrum.update();
		if (Array.isArray(spectrum.fillData)) {
			app.setColor('rgb(' + spectrum.fillData.slice(-4, -1).join(', ') + ')');
		}
	}
}
