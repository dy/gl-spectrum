// var test = require('tst');
// var Formant = require('audio-formant');
// var Speaker = require('audio-speaker');
// var Sink = require('audio-sink');
// var Slice = require('audio-slice');
var Spectrum = require('./');
var ft = require('fourier-transform');
var blackman = require('scijs-window-functions/blackman-harris');
var isBrowser = require('is-browser');
var SCBadge = require('soundcloud-badge');
var Analyser = require('web-audio-analyser');
var Stats = require('stats.js');
var db = require('decibels');
var colorScales = require('colormap/colorScales');
var tap = require('tap-to-start');



tap({
	background: '#2F0F3E',
	foreground: '#E86F56'
}, startEverything);


function startEverything () {
	var stats = new Stats();
	stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
	document.body.appendChild( stats.dom );
	stats.begin();
	stats.dom.style.left = 'auto';
	stats.dom.style.right = '1rem';
	stats.dom.style.top = '1rem';


	//stream soundcloud
	var audio = new Audio;

	try {
	var badge = SCBadge({
		client_id: '6b7ae5b9df6a0eb3fcca34cc3bb0ef14',
		// song: 'https://soundcloud.com/compost/cbls-362-compost-black-label-sessions-tom-burclay',
		// song: 'https://soundcloud.com/vertvrecords/trailer-mad-rey-hotel-la-chapelle-mp3-128kbit-s',
		song: 'https://soundcloud.com/wooded-events/wooded-podcast-cinthie',
		// song: 'https://soundcloud.com/einmusik/einmusik-live-watergate-4th-may-2016',
		// song: 'https://soundcloud.com/when-we-dip/atish-mark-slee-manjumasi-mix-when-we-dip-062',
		// song: 'https://soundcloud.com/dark-textures/dt-darkambients-4',
		// song: 'https://soundcloud.com/deep-house-amsterdam/diynamic-festival-podcast-by-kollektiv-turmstrasse',
		dark: false,
		getFonts: false
	}, function(err, src, data, div) {
		if (err) throw err;

		//TODO: read url from href here
		audio.src = src;
		audio.crossOrigin = 'Anonymous';
		audio.addEventListener('canplay', function() {
			audio.play();
		}, false);
	});
	} catch (e) {
		//IE of course...
	}



	var analyser = Analyser(audio, { audible: true, stereo: false })


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

	//normalize browser style
	if (isBrowser) {
		document.body.style.margin = '0';
		document.body.style.boxSizing = 'border-box';
		document.body.style.fontFamily = 'sans-serif';
	}


	// var frequencies = ft(sine);
	// var frequencies = new Float32Array(1024).fill(0.5);
	// var frequencies = ft(noise);
	var frequencies = new Float32Array(analyser.analyser.frequencyBinCount).fill(-150);

	frequencies = frequencies
	// .map((v, i) => v*blackman(i, noise.length))
	.map((v) => db.fromGain(v));

	var spectrum = new Spectrum({
		// autostart: false,
		frequencies: frequencies,
		fill: 'cdom',
		grid: true,
		minFrequency: 40,
		maxFrequency: 20000,
		logarithmic: true,
		smoothing: .5,
		details: 1,
		maxDecibels: 0,
		mask: createMask(10, 10),
		align: .5,
		trail: 38,
		// balance: .5,
		// antialias: true,
		// fill: [1,1,1,0],
		// fill: './images/stretch.png',
		group: 6,
		// background: [27/255,0/255,37/255, 1],
		//background: [1,0,0,1]//'./images/bg-small.jpg'
		// viewport: function (w, h) {
		// 	return [50,20,w-70,h-60];
		// }
	}).on('render', function () {
		stats.end();
		stats.begin();

		// analyser.analyser.getFloatTimeDomainData(waveform);
		// frequencies = ft(waveform.map((v, i) => v*blackman(i, waveform.length)));
		// frequencies = frequencies.map((f, i) => db.fromGain(f));

		analyser.analyser.getFloatFrequencyData(frequencies);

		spectrum.setFrequencies(frequencies);
	});

	createColormapSelector(spectrum);
};


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
	var container = document.createElement('div');
	container.style.position = 'fixed';
	container.style.bottom = '0';
	container.style.left = '0';
	container.style.right = '0';
	container.style.padding = '.5rem';
	container.style.border = '0';
	container.style.zIndex = 999;
	document.body.appendChild(container);

	//append style switcher
	var switcher = document.createElement('select');
	switcher.classList.add('colormap');
	switcher.style.width = '4rem';
	switcher.style.color = 'inherit';
	switcher.style.fontSize = '.8rem';
	switcher.style.border = '0';
	switcher.style.background = 'none';
	switcher.title = 'Colormap';
	var html = '';
	for (var name in colorScales ) {
		if (name === 'alpha') continue;
		html += `<option value="${name}"${(name === 'cdom') ? 'selected' : ''}>${name}</option>`
	}
	switcher.innerHTML = html;
	switcher.addEventListener('input', function () {
		spectrum.setFill(switcher.value, inverseCheckbox.checked);
		updateView();
	});
	container.appendChild(switcher);


	//inversed colormap checkbox
	var inverseSwitch = createSwitch('inversed', function () {
		spectrum.setFill(switcher.value, this.checked);
		updateView();
	});
	var inverseCheckbox = inverseSwitch.querySelector('input');
	container.appendChild(inverseSwitch);


	//weighting switcher
	var weightingEl = document.createElement('select');
	weightingEl.classList.add('weighting');
	weightingEl.style.width = '4rem';
	weightingEl.style.border = '0';
	weightingEl.style.color = 'inherit';
	weightingEl.style.marginLeft = '1rem';
	weightingEl.style.background = 'none';
	weightingEl.title = 'Noise weighting';
	weightingEl.innerHTML = `
		<option value="a">A</option>
		<option value="b">B</option>
		<option value="c">C</option>
		<option value="d">D</option>
		<option value="itu" selected>ITU</option>
		<option value="z">Z (none)</option>
	`;
	weightingEl.addEventListener('input', function () {
		spectrum.weighting = weightingEl.value;

		updateView();
	});
	container.appendChild(weightingEl);


	//logarithmic
	var logSwitch = createSwitch('log', function () {
		spectrum.logarithmic = this.checked;
		updateView();
	});
	var logCheckbox = logSwitch.querySelector('input');
	logCheckbox.checked = true;
	container.appendChild(logSwitch);


	//align slider
	var alignEl = createSlider('align', function (v) {
		spectrum.align = v;
		updateView();
	});
	container.appendChild(alignEl);


	//grid colormap checkbox
	var gridSwitch = createSwitch('grid', function () {
		spectrum.grid = this.checked;
		updateView();
	});
	var gridCheckbox = gridSwitch.querySelector('input');
	gridCheckbox.checked = spectrum.grid;
	container.appendChild(gridSwitch);


	//mask checkbox
	var maskSwitch = createSwitch('mask', function () {
		spectrum.setMask(this.checked ? createMask(10, 10) : null);
		updateView();
	});
	var maskSwitch = gridSwitch.querySelector('input');
	maskSwitch.checked = spectrum.grid;
	container.appendChild(
		maskSwitch
	);

	//group size
	var groupEl = createSlider({name: 'group', min: 0, max: 50, step: 1, value: spectrum.group}, function (v) {
		spectrum.group = v;
		updateView();
	});
	container.appendChild(groupEl);


	//trail slider
	var trailEl = createSlider({
		min: 0,
		max: 50,
		value: spectrum.trail,
		name: 'trail'
	}, function (v) {
		spectrum.trail = v;
		updateView();
	});
	container.appendChild(trailEl);

	updateView();

	function updateView () {
		spectrum.update();
		if (Array.isArray(spectrum.fill)) {
			container.style.color = 'rgb(' + spectrum.fill.slice(-4, -1).map((v) => v*255).join(', ') + ')';
		}
	}
}



