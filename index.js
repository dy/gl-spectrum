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
	options.antialias = true;

	Component.call(this, options);

	if (isBrowser) {
		this.container.classList.add('gl-spectrum');
	}


	if (!this.is2d) {
		var gl = this.gl;

		var float = gl.getExtension('OES_texture_float');
		if (!float) throw Error('WebGL does not support floats.');
		var floatLinear = gl.getExtension('OES_texture_float_linear');
		if (!floatLinear) throw Error('WebGL does not support floats.');

		this.maskSizeLocation = gl.getUniformLocation(this.program, 'maskSize');
		this.alignLocation = gl.getUniformLocation(this.program, 'align');
	}

	this.update();
}

inherits(Spectrum, Component);



Spectrum.prototype.maxDecibels = -30;
Spectrum.prototype.minDecibels = -100;

Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 20;

Spectrum.prototype.smoothing = 0.5;

Spectrum.prototype.snap = null;

Spectrum.prototype.grid = true;
Spectrum.prototype.axes = false;

Spectrum.prototype.logarithmic = true;

Spectrum.prototype.weighting = 'itu';

//evenly distributed within indicated diapasone
Spectrum.prototype.frequencies = new Float32Array(512).fill(Spectrum.prototype.minDecibels);


//TODO
Spectrum.prototype.orientation = 'horizontal';

//required to detect frequency resolution
Spectrum.prototype.sampleRate = 44100;

//colors to map spectrum against
Spectrum.prototype.fill = 'greys';
Spectrum.prototype.background = null;

//amount of alignment
Spectrum.prototype.align = .0;

//TODO implement shadow frequencies, like averaged/max values
Spectrum.prototype.shadow = [];

//mask defines style of bars, dots or line
Spectrum.prototype.mask = null;


/**
 * Here we might have to do kernel averaging for some
 */
Spectrum.prototype.frag = `
	precision lowp float;

	uniform sampler2D frequencies;
	uniform sampler2D fill;
	uniform sampler2D mask;
	uniform sampler2D background;
	uniform vec4 viewport;
	uniform vec2 maskSize;
	uniform float align;

	vec2 coord;
	vec2 bin;
	float currMag;
	float prevMag;
	float nextMag;
	float currF;
	float prevF;
	float nextF;
	float maxMag;
	float minMag;
	float slope;
	float alpha;

	//return magnitude of normalized frequency
	float magnitude (float nf) {
		return texture2D(frequencies, vec2((nf), 0.5)).w;
	}

	float within (float x, float left, float right) {
		return step(left, x) * step(x, right);
	}

	float distToLine(vec2 p1, vec2 p2, vec2 testPt) {
		vec2 lineDir = p2 - p1;
		vec2 perpDir = vec2(lineDir.y, -lineDir.x);
		vec2 dirToPt1 = p1 - testPt;
		return abs(dot(normalize(perpDir), dirToPt1));
	}

	void main () {
		coord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);
		bin = vec2(1. / viewport.zw);
		// prevF = coord.x - .5*bin.x;
		// currF = coord.x;
		// nextF = coord.x + .5*bin.x;
		// prevMag = magnitude(prevF);
		// currMag = magnitude(currF);
		// nextMag = magnitude(nextF);
		// maxMag = max(currMag, prevMag);
		// minMag = min(currMag, prevMag);
		// slope = (currMag - prevMag) / bin.x;
		// alpha = atan(currMag - prevMag, bin.x);


		//calc mask
		float maskX = mod(gl_FragCoord.x, maskSize.x);
		float maskOutset = gl_FragCoord.x - maskX + .5;

		//find mask’s offset frequency
		float mag = max(magnitude(maskOutset / viewport.z), 0.);

		//calc dist
		float dist = abs(align - coord.y);

		//calc intensity
		float maxAlign = min(max(align, 1. - align), .75);
		float minAlign = max(1. - maxAlign, .25);
		float intensity = pow(dist / max(align, 1. - align), .85) * (maxAlign) + (minAlign);


		//apply mask
		float top = coord.y - mag + align*mag - align + .5*maskSize.y/viewport.w;
		float bottom = -coord.y - align*mag + align + .5*maskSize.y/viewport.w;
		float maskY = max(
			max(top * viewport.w / maskSize.y, .5),
			max(bottom * viewport.w / maskSize.y, .5)
		);
		vec2 maskCoord = vec2(maskX / maskSize.x, maskY);
		float maskLevel = texture2D(mask, maskCoord).x;

		//active area limits 0-mask case
		float active = smoothstep(-0.001, 0.001, top - maskSize.y/viewport.w) + smoothstep(-0.001, 0.001, bottom - maskSize.y/viewport.w);
		maskLevel *= (1. - active);

		// gl_FragColor = vec4(vec3(intensity), 1);
		vec4 bgColor = texture2D(background, coord);
		vec4 fillColor = texture2D(fill, vec2(coord.x, max(0., intensity)));
		gl_FragColor = fillColor * maskLevel + bgColor * (1. - maskLevel);
	}
`;


