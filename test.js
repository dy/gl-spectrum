var test = require('tst');
var Spectrum = require('./');
// var Formant = require('audio-formant');
// var Speaker = require('audio-speaker');
// var Sink = require('audio-sink');
// var Slice = require('audio-slice');
var ft = require('fourier-transform');
var blackman = require('scijs-window-functions/blackman');
var isBrowser = require('is-browser');
var SCBadge = require('soundcloud-badge');
var Analyser = require('web-audio-analyser');
var Stats = require('stats.js');
var db = require('decibels');


var stats = new Stats();
stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild( stats.dom );
stats.begin();
stats.dom.style.left = 'auto';
stats.dom.style.right = '1rem';
stats.dom.style.top = '1rem';


//stream soundcloud
var audio = new Audio;
/*
var badge = SCBadge({
	client_id: '6b7ae5b9df6a0eb3fcca34cc3bb0ef14',
	// song: 'https://soundcloud.com/einmusik/einmusik-live-watergate-4th-may-2016',
	// song: 'https://soundcloud.com/when-we-dip/atish-mark-slee-manjumasi-mix-when-we-dip-062',
	// song: 'https://soundcloud.com/dark-textures/dt-darkambients-4',
	song: 'https://soundcloud.com/deep-house-amsterdam/diynamic-festival-podcast-by-kollektiv-turmstrasse',
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
*/

var analyser = Analyser(audio, { audible: true, stereo: false })



//generate input sine
var N = 4096;
var sine = new Float32Array(N);
var saw = new Float32Array(N);
var noise = new Float32Array(N);
var rate = 44100;

for (var i = 0; i < N; i++) {
	sine[i] = Math.sin(4000 * Math.PI * 2 * (i / rate));
	saw[i] = 2 * ((1000 * i / rate) % 1) - 1;
	noise[i] = Math.random() * 2 - 1;
}

//normalize browser style
if (isBrowser) {
	document.body.style.margin = '0';
	document.body.style.boxSizing = 'border-box';
	document.body.style.fontFamily = 'sans-serif';

}


test.skip('line webgl', function () {
	var frequencies = ft(noise.map((v, i) => v*blackman(i, noise.length)))
	.map((v) => db.fromGain(v));
	// var frequencies = new Float32Array(1024).fill(0.5);
	// var frequencies = new Float32Array(analyser.analyser.frequencyBinCount);
	// var waveform = new Float32Array(analyser.analyser.fftSize);
	// var waveform = new Float32Array(sine);
	var busy = false;

	var spectrum = new Spectrum({
		frequencies: frequencies,
		// colormap: [1,1,1,1, 0,0,0,1],
		minFrequency: 40,
		logarithmic: true,
		smoothing: .5,
		maxDecibels: 0,
		// viewport: function (w, h) {
		// 	return [50,20,w-70,h-60];
		// }
	}).on('render', function () {
		stats.end();
		stats.begin();

		// analyser.analyser.getFloatTimeDomainData(waveform);

		// analyser.analyser.getFloatFrequencyData(frequencies);
		// frequencies = ft(waveform.map((v, i) => v*blackman(i, waveform.length)));
		// frequencies = frequencies.map((f, i) => db.fromGain(f));

		// spectrum.setFrequencies(frequencies);
	});

	createColormapSelector(spectrum);
});

test.only('bars 2d', function () {
	// var frequencies = new Float32Array(ft(sine));
	// var frequencies = new Float32Array(1024).fill(0.5);
	// var frequencies = new Float32Array(analyser.analyser.frequencyBinCount);

	var frequencies = ft(noise.map((v, i) => v*blackman(i, noise.length)))
	.map((v) => db.fromGain(v));

	var spectrum = new Spectrum({
		frequencies: frequencies,
		maxDecibels: 0,
		// style: 'bars',
		grid: false,
		// colormap: [255,255,255,1, 255,0,0,1],
		logarithmic: true
	}).on('render', function () {
		stats.end();
		stats.begin();
		// analyser.analyser.getFloatFrequencyData(frequencies);
		// frequencies = frequencies.map(function (v) {
		// 	return Math.max((100 + v) / 100, 0);
		// });
		// spectrum.setFrequencies(frequencies);
	});

	createColormapSelector(spectrum);
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




function createColormapSelector (spectrum) {
	var container = document.createElement('div');
	container.style.position = 'fixed';
	container.style.bottom = '0';
	container.style.left = '0';
	container.style.right = '0';
	container.style.padding = '.5rem';
	container.style.border = '0';
	document.body.appendChild(container);

	//append style switcher
	var switcher = document.createElement('select');
	switcher.classList.add('colormap');
	switcher.style.width = '4rem';
	switcher.style.color = 'inherit';
	switcher.style.border = '0';
	switcher.style.background = 'none';
	switcher.innerHTML = `
		<option value="jet">jet</option>
		<option value="hsv">hsv</option>
		<option value="hot">hot</option>
		<option value="cool">cool</option>
		<option value="spring">spring</option>
		<option value="summer">summer</option>
		<option value="autumn">autumn</option>
		<option value="winter">winter</option>
		<option value="bone">bone</option>
		<option value="copper">copper</option>
		<option value="greys" selected>greys</option>
		<option value="yignbu">yignbu</option>
		<option value="greens">greens</option>
		<option value="yiorrd">yiorrd</option>
		<option value="bluered">bluered</option>
		<option value="rdbu">rdbu</option>
		<option value="picnic">picnic</option>
		<option value="rainbow">rainbow</option>
		<option value="portland">portland</option>
		<option value="blackbody">blackbody</option>
		<option value="earth">earth</option>
		<option value="electric">electric</option>
		<!--<option value="alpha">alpha</option>-->
	`;
	switcher.addEventListener('input', function () {
		spectrum.setColormap(switcher.value);
		updateView();
	});
	container.appendChild(switcher);


	//inversed colormap checkbox
	var checkbox = document.createElement('input');
	checkbox.classList.add('inversed');
	checkbox.setAttribute('type', 'checkbox');
	checkbox.style.margin = '0 0 0 .5rem';
	checkbox.style.width = '1rem';
	checkbox.style.height = '1rem';
	checkbox.style.border = '0';
	checkbox.style.background = 'none';
	checkbox.style.color = 'inherit';
	checkbox.style.verticalAlign = 'bottom';
	checkbox.title = 'Reverse colormap';
	checkbox.addEventListener('click', function () {
		spectrum.inverse = checkbox.checked;
		spectrum.setColormap(switcher.value);

		updateView();
	});
	container.appendChild(checkbox);


	//weighting switcher
	var weightingEl = document.createElement('select');
	weightingEl.classList.add('weighting');
	weightingEl.style.width = '4rem';
	weightingEl.style.border = '0';
	weightingEl.style.color = 'inherit';
	weightingEl.style.marginLeft = '1rem';
	weightingEl.style.background = 'none';
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


	updateView();

	function updateView () {
		spectrum.setFrequencies(spectrum.frequencies);
		container.style.color = 'rgb(' + spectrum.colormap.slice(-4, -1).map((v) => v*255).join(', ') + ')';
	}
}