function createSwitch (name, cb) {
	var switcher = document.createElement('label');
	switcher.innerHTML = `
		<input type="checkbox" id="${name}"/>
		${name}
	`;
	checkbox = switcher.querySelector('input');
	checkbox.setAttribute('type', 'checkbox');
	checkbox.style.width = '1rem';
	checkbox.style.height = '1rem';
	checkbox.style.verticalAlign = 'middle';

	switcher.style.fontSize = '.8rem';
	switcher.style.verticalAlign = 'middle';
	switcher.style.height = '1rem';
	switcher.classList.add(name + '-switcher');
	switcher.style.margin = '0 0 0 .5rem';
	switcher.style.border = '0';
	switcher.style.background = 'none';
	switcher.style.color = 'inherit';
	switcher.title = name;
	checkbox.addEventListener('click', cb);

	return switcher;
}


function createSlider (opts, cb) {
	opts = (typeof opts === 'string') ? {name: opts} : opts ? opts : {};
	var sliderEl = document.createElement('input');
	var title = opts.name.slice(0,1).toUpperCase() + opts.name.slice(1);
	sliderEl.type = 'range';
	sliderEl.min = opts.min || 0;
	sliderEl.max = opts.max || 1;
	sliderEl.step = opts.step || 0.01;
	sliderEl.value = opts.value || 0.5;
	sliderEl.classList.add(opts.name);
	sliderEl.style.width = '5rem';
	sliderEl.style.height = '1rem';
	sliderEl.style.border = '0';
	sliderEl.style.color = 'inherit';
	sliderEl.style.margin = '0 0 0 1rem';
	sliderEl.style.verticalAlign = 'middle';
	sliderEl.style.background = 'none';
	sliderEl.title = title + ': ' + sliderEl.value;
	sliderEl.addEventListener('input', function () {
		var v = parseFloat(sliderEl.value);
		sliderEl.title = title + ': ' + v;
		cb(v);
	});
	return sliderEl;
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