/**
 * Set frequencies taking into account smoothing, logarithmic and grouping params
 */
Spectrum.prototype.setFrequencies = function (frequencies) {
	if (!frequencies) return this;

	var gl = this.gl;
	var minF = this.minFrequency, maxF = this.maxFrequency;
	var minDb = this.minDecibels, maxDb = this.maxDecibels;
	var halfRate = this.sampleRate * 0.5;
	var l = halfRate / this.frequencies.length;

	//choose bigger data
	var bigger = this.frequencies.length >= frequencies.length ? this.frequencies : frequencies;
	var shorter = bigger === frequencies ? this.frequencies : frequencies;

	var smoothing = bigger === this.frequencies ? this.smoothing : 1 - this.smoothing;


	for (var i = 0; i < bigger.length; i++) {
		bigger[i] = clamp(bigger[i], -200, 0) * smoothing + clamp(shorter[Math.floor(shorter.length * (i / bigger.length))], -200, 0) * (1 - smoothing);
	}

	//save actual frequencies
	this.frequencies = bigger;

	//prepare f’s for rendering
	frequencies = this.frequencies.slice();

	//apply a-weighting
	if (weighting[this.weighting]) {
		var w = weighting[this.weighting];
		frequencies = frequencies.map((mag, i, data) => clamp(mag + 20 * Math.log(w(i * l)) / Math.log(10), -100, 0));
	}

	//subview freqs - min/max f, log mapping, db limiting
	frequencies = frequencies.map((mag, i, frequencies) => {
		var ratio = (i + .5) / frequencies.length;

		if (this.logarithmic) {
			var frequency = Math.pow(10., lg(minF) + ratio * (lg(maxF) - lg(minF)) );
			ratio = (frequency - minF) / (maxF - minF);
		}

		var leftF = minF / halfRate;
		var rightF = maxF / halfRate;

		ratio = leftF + ratio * (rightF - leftF);

		//apply linear interpolation
		//TODO: implement here another interpolation: hi-f gets lost
		var left = frequencies[Math.floor(ratio * frequencies.length)];
		var right = frequencies[Math.ceil(ratio * frequencies.length)];
		var fract = (ratio * frequencies.length) % 1;
		var value = left * (1 - fract) + right * fract;

		//closest interpolation
		// var value = frequencies[Math.round(ratio * frequencies.length)];

		//snap
		if (this.snap) {
			value = Math.round(value * this.snap) / this.snap;
		}

		//sublimit db to 0..1 range
		return (value - minDb) / (maxDb - minDb);
	}, this);

	return this.setTexture('frequencies', {
		data: frequencies,
		format: gl.ALPHA,
		magFilter: this.gl.NEAREST,
		minFilter: this.gl.NEAREST,
		wrap: this.gl.CLAMP_TO_EDGE
	});
};


/**
 * Reset colormap
 */
