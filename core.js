/**
 * @module  gl-spectrum/code
 */
'use strict'

const extend = require('object-assign')
const inherits = require('inherits')
const lg = require('mumath/log10')
const isBrowser = require('is-browser')
const createGrid = require('plot-grid')
const clamp = require('mumath/clamp')
const Emitter = require('events')
const weighting = require('a-weighting')
const db = require('decibels')
const interpolate = require('color-interpolate')
const pretty = require('pretty-number')
const alpha = require('color-alpha')
const isPlainObj = require('is-plain-obj')
const createLoop = require('canvas-loop')
const getContext = require('gl-util/context')


module.exports = Spectrum;


inherits(Spectrum, Emitter);


/**
 * @contructor
 */
function Spectrum (options) {
	if (!(this instanceof Spectrum)) return new Spectrum(options);

	extend(this, options);

	//create canvas/container
	//FIXME: this is not very good for 2d case though
	if (!this.context) this.context = getContext(this);
	if (!this.canvas) this.canvas = this.context.canvas;
	if (!this.container) this.container = document.body || document.documentElement;
	if (!this.canvas.parentNode) this.container.appendChild(this.canvas);

	//create loop
	this.loop = createLoop(this.canvas, {parent: this.container, scale: this.pixelRatio});
	this.loop.on('tick', () => {
		this.render();
	});
	this.loop.on('resize', () => {
		this.update()
	});

	this.autostart && this.loop.start();

	//create data holder
	this.magnitudes = [];
}


Spectrum.prototype.pixelRatio = window.devicePixelRatio;
Spectrum.prototype.autostart = true;
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
Spectrum.prototype.smoothing = 0.82;
Spectrum.prototype.log = true;
Spectrum.prototype.weighting = 'itu';
Spectrum.prototype.sampleRate = 44100;
Spectrum.prototype.palette = 'black';
Spectrum.prototype.levels = 32;
Spectrum.prototype.balance = .5;
Spectrum.prototype.trailAlpha = .33;
Spectrum.prototype.interactions = false;
Spectrum.prototype.background = null;


/**
 * Set data
 */
Spectrum.prototype.set = function (data) {
	let halfRate = this.sampleRate * 0.5;
	let nf = halfRate / data.length;
	let weight = typeof this.weighting === 'string' ? weighting[this.weighting] : this.weighting;
	let smoothing = this.smoothing;
	let magnitudes = this.magnitudes;

	magnitudes.length = data.length;

	//apply weighting and clamping, bring db to 0..1 range
	let peak = 0;
	for (let i = 0; i < data.length; i++) {
		//let v = db.toGain(data[i])// * weight(i * nf);
		let v = .01 * (clamp(data[i], -100, 0) + 100);
		if (weight) v *= weight(i * nf);
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
	if (!options) options = {};
	extend(this, options);

	//create colormap from palette
	if (!Array.isArray(this.palette)) this.palette = [this.palette];
	this.getColor = interpolate(this.palette);
	this.infoColor = this.getColor(.5);

	//limit base
	this.minFrequency = Math.max(20, this.minFrequency);
	this.maxFrequency = Math.min(this.sampleRate/2, this.maxFrequency);

	//set bg in case of slave draw mode
	if (this.background && this.alpha) {
		this.canvas.style.background = this.background;
	}

	//create grid if true/options passed
	if (this.grid === true || isPlainObj(this.grid)) {
		if (!this._grid) {
			this._grid = createGrid({
				autostart: false,
				context: this.context,
				x: extend({
					type: this.log ? 'logarithmic' : 'linear',
					minScale: 1e-10,
					origin: 0,
					axisOrigin: -Infinity,
					format: (v) => {
						// v = this.log ? Math.pow(10, v) : v;
						return pretty(v);
					}
				}, this.grid),
				// y: 'linear'
			});

			this._grid.on('interact', (grid) => {
				if (!this.interactions) return;
				let x = grid.x;
				let leftF = x.offset;
				let rightF = x.offset + x.scale*this.canvas.width;
				if (this.log) {
					leftF = Math.pow(10, leftF);
					rightF = Math.pow(10, rightF);
				}

				this.update({minFrequency: leftF, maxFrequency: rightF});
			});
		}

		this.grid = this._grid;
		this._grid.update({x: {disabled: false}});
	}
	else if (!this.grid && this._grid) {
		this._grid.update({x: {disabled: true}});
		this._grid.draw();
	}

	//update grid
	if (this.grid) {
		let scale, range, offset;

		let xOpts = {
			color: this.getColor(.75),
			// lineColor: .05
		};

		if (options.log != null) {
			xOpts.type = this.log ? 'logarithmic' : 'linear';
			xOpts.min = this.log ? lg(20) : 0;
			xOpts.max = this.log ? lg(this.sampleRate/2) : this.sampleRate/2;
		}

		xOpts.offset = this.log ? lg(this.minFrequency) : this.minFrequency;
		xOpts.scale = (this.log ? lg(this.maxFrequency/this.minFrequency) : (this.maxFrequency - this.minFrequency)) / this.canvas.width;
		if (options.interactions) {
			xOpts.pan = xOpts.zoom = options.interactions;
		}

		//FIXME: add better decibels rendering
		// let yOpts = {
		// 	axisOrigin: Infinity,
		// 	origin: 0,
		// 	offset: -this.align*200,
		// 	scale: 200/height,
		// 	lineColor: false,
		// 	distance: 10,
		// 	color: this.getColor(.75),
		// 	format: v => {
		// 		return pretty(-100 + Math.abs(v));
		// 	}
		// }

		this.grid.update({
			x: xOpts,
			//y: yOpts
		});
	}

	//reset trail if weight changed
	if (options.weighting != null) this.trail = !!this.trail;

	//emit update
	this.emit('update');

	return this;
};
