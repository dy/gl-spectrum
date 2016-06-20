/**
 * @module  gl-spectrum
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

	if (!this.is2d) {
		var gl = this.gl;

		//setup alpha
		gl.enable( gl.BLEND );
		gl.blendEquation( gl.FUNC_ADD );
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		this.maskSizeLocation = gl.getUniformLocation(this.program, 'maskSize');
		this.alignLocation = gl.getUniformLocation(this.program, 'align');
		this.minFrequencyLocation = gl.getUniformLocation(this.program, 'minFrequency');
		this.maxFrequencyLocation = gl.getUniformLocation(this.program, 'maxFrequency');
		this.logarithmicLocation = gl.getUniformLocation(this.program, 'logarithmic');
		this.sampleRateLocation = gl.getUniformLocation(this.program, 'sampleRate');
		this.groupLocation = gl.getUniformLocation(this.program, 'group');
		this.trailLocation = gl.getUniformLocation(this.program, 'trail');
		this.balanceLocation = gl.getUniformLocation(this.program, 'balance');
		this.peakLocation = gl.getUniformLocation(this.program, 'peak');

		this.setTexture({
			frequencies: {
				filter: gl.LINEAR,
				wrap: gl.CLAMP_TO_EDGE,
				format: gl.ALPHA
			},
			fill: {
				filter: gl.LINEAR,
				wrap: gl.CLAMP_TO_EDGE,
				format: gl.RGBA
			},
			mask: {
				type: gl.FLOAT,
				format: gl.LUMINOCITY,
				wrap: gl.CLAMP_TO_EDGE
			}
		});
	}

	this.freqBuffer = [];

	this.on('resize', () => {
		this.recalc();
	});

	this.update();
}

inherits(Spectrum, Component);


Spectrum.prototype.antialias = false;
Spectrum.prototype.premultipliedAlpha = true;
Spectrum.prototype.alpha = true;
Spectrum.prototype.float = true;

Spectrum.prototype.maxDecibels = -30;
Spectrum.prototype.minDecibels = -100;

Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 20;

Spectrum.prototype.smoothing = 0.75;
Spectrum.prototype.details = 1;

Spectrum.prototype.snap = null;

Spectrum.prototype.grid = true;
Spectrum.prototype.axes = false;

Spectrum.prototype.logarithmic = true;

Spectrum.prototype.weighting = 'itu';

//evenly distributed within indicated diapasone
Spectrum.prototype.frequencies = new Float32Array(512);
for (var i = 0; i < 512; i++) {Spectrum.prototype.frequencies[i] = Spectrum.prototype.minDecibels;};

//required to detect frequency resolution
Spectrum.prototype.sampleRate = 44100;

//colors to map spectrum against
Spectrum.prototype.fill = 'greys';
Spectrum.prototype.balance = .65;
Spectrum.prototype.background = undefined;

//amount of alignment
Spectrum.prototype.align = .0;

//shadow frequencies, like averaged/max values
Spectrum.prototype.trail = 1;

//mask defines style of bars, dots or line
Spectrum.prototype.mask = null;

//group freq range by subbands
Spectrum.prototype.group = false;


//scale verteces to frequencies values and apply alignment
Spectrum.prototype.vert = `
	precision highp float;

	attribute vec2 position;

	uniform sampler2D frequencies;
	uniform sampler2D mask;
	uniform vec2 maskSize;
	uniform float align;
	uniform float minFrequency;
	uniform float maxFrequency;
	uniform float logarithmic;
	uniform float sampleRate;
	uniform vec4 viewport;
	uniform float group;
	uniform float peak;

	varying float vDist;
	varying float vMag;
	varying float vLeft;
	varying float vRight;

	const float log10 = ${Math.log(10)};

	float lg (float x) {
		return log(x) / log10;
	}

	//return a or b based on weight
	float decide (float a, float b, float w) {
		return step(0.5, w) * b + step(w, 0.5) * a;
	}

	//get mapped frequency
	float f (float ratio) {
		float halfRate = sampleRate * .5;

		float logF = pow(10., lg(minFrequency) + ratio * (lg(maxFrequency) - lg(minFrequency)) );

		ratio = decide(ratio, (logF - minFrequency) / (maxFrequency - minFrequency), logarithmic);

		float leftF = minFrequency / halfRate;
		float rightF = maxFrequency / halfRate;

		ratio = leftF + ratio * (rightF - leftF);

		return ratio;
	}

	void main () {
		vec2 coord = position;
		float _group = max(group, .5);
		float groupRatio = _group / viewport.z;

		//round x-coord to the step, @c is a precision fix constant
		float c = 1./viewport.z;
		float leftX = floor((coord.x * viewport.z + c ) / _group) * _group / viewport.z;
		float rightX = ceil((coord.x * viewport.z + c ) / _group) * _group / viewport.z;
		coord.x = decide(leftX, rightX, step(coord.x - leftX + c*.5, groupRatio * .5));

		float mag = texture2D(frequencies, vec2(f(leftX), 0.5)).w;
		mag = clamp(mag, 0., 1.);

		vMag = mag;
		vLeft = leftX;
		vRight = rightX;

		//ensure mask borders are set
		mag += maskSize.y / viewport.w;

		//map y-coord to alignment
		coord.y = coord.y * mag - mag * align + align;

		//save distance from the align
		vDist = (coord.y - align) * (1. / max(align, 1. - align));

		gl_Position = vec4(coord*2. - 1., 0, 1);
	}
`;

Spectrum.prototype.frag = `
	precision highp float;

	uniform sampler2D fill;
	uniform sampler2D mask;
	uniform vec2 maskSize;
	uniform vec4 viewport;
	uniform float align;
	uniform float group;
	uniform float trail;
	uniform float peak;
	uniform float balance;

	varying float vDist;
	varying float vMag;
	varying float vLeft;
	varying float vRight;

	vec2 coord;

	float decide (float a, float b, float w) {
		return step(0.5, w) * b + step(w, 0.5) * a;
	}

	void main () {
		coord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);
		float groupRatio = group / viewport.z;
		float maskRatio = maskSize.x / viewport.z;

		//calc mask
		float halfX = min(group * .5 / maskSize.x, .5);
		float leftX = ((coord.x - vLeft) * viewport.z) / maskSize.x;
		float leftPart = step(leftX, halfX) * step(0., leftX);
		float rightX = 1. - max(((vRight - coord.x) * viewport.z),0.) / maskSize.x;
		float rightPart = step(rightX, 1.) * step(1. - halfX, rightX);
		// rightPart -= rightPart * leftPart;
		float centralPart = 1. - leftPart - rightPart;

		float maskX = decide(.5, centralPart * .5 + leftPart * leftX + rightPart * rightX, step(4., group));

		//find mask’s offset frequency
		float mag = vMag;

		//calc dist
		float dist = abs(vDist);

		//calc intensity
		float intensity = pow(dist, .85) * balance + pow(mag/peak, 1.25) * (1. - balance);
		intensity /= (peak * .48 + .5);
		intensity = intensity * .85 + .15;

		//apply mask
		float top = coord.y - mag + align*mag - align + .5*maskSize.y/viewport.w;
		float bottom = -coord.y - align*mag + align + .5*maskSize.y/viewport.w;
		float maskY = max(
			max(top * viewport.w / maskSize.y, .5),
			max(bottom * viewport.w / maskSize.y, .5)
		);
		vec2 maskCoord = vec2(maskX, maskY);
		float maskLevel = texture2D(mask, maskCoord).x;

		gl_FragColor = vec4(vec3(1), 1);
		vec4 fillColor = texture2D(fill, vec2(coord.x, max(0., intensity) + trail * (mag * .5 / peak + .15 )));
		fillColor.a *= maskLevel;
		fillColor.a += trail * texture2D(mask, vec2(maskX, .5)).x;
		gl_FragColor = fillColor;
	}
`;


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

	//snap magnitudes
	if (this.snap) {
		magnitudes = magnitudes.map((value) => Math.round(value * this.snap) / this.snap);
	}

	//convert mags to 0..1 range limiting by db subrange
	magnitudes = magnitudes.map((value) => (value - minDb) / (maxDb - minDb));

	//find peak
	var peak = magnitudes.reduce((prev, curr) => Math.max(curr, prev), 0);
	this.gl.uniform1f(this.peakLocation, peak);

	//calc trail
	if (this.trail) {
		this.freqBuffer.unshift(magnitudes);
		this.freqBuffer = this.freqBuffer.slice(0, this.trail);
		var trail = magnitudes.slice();
		for (var k = 1; k < this.freqBuffer.length; k++) {
			for (var i = 0; i < Math.min(trail.length, this.freqBuffer[k].length); i++) {
				trail[i] = Math.max(this.freqBuffer[k][i], trail[i]);
			}
		}
		this.trailFrequencies = trail;
	}

	return this.setTexture('frequencies', magnitudes);
};


/**
 * Recalculate number of verteces
 */