Spectrum.prototype.setFill = function (cm, inverse) {
	//named colormap
	if (typeof cm === 'string') {
		this.fill = (flatten(colormap({
			colormap: cm,
			nshades: 128,
			format: 'rgba',
			alpha: 1
		})).map((v,i) => !((i + 1) % 4) ? v : v/255));
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
		height: (this.fill.length / 4)|0,
		format: this.gl.RGBA,
		magFilter: this.gl.LINEAR,
		minFilter: this.gl.LINEAR,
		wrap: this.gl.CLAMP_TO_EDGE
	});

	//ensure bg
	if (!this.background) {
		this.setBackground(this.fill.slice(0, 4));
	}

	//set grid color to colormap’s color
	if (this._grid) {
		var gridColor = this.fill.slice(-4).map((v) => v*255);
		this._grid.linesContainer.style.color = `rgba(${gridColor})`;
	}

	return this;
};


/** Set background */
Spectrum.prototype.setBackground = function (bg) {
	this.setTexture('background', {
		data: bg || this.fill.slice(0, 4),
		format: this.gl.RGBA,
		magFilter: this.gl.LINEAR,
		minFilter: this.gl.LINEAR,
		wrap: this.gl.CLAMP_TO_EDGE
	});

	return this;
};

/**
 * Set named or array mask
 */
Spectrum.prototype.setMask = function (mask) {
	this.mask = mask || [1,1,1,1]

	this.setTexture('mask', {
		data: this.mask,
		type: this.gl.FLOAT,
		format: this.gl.LUMINOCITY,
		wrap: this.gl.CLAMP_TO_EDGE
	});

	this.gl.uniform2f(this.maskSizeLocation, this.textures.mask.width, this.textures.mask.height);

	return this;
};


/**
 * Update uniforms values, textures etc.
 * It should be called when the settings changed.
 */
Spectrum.prototype.update = function () {
	var gl = this.gl;

	//create grid, if not created yet
	if (this.grid) {
		if (!this._grid) {
			this._grid = createGrid({
				container: this.container,
				viewport: this.viewport,
				lines: Array.isArray(this.grid.lines) ? this.grid.lines : (this.grid.lines === undefined || this.grid.lines === true) && [{
					min: this.minFrequency,
					max: this.maxFrequency,
					orientation: 'x',
					logarithmic: this.logarithmic,
					titles: function (value) {
						return (value >= 1000 ? ((value / 1000).toLocaleString() + 'k') : value.toLocaleString()) + 'Hz';
					}
				}, {
					min: this.minDecibels,
					max: this.maxDecibels,
					orientation: 'y',
					titles: function (value) {
						return value.toLocaleString() + 'dB';
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
						opacity: '0.08'
					}
				} : null],
				axes: Array.isArray(this.grid.axes) ? this.grid.axes : (this.grid.axes || this.axes) && [{
					name: 'Frequency',
					labels: function (value, i, opt) {
						var str = value.toString();
						if (str[0] !== '2' && str[0] !== '1' && str[0] !== '5') return null;
						return opt.titles[i];
					}
				}, {
					name: 'Magnitude'
				}]
			});

			this.on('resize', () => this._grid.update({
				viewport: this.viewport
			}));
		} else {
			this._grid.grid.style.display = 'block';
		}
	}
	else if (this._grid) {
		this._grid.grid.style.display = 'none';
	}

	//update textures
	this.setFrequencies(this.frequencies);
	this.setFill(this.fill);
	this.setMask(this.mask);
	this.setBackground(this.background);

	this.gl.uniform1f(this.alignLocation, this.align);

	return this;
};


/**
 * Render main loop
 */
Spectrum.prototype.render = function () {
	Component.prototype.render.call(this);

	if (this.is2d) {
		//TODO: 2d rendering?
		var context = this.context;
		var fill = this.fill;

		context.fillStyle = 'rgba(' + fill.slice(0,4).join(',') + ')';
		context.fillRect.apply(context, this.viewport);

		//calculate per-bar averages
		var bars = [];
		for (var i = 0; i < this.frequencies.length; i++) {

		}
	}

	return this;
};
