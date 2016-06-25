/**
 * @module  gl-spectrum/lib/code
 */

var extend = require('xtend/mutable');
var Component = require('gl-component');
var inherits = require('inherits');
var lg = require('mumath/lg');
var isBrowser = require('is-browser');
var createGrid = require('plot-grid');
var colormap = require('colormap');
var flatten = require('flatten');
var clamp = require('mumath/clamp');
var weighting = require('a-weighting');

module.exports = Spectrum;


/**
 * @contructor
 */
function Spectrum (options) {
	if (!(this instanceof Spectrum)) return new Spectrum(options);

	var that = this;

	options = options || {};

	Component.call(this, options);

	if (isBrowser) {
		this.container.classList.add('gl-spectrum');
	}

	this.trailData = [];

	this.init();
	this.emit('init');

	this.update();
}

inherits(Spectrum, Component);

Spectrum.prototype.init = () => {};


Spectrum.prototype.maxDecibels = -30;
Spectrum.prototype.minDecibels = -100;

Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 20;

Spectrum.prototype.smoothing = 0.75;
Spectrum.prototype.details = 1;


Spectrum.prototype.grid = true;
Spectrum.prototype.axes = false;

Spectrum.prototype.logarithmic = true;

Spectrum.prototype.weighting = 'itu';

//required to detect frequency resolution
Spectrum.prototype.sampleRate = 44100;

//evenly distributed within indicated diapasone
Spectrum.prototype.frequencies = new Float32Array(512);
for (var i = 0; i < 512; i++) {Spectrum.prototype.frequencies[i] = Spectrum.prototype.minDecibels;};

//amount of alignment
Spectrum.prototype.align = .0;

//shadow frequencies, like averaged/max values
Spectrum.prototype.trail = 1;


/**
 * Set frequencies taking into account smoothing, logarithmic and grouping params
 */
Spectrum.prototype.setFrequencies = function (frequencies) {
	if (!frequencies) return this;

	this.gl.useProgram(this.program);

	var gl = this.gl;
	var minF = this.minFrequency, maxF = this.maxFrequency;
	var minDb = this.minDecibels, maxDb = this.maxDecibels;
	var halfRate = this.sampleRate * 0.5;
	var l = halfRate / this.frequencies.length;

	//choose bigger data
	var bigger = this.frequencies.length >= frequencies.length ? this.frequencies : frequencies;
	var shorter = (bigger === frequencies ? this.frequencies : frequencies);
	bigger = [].slice.call(bigger);

	var smoothing = (bigger === this.frequencies ? 1 - this.smoothing : this.smoothing);

	for (var i = 0; i < bigger.length; i++) {
		bigger[i] = clamp(bigger[i], -100, 0) * smoothing + clamp(shorter[Math.floor(shorter.length * (i / bigger.length))], -100, 0) * (1 - smoothing);
	}

	//save actual frequencies
	this.frequencies = bigger;

	//prepare f’s for rendering
	magnitudes = bigger.slice();

	//apply a-weighting
	if (weighting[this.weighting]) {
		var w = weighting[this.weighting];
		magnitudes = magnitudes.map((mag, i, data) => clamp(mag + 20 * Math.log(w(i * l)) / Math.log(10), -200, 0));
	}

	//convert mags to 0..1 range limiting by db subrange
	magnitudes = magnitudes.map((value) => (value - minDb) / (maxDb - minDb));

	//find peak
	this.peak = magnitudes.reduce((prev, curr) => Math.max(curr, prev), 0);

	this.gl.uniform1f(this.peakLocation, this.peak);

	//calc trail
	if (this.trail) {
		this.trailData.unshift(magnitudes);
		this.trailData = this.trailData.slice(0, this.trail);
		var trail = magnitudes.slice();
		for (var k = 1; k < this.trailData.length; k++) {
			for (var i = 0; i < Math.min(trail.length, this.trailData[k].length); i++) {
				trail[i] = Math.max(this.trailData[k][i], trail[i]);
			}
		}
		this.trailFrequencies = trail;
	}

	return this.setTexture('frequencies', magnitudes);
};


/**
 * Reset colormap
 */
Spectrum.prototype.setFill = function (cm, inverse) {
	//named colormap
	if (typeof cm === 'string' && !/\\|\//.test(cm)) {
		this.fill = (flatten(colormap({
			colormap: cm,
			nshades: 128,
			format: 'rgba',
			alpha: 1
		})).map((v,i) => !((i + 1) % 4) ? v : v/255));
	}
	else if (!cm) {
		this.fill = null;
		if (!this.background) this.setBackground([1,1,1,1]);
		return this;
	}
	//image, canvas etc
	else if (!Array.isArray(cm)) {
		this.fill = cm;

		this.setTexture('fill', this.fill);

		return this;
	}
	//custom array
	else {
		this.fill = (flatten(cm));
	}

	if (inverse) {
		var reverse = this.fill.slice();
		for (var i = 0; i < this.fill.length; i+=4){
			reverse[this.fill.length - i - 1] = this.fill[i + 3];
			reverse[this.fill.length - i - 2] = this.fill[i + 2];
			reverse[this.fill.length - i - 3] = this.fill[i + 1];
			reverse[this.fill.length - i - 4] = this.fill[i + 0];
		}
		this.fill = reverse;
	}

	this.setTexture('fill', {
		data: this.fill,
		width: 1,
		height: (this.fill.length / 4)|0
	});

	//ensure bg
	if (!this.background) {
		this.setBackground(this.fill.slice(0, 4));
	}

	//set grid color to colormap’s color
	if (this.freqGridComponent) {
		var gridColor = this.fill.slice(-4).map((v) => v*255);
		this.freqGridComponent.linesContainer.style.color = `rgba(${gridColor})`;
		this.topGridComponent.linesContainer.style.color = `rgba(${gridColor})`;
		this.bottomGridComponent.linesContainer.style.color = `rgba(${gridColor})`;
	}

	return this;
};


