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


	//setup grid (have to go before context setup)
	if (this.grid) {
		this.grid = createGrid({
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
			axes: Array.isArray(this.grid.axes) ? this.grid.axes : (this.grid.axes || this.gridAxes) && [{
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
	};

	this.on('resize', () => this.grid && this.grid.update({
		viewport: this.viewport
	}));


	if (!this.is2d) {
		var gl = this.gl;

		var float = gl.getExtension('OES_texture_float');
		if (!float) throw Error('WebGL does not support floats.');
		var floatLinear = gl.getExtension('OES_texture_float_linear');
		if (!floatLinear) throw Error('WebGL does not support floats.');

		this.maskSizeLocation = gl.getUniformLocation(this.program, 'maskSize');
	}

	this.update();
}

inherits(Spectrum, Component);



Spectrum.prototype.maxDecibels = -30;
Spectrum.prototype.minDecibels = -100;

Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 20;

Spectrum.prototype.smoothing = 0.5;

Spectrum.prototype.grid = true;
Spectrum.prototype.gridAxes = false;

Spectrum.prototype.logarithmic = true;

Spectrum.prototype.weighting = 'itu';

//evenly distributed within indicated diapasone
Spectrum.prototype.frequencies = new Float32Array(512).fill(Spectrum.prototype.minDecibels);

//line, bars, dots, text
Spectrum.prototype.mode = 'line';

//TODO
Spectrum.prototype.orientation = 'horizontal';

//required to detect frequency resolution
Spectrum.prototype.sampleRate = 44100;

//colors to map spectrum against
Spectrum.prototype.colormap = 'greys';
Spectrum.prototype.colormapInverse = false;

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
	uniform sampler2D colormap;
	uniform vec4 viewport;
	uniform sampler2D mask;
	uniform vec2 maskSize;

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
		prevF = coord.x - bin.x;
		currF = coord.x;
		prevMag = magnitude(prevF);
		currMag = magnitude(currF);
		maxMag = max(currMag, prevMag);
		minMag = min(currMag, prevMag);
		slope = (currMag - prevMag) / bin.x;
		alpha = atan(currMag - prevMag, bin.x);


		//apply mask
		vec2 maskCoord = vec2(mod(gl_FragCoord.x, maskSize.x) / maskSize.x, .5);
		float maskOffset = gl_FragCoord.x - mod(gl_FragCoord.x, maskSize.x);

		//find mask’s offset frequency
		float averageMag = magnitude((maskOffset + .5) / viewport.z);


		//calc dist
		float dist = coord.y - averageMag;
		float vertDist = abs(dist);
		float intensity;

		intensity = (1. - step(0., dist)) * (-.4*log(1. - coord.y) * .5 + pow(coord.y, .75)*.4 + .12);
		// intensity += (1. - smoothstep(.0, .0032, vertDist));
		// intensity += step(coord.y, maxMag) * step(minMag, coord.y);


		intensity *= texture2D(mask, maskCoord).x;

		gl_FragColor = vec4(vec3(intensity),1);
		// gl_FragColor = texture2D(colormap, vec2(max(0.,intensity), 0.5));
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
		frequencies = frequencies.map((mag, i, data) => mag + 20 * Math.log(w(i * l)) / Math.log(10));
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
Spectrum.prototype.setColormap = function (cm) {
	//named colormap
	if (typeof cm === 'string') {
		this.colormap = new Float32Array(flatten(colormap({
			colormap: cm,
			nshades: 128,
			format: 'rgba',
			alpha: 1
		})).map((v,i) => !((i + 1) % 4) ? v : v/255));
	}
	//custom array
	else {
		this.colormap = new Float32Array(flatten(cm));
	}

	if (this.colormapInverse && !cm.isReversed) {
		var reverse = [];
		for (var i = 0; i < this.colormap.length; i+=4){
			reverse.unshift([
				this.colormap[i + 0],
				this.colormap[i + 1],
				this.colormap[i + 2],
				this.colormap[i + 3]
			]);
		}
		reverse.isReversed = true;
		return this.setColormap(reverse);
	}

	this.setTexture('colormap', {
		data: this.colormap,
		width: (this.colormap.length / 4)|0,
		format: this.gl.RGBA,
		magFilter: this.gl.LINEAR,
		minFilter: this.gl.LINEAR,
		wrap: this.gl.CLAMP_TO_EDGE
	});

	//set grid color to colormap’s color
	if (this.grid) {
		var gridColor = this.colormap.slice(-4).map((v) => v*255);
		this.grid.linesContainer.style.color = `rgba(${gridColor})`;
	}

	return this;
};


/**
 * Set named or array mask
 */
Spectrum.prototype.setMask = function (mask) {
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

	//update textures
	this.setFrequencies(this.frequencies);
	this.setColormap(this.colormap);
	this.setMask(this.mask);

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
		var colormap = this.colormap;

		context.fillStyle = 'rgba(' + colormap.slice(0,4).join(',') + ')';
		context.fillRect.apply(context, this.viewport);

		//calculate per-bar averages
		var bars = [];
		for (var i = 0; i < this.frequencies.length; i++) {

		}
	}

	return this;
};