Spectrum.prototype.recalc = function () {
	var data = [], w = this.viewport[2] * this.details;

	//no-grouping is simply connected points
	if (!this.group || this.group <= .5) {
		for (var i = 0; i < w; i++) {
			var curr = i/w;
			var next = (i+1)/w;
			data.push(curr);
			data.push(1);
			data.push(next);
			data.push(1);
			data.push(curr);
			data.push(0);
			data.push(next);
			data.push(0);
		}
	}
	//grouping renders bars
	else {
		var size = this.group === true ? 1 : this.group;
		var w = w / size;
		for (var i = 0; i < w; i++) {
			var curr = i/(w);
			var next = (i+.5)/(w);
			data.push(curr);
			data.push(1);
			data.push(curr);
			data.push(1);
			data.push(curr);
			data.push(1);
			data.push(next);
			data.push(1);
			data.push(curr);
			data.push(0);
			data.push(next);
			data.push(0);
			data.push(next);
			data.push(0);
			data.push(next);
			data.push(0);
		}
	}

	this.setAttribute('position', data);

	return this;
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
 * Set named or array mask
 */
Spectrum.prototype.setMask = function (mask) {
	this.mask = mask || [1,1,1,1];

	this.setTexture('mask', this.mask);

	this.gl.uniform2f(this.maskSizeLocation, this.textures.mask.width, this.textures.mask.height);

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

	//update verteces
	this.recalc();

	//update textures
	this.setBackground(this.background);
	this.setFrequencies(this.frequencies);
	this.setFill(this.fill);
	this.setMask(this.mask);

	this.gl.uniform1f(this.alignLocation, this.align);
	this.gl.uniform1f(this.minFrequencyLocation, this.minFrequency);
	this.gl.uniform1f(this.maxFrequencyLocation, this.maxFrequency);
	this.gl.uniform1f(this.logarithmicLocation, this.logarithmic ? 1 : 0);
	this.gl.uniform1f(this.sampleRateLocation, this.sampleRate);
	this.gl.uniform1f(this.groupLocation, this.group || 0);
	this.gl.uniform1f(this.balanceLocation, this.balance || 0);

	return this;
};


/**
 * Render main loop
 */
Spectrum.prototype.draw = function () {
	var gl = this.gl;

	gl.useProgram(this.program);

	var count = this.attributes.position.data.length / 2;

	if (this.fill) {
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.attributes.position.data.length / 2);
	}

	if (this.trail) {
		//TODO: fix this - do not update freqs each draw call
		gl.uniform1f(this.trailLocation, 1);
		this.setTexture('frequencies', this.trailFrequencies);
		gl.drawArrays(gl.LINES, 0, this.attributes.position.data.length / 2);
		gl.uniform1f(this.trailLocation, 0);
	}

	return this;
};