/** Set background */
Spectrum.prototype.setBackground = function (bg) {
	if (this.background !== null) {
		var bgStyle = null;
		if (typeof bg === 'string') {
			bgStyle = bg;
		}
		else if (Array.isArray(bg)) {
			//map 0..1 range to 0..255
			if (bg[0] && bg[0] <= 1 && bg[1] && bg[1] <= 1 && bg[2] && bg[2] <= 1) {
				bg = [
					bg[0] * 255, bg[1] * 255, bg[2] * 255, bg[3] || 1
				];
			}

			bgStyle = `rgba(${bg.slice(0,3).map(v => Math.round(v)).join(', ')}, ${bg[3]})`;
		}
		this.canvas.style.background = bgStyle;
	}

	return this;
};



/**
 * Update uniforms values, textures etc.
 * It should be called when the settings changed.
 */
Spectrum.prototype.update = function () {
	var gl = this.gl;

	//fix values
	if (typeof this.trail === 'string') {
		this.trail = parseInt(this.trail);
	}

	if (typeof this.smoothing === 'string') {
		this.smoothing = parseFloat(this.smoothing);
	}

	if (typeof this.align === 'string') {
		this.align = parseFloat(this.align);
	}

	if (typeof this.group === 'string') {
		this.group = parseInt(this.group);
	}

	//create grid, if not created yet
	if (this.grid) {
		if (!this.freqGridComponent) {
			this.freqGridComponent = createGrid({
				container: this.container,
				viewport: () => this.viewport,
				lines: Array.isArray(this.grid.lines) ? this.grid.lines : (this.grid.lines === undefined || this.grid.lines === true) && [{
					min: this.minFrequency,
					max: this.maxFrequency,
					orientation: 'x',
					logarithmic: this.logarithmic,
					titles: function (value) {
						return (value >= 1000 ? ((value / 1000).toLocaleString() + 'k') : value.toLocaleString()) + 'Hz';
					}
				}, this.logarithmic ? {
					min: this.minFrequency,
					max: this.maxFrequency,
					orientation: 'x',
					logarithmic: this.logarithmic,
					values: function (value) {
						var str = value.toString();
						if (str[0] !== '1') return null;
						return value;
					},
					titles: null,
					style: {
						borderLeftStyle: 'solid',
						pointerEvents: 'none',
						opacity: '0.08',
						display: this.logarithmic ? null :'none'
					}
				} : null],
				axes: Array.isArray(this.grid.axes) ? this.grid.axes : (this.grid.axes || this.axes) && [{
					name: 'Frequency',
					labels: function (value, i, opt) {
						var str = value.toString();
						if (str[0] !== '2' && str[0] !== '1' && str[0] !== '5') return null;
						return opt.titles[i];
					}
				}]
			});

			this.topGridComponent = createGrid({
				container: this.container,
				viewport: () => [
					this.viewport[0],
					this.viewport[1],
					this.viewport[2],
					this.viewport[3] * (1 - this.align)
				],
				lines: [{
					min: this.minDecibels,
					max: this.maxDecibels,
					orientation: 'y',
					titles: function (value) {
						return value.toLocaleString() + 'dB';
					}
				}],
				axes: Array.isArray(this.grid.axes) ? this.grid.axes : (this.grid.axes || this.axes) && [{
					name: 'Magnitude'
				}]
			});

			//alignment requires additional grid
			this.bottomGridComponent = createGrid({
				container: this.container,
				viewport: () => [
					this.viewport[0],
					this.viewport[1] + this.viewport[3] * (1 - this.align),
					this.viewport[2],
					this.viewport[3] * this.align
				],
				lines: [{
					min: this.maxDecibels,
					max: this.minDecibels,
					orientation: 'y',
					titles: function (value) {
						return value.toLocaleString() + 'dB';
					}
				}],
				axes: Array.isArray(this.grid.axes) ? this.grid.axes : (this.grid.axes || this.axes) && [{
					name: 'Magnitude'
				}]
			});

			this.on('resize', () => {
				if (this.isPlannedGridUpdate) return;
				this.isPlannedGridUpdate = true;
				this.once('render', () => {
					this.isPlannedGridUpdate = false;
					this.topGridComponent.update();
					this.bottomGridComponent.update();
					this.freqGridComponent.update();
				});
			});
		} else {
			this.freqGridComponent.linesContainer.style.display = 'block';
			this.topGridComponent.linesContainer.style.display = 'block';
			this.bottomGridComponent.linesContainer.style.display = 'block';

			this.topGridComponent.update();
			this.bottomGridComponent.update();

			this.freqGridComponent.update({
				lines: [{
						logarithmic: this.logarithmic
					}, {
						logarithmic: this.logarithmic,
						style: {
							display: this.logarithmic ? null : 'none'
						}
					}
				]
			});
		}

	}
	else if (this.freqGridComponent) {
		this.freqGridComponent.linesContainer.style.display = 'none';
		this.topGridComponent.linesContainer.style.display = 'none';
		this.bottomGridComponent.linesContainer.style.display = 'none';
	}

	//preset trail buffer
	if (this.trail === true) {
		this.trail = Spectrum.prototype.trail;
	}

	//update textures
	this.setBackground(this.background);
	this.setFrequencies(this.frequencies);
	this.setFill(this.fill);

	//emit update
	this.emit('update');

	return this;
};
