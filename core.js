/**
 * @module  gl-spectrum/code
 */
'use strict'

const extend = require('xtend/mutable')
const inherits = require('inherits')
const lg = require('mumath/log10')
const isBrowser = require('is-browser')
const createGrid = require('plot-grid')
const clamp = require('mumath/clamp')
const Component = require('gl-component')
const weighting = require('a-weighting')
const db = require('decibels')
const interpolate = require('color-interpolate')
const panzoom = require('pan-zoom')
const pretty = require('pretty-number')
const alpha = require('color-alpha')

module.exports = Spectrum;


inherits(Spectrum, Component);


/**
 * @contructor
 */
function Spectrum (options) {
	if (!(this instanceof Spectrum)) return new Spectrum(options);

	Component.call(this, options);

	this.glAttribs = this.gl.getContextAttributes();

	this.magnitudes = [];

	//enable interactions
	panzoom(this.canvas, e => {
		if (!this.interactions) return;

		let [left, top, width, height] = this.viewport;
		let ratio = (e.x - left) / width;
		let fLeft = this.minFrequency, fRight = this.maxFrequency;
		let fRange = fRight - fLeft;

		if (e.dz) {
			let zoom = clamp(-e.dz, -height*.75, height*.75) / height;

			fLeft += zoom * (ratio * fRange);
			fRight -= zoom * ((1 - ratio) * fRange);
		}
		else if (e.dx) {
			let shift = fRange * e.dx / width;
			let newLeft = Math.max(fLeft - shift, this.log ? 1 : 0);
			let newRight = Math.min(fRight - fLeft + newLeft, this.sampleRate/2);
			fLeft -= -newRight + fRight;
			fRight = newRight;
		}

		this.update({
			minFrequency: fLeft,
			maxFrequency: fRight
		});
	});

	//enable grid
	if (this.grid) {
		this.grid = createGrid({
			autostart: false,
			context: this.context,
			x: true,
			y: false
		});
	}
}

Spectrum.prototype.context = {
	antialias: true,
	alpha: false,
	premultipliedAlpha: true,
	preserveDrawingBuffer: false,
	depth: false,
	stencil: false
};
Spectrum.prototype.autostart = false;
Spectrum.prototype.className = 'gl-spectrum';
Spectrum.prototype.align = .5;
Spectrum.prototype.trail = true;
Spectrum.prototype.type = 'fill';
Spectrum.prototype.barWidth = 2;
Spectrum.prototype.grid = true;
Spectrum.prototype.maxDb = 0;
Spectrum.prototype.minDb = -100;
Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 20;
Spectrum.prototype.smoothing = 0.75;
Spectrum.prototype.log = true;
Spectrum.prototype.weighting = 'itu';
Spectrum.prototype.sampleRate = 44100;
Spectrum.prototype.palette = 'black';
Spectrum.prototype.levels = 32;
Spectrum.prototype.background = null;
Spectrum.prototype.balance = .5;
Spectrum.prototype.trailAlpha = .4;
Spectrum.prototype.interactions = false;


/**
 * Set data
 */
Spectrum.prototype.set = function (data) {
	let gl = this.gl;
	let halfRate = this.sampleRate * 0.5;
	let nf = halfRate / data.length;
	let weight = typeof this.weighting === 'string' ? (weighting[this.weighting] || weighting.z) : this.weighting;
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

	if (this.trail) {
		if (!Array.isArray(this.trail)) {
			this.trail = magnitudes;
			this.trailPeak = this.peak;
		}
		else {
			this.trail.length = magnitudes.length;
			let trailPeak = 0;
			this.trail = magnitudes.map((v, i) => {
				v = Math.max(v, this.trail[i]);
				if (v > trailPeak) trailPeak = v;
				return v;
			});
			this.trailPeak = trailPeak;
		}
	}

	this.emit('data', magnitudes, this.trail);

	!this.autostart && this.render();

	return this;
};


/**
 * Update options
 */
Spectrum.prototype.update = function (options) {
	let gl = this.gl;

	let [left, top, width, height] = this.viewport;

	extend(this, options);

	//create colormap from palette
	if (!Array.isArray(this.palette)) this.palette = [this.palette];
	this.getColor = interpolate(this.palette);
	this.infoColor = this.getColor(.5);

	//limit base
	this.minFrequency = Math.max(1, this.minFrequency);
	this.maxFrequency = Math.min(this.sampleRate/2, this.maxFrequency);


	//create grid, if not created yet
	if (this.grid) {
		let scale, range, offset;

		if (!this.log) {
			scale = (this.maxFrequency - this.minFrequency) / width;
			offset = this.minFrequency;
		} else {
		// 	offset = lg(this.minFrequency)
		// 	range = lg(this.maxFrequency/this.minFrequency);
		// 	scale =  range / width;
		}

		this.grid.update({
			x: {
				type: this.log ? 'logarithmic' : 'linear',
				min: this.log ? 0 : 0,
				max: this.sampleRate / 2,
				offset: offset,
				origin: 0,
				axisOrigin: -Infinity,
				scale: scale,
				// minScale: 0.0001,
				format: (v) => {
					// v = this.log ? Math.pow(10, v) : v ;
					return pretty(v);
				},
				// lineColor: .1,
				color: this.infoColor,
				pan: false,
				zoom: false
			}
		})
	}

	if (this.glAttribs.alpha) this.canvas.style.background = this.background;

	//emit update
	this.emit('update');

	!this.autostart && this.render();

	return this;
};
