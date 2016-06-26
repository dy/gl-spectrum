/**
 * @module  gl-spectrum/lib/code
 */

var extend = require('xtend/mutable');
var inherits = require('inherits');
var lg = require('mumath/lg');
var isBrowser = require('is-browser');
var createGrid = require('plot-grid');
var clamp = require('mumath/clamp');
var Spectrogram = require('gl-spectrogram/lib/core');

module.exports = Spectrum;


/**
 * @contructor
 */
function Spectrum (options) {
	if (!(this instanceof Spectrum)) return new Spectrum(options);

	this.trailData = [];

	Spectrogram.call(this, options);
}

inherits(Spectrum, Spectrogram);

Spectrum.prototype.className = 'gl-spectrum';

//amount of alignment
Spectrum.prototype.align = .0;

//shadow frequencies, like averaged/max values
Spectrum.prototype.trail = 1;

//style of rendering
Spectrum.prototype.type = 'fill';
Spectrum.prototype.width = 1;


/**
 * Set frequencies taking into account smoothing, logarithmic and grouping params
 */
Spectrum.prototype.setFrequencyData = function (magnitudes) {
	this.push(magnitudes);

	magnitudes = this.magnitudes;

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
}


/**
 * Reset colormap
 * Completely compatible with gl-spectrogram setValues
 */
Spectrum.prototype.setFill = function (cm, inverse) {
	Spectrogram.prototype.setFill.call(this, cm, inverse);

	//set grid color to colormap’s color
	if (this.freqGridComponent) {
		this.freqGridComponent.linesContainer.style.color = this.color;
		this.topGridComponent.linesContainer.style.color = this.color;
		this.bottomGridComponent.linesContainer.style.color = this.color;
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
		this.trail = Spectrogram.prototype.trail;
	}

	//update textures
	this.setBackground(this.background);
	// this.setFrequencyData(this.frequencies);
	this.setFill(this.fill, this.inversed);

	//emit update
	this.emit('update');

	return this;
};
