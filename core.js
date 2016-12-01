/**
 * @module  gl-spectrum/lib/code
 */

const extend = require('xtend/mutable');
const inherits = require('inherits');
const lg = require('mumath/log10');
const isBrowser = require('is-browser');
// const createGrid = require('plot-grid');
const clamp = require('mumath/clamp');
const Component = require('gl-component');
const weighting = require('a-weighting');
const db = require('decibels')

module.exports = Spectrum;


inherits(Spectrum, Component);


/**
 * @contructor
 */
function Spectrum (options) {
	if (!(this instanceof Spectrum)) return new Spectrum(options);

	Component.call(this, options);

	this.magnitudes = [];
}

Spectrum.prototype.context = {
	antialias: true,
	alpha: true,
	premultipliedAlpha: true,
	preserveDrawingBuffer: false,
	depth: false
};
Spectrum.prototype.autostart = false;
Spectrum.prototype.className = 'gl-spectrum';
Spectrum.prototype.align = .0;
Spectrum.prototype.trail = false;
Spectrum.prototype.type = 'line';
Spectrum.prototype.width = 1;
Spectrum.prototype.grid = false;
Spectrum.prototype.maxDb = 0;
Spectrum.prototype.minDb = -100;
Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 40;
Spectrum.prototype.smoothing = 0.75;
Spectrum.prototype.details = 1;
Spectrum.prototype.log = true;
Spectrum.prototype.weighting = 'itu';
Spectrum.prototype.sampleRate = 44100;
Spectrum.prototype.palette = ['black', 'white'];
Spectrum.prototype.background = null;


/**
 * Set data
 */
Spectrum.prototype.set = function (data) {
	let gl = this.gl;
	let halfRate = this.sampleRate * 0.5;
	let nf = halfRate / data.length;
	let weight = this.weighting;
	let smoothing = this.smoothing;
	let magnitudes = this.magnitudes;

	magnitudes.length = data.length;

	//apply weighting and clamping, bring db to 0..1 range
	let peak = 0;
	for (let i = 0; i < data.length; i++) {
		//let v = db.toGain(data[i])// * weight(i * nf);
		let v = .01 * (clamp(data[i], -100, 0) + 100) * weight(i * nf);
		if (v > peak) peak = v;
		magnitudes[i] = v * (1 - smoothing) + (magnitudes[i] || 0) * smoothing;
	}

	this.peak = peak;
	this.emit('data', magnitudes, peak);

	!this.autostart && this.render();

	return this;
};


/**
 * Update options
 */
Spectrum.prototype.update = function (options) {
	let gl = this.gl;

	//limit base
	this.minFrequency = Math.max(1, this.minFrequency);

	if (!(this.weighting instanceof Function)) this.weighting = weighting[this.weighting] || weighting.z;

	//create grid, if not created yet
	/*
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
						let str = value.toString();
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
						let str = value.toString();
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
				this.topGridComponent.update();
				this.bottomGridComponent.update();
				this.freqGridComponent.update();
			});
		} else {
			this.freqGridComponent.linesContainer.style.display = 'block';
			this.topGridComponent.linesContainer.style.display = 'block';
			this.bottomGridComponent.linesContainer.style.display = 'block';

			this.topGridComponent.update({
				lines: [{
					min: this.minDecibels,
					max: this.maxDecibels
				}]
			});
			this.bottomGridComponent.update({
				lines: [{
					max: this.minDecibels,
					min: this.maxDecibels
				}]
			});
			this.freqGridComponent.update({
				lines: [{
						logarithmic: this.logarithmic,
						min: this.minFrequency,
						max: this.maxFrequency,
					}, {
						logarithmic: this.logarithmic,
						min: this.minFrequency,
						max: this.maxFrequency,
						style: {
							display: this.logarithmic ? null : 'none'
						}
					}
				]
			});
		}
	}
	*/

	// this.setFill(this.fill, this.inversed);
	// this.setTexture('colormap', {
	// 	data: [0,0,0,1],
	// 	height: 1,
	// 	width: 1
	// });
	// Spectrogram.prototype.setFill.call(this, cm, inverse);

	// //set grid color to colormap’s color
	// if (this.freqGridComponent) {
	// 	this.freqGridComponent.linesContainer.style.color = this.color;
	// 	this.topGridComponent.linesContainer.style.color = this.color;
	// 	this.bottomGridComponent.linesContainer.style.color = this.color;
	// }


	!this.autostart && this.render();

	//emit update
	this.emit('update');

	return this;
};
