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
var flatten = require('array-flatten');
var clamp = require('mumath/clamp');

module.exports = Spectrum;



/**
 * @contructor
 */
function Spectrum (options) {
	if (!(this instanceof Spectrum)) return new Spectrum(options);

	var that = this;

	Component.call(this, options);

	if (isBrowser) {
		this.container.classList.add('gl-spectrum');
	}

	if (!this.is2d) {
		var gl = this.context;

		var float = gl.getExtension('OES_texture_float');
		if (!float) throw Error('WebGL does not support floats.');
		var floatLinear = gl.getExtension('OES_texture_float_linear');
		if (!floatLinear) throw Error('WebGL does not support floats.');

		//setup frequencies texture
		this.bindTexture('frequencies', {
			unit: this.frequenciesTextureUnit,
			wrap: gl.CLAMP_TO_EDGE,
			magFilter: gl.NEAREST,
			minFilter: gl.NEAREST
		});
		this.setTexture('frequencies', {
			data: this.frequencies,
			format: gl.ALPHA
		});

		//setup kernel
		var kernelLocation = gl.getUniformLocation(this.program, 'kernel[0]');
		var kernelWeightLocation = gl.getUniformLocation(this.program, 'kernelWeight');
		gl.uniform1fv(kernelLocation, this.kernel);
		gl.uniform1f(kernelWeightLocation, this.kernel.reduce((prev, curr) => prev + curr, 0));

		//setup params
		var logarithmicLocation = gl.getUniformLocation(this.program, 'logarithmic');
		gl.uniform1i(logarithmicLocation, this.logarithmic ? 1 : 0);
		var minFrequencyLocation = gl.getUniformLocation(this.program, 'minFrequency');
		gl.uniform1f(minFrequencyLocation, this.minFrequency);
		var maxFrequencyLocation = gl.getUniformLocation(this.program, 'maxFrequency');
		gl.uniform1f(maxFrequencyLocation, this.maxFrequency);
		var minDecibelsLocation = gl.getUniformLocation(this.program, 'minDecibels');
		gl.uniform1f(minDecibelsLocation, this.minDecibels);
		var maxDecibelsLocation = gl.getUniformLocation(this.program, 'maxDecibels');
		gl.uniform1f(maxDecibelsLocation, this.maxDecibels);
		var sampleRateLocation = gl.getUniformLocation(this.program, 'sampleRate');
		gl.uniform1f(sampleRateLocation, this.sampleRate);

		//setup colormap
		if (this.colormap) {
			//named colormap
			if (typeof this.colormap === 'string') {
				this.colormap = new Float32Array(flatten(colormap({
					colormap: this.colormap,
					nshades: 128,
					format: 'rgba',
					alpha: 1
				})).map((v,i) => !((i + 1) % 4) ? v : v/255));
			}
			//custom array
			else {
				this.colormap = new Float32Array(this.colormap);
			}
			this.bindTexture({colormap: this.colormapTextureUnit});
			this.setTexture('colormap', {
				data: this.colormap,
				width: 128,
				format: gl.RGBA
			});
		}
	}
	else {

	}

	//setup grid
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
					pointerEvents: 'none'
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

	this.on('resize', (vp) => this.grid.update({
		viewport: vp
	}));
}

inherits(Spectrum, Component);


/**
 * Here we might have to do kernel averaging for some
 */
Spectrum.prototype.frag = `
	precision mediump float;

	uniform sampler2D frequencies;
	uniform vec4 viewport;
	uniform float kernel[5];
	uniform float kernelWeight;
	uniform int logarithmic;
	uniform float maxFrequency;
	uniform float minFrequency;
	uniform float maxDecibels;
	uniform float minDecibels;
	uniform float sampleRate;
	uniform sampler2D colormap;

	float frequency;

	const float log10 = log(10.);
	const float pi = ${Math.PI};
	const float pi2 = ${Math.PI*2};

	float lg (float a) {
		return log(a) / log10;
	}

	//TODO: make log light

	//return frequency coordinate from screen position
	float f (float ratio) {
		if (logarithmic == 1) {
			float frequency = pow(10., lg(minFrequency) + ratio * (lg(maxFrequency) - lg(minFrequency)) );
			ratio = (frequency - minFrequency) / (maxFrequency - minFrequency);
		}

		//map the freq range to visible range
		float halfRate = sampleRate * 0.5;
		float left = minFrequency / halfRate;
		float right = maxFrequency / halfRate;

		ratio = left + ratio * (right - left);

		// ratio = .01 * floor(ratio / .01);

		return ratio;
	}

	float distanceToLine (vec2 p1, vec2 p2, vec2 p0)
	{
		vec2 lineDir = p2 - p1;
		vec2 perpDir = vec2(lineDir.y, -lineDir.x);
		vec2 dirToPt1 = p1 - p0;
		return abs(dot(normalize(perpDir), dirToPt1));
	}

	void main () {
		vec2 coord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);
		vec2 bin = vec2(1. / viewport.zw);

		float mag = texture2D(frequencies, vec2(f(coord.x), 0)).w;
		float prevMag = texture2D(frequencies, vec2(f(coord.x - bin.x), 0)).w;

		// float dist = abs(coord.y - mag);

		//dist from point to a line
		float y2 = mag, y1 = prevMag, x2 = coord.x, x1 = coord.x - bin.x, y0 = coord.y, x0 = x2;
		// float y21 = y2 - y1, x21 = x2 - x1;
		// float dist = abs(y21*x0 - x21*y0 + x2*y1 - y2*x1) / sqrt( y21*y21 + x21*x21 );

		float dist = distanceToLine(vec2(x1,y1), vec2(x2,y2), vec2(x0,y0));

		float intensity = 1. - smoothstep(.0007, .0013, dist);

		gl_FragColor = vec4(vec3(intensity), 1);

		// gl_FragColor = texture2D(colormap, vec2(max(0.,intensity), 0.5));
	}
`;


//evenly distributed within indicated diapasone
Spectrum.prototype.frequencies = new Float32Array(1024);

//index of frequencies texture
Spectrum.prototype.frequenciesTextureUnit = 0;

Spectrum.prototype.maxDecibels = 0;
Spectrum.prototype.minDecibels = -100;

Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 20;

Spectrum.prototype.smoothing = 0.5;

Spectrum.prototype.grid = true;
Spectrum.prototype.gridAxes = false;

Spectrum.prototype.logarithmic = true;

//TODO
Spectrum.prototype.orientation = 'horizontal';

//required to detect frequency resolution
Spectrum.prototype.sampleRate = 44100;

//colors to map spectrum against
Spectrum.prototype.colormap = 'portland';
Spectrum.prototype.colormapTextureUnit = 1;


//5-items linear kernel for smoothing frequencies
Spectrum.prototype.kernel = [1, 2, 3, 2, 1];


/**
 * Set frequencies texture taking into account smoothing
 */
Spectrum.prototype.setFrequencies = function (frequencies) {
	if (!frequencies) return this;
	if (!this.frequencies) return this.setTexture('frequencies', {
		data: frequencies,
		format: gl.ALPHA
	});

	var gl = this.context;

	var bigger = this.frequencies.length >= frequencies.length ? this.frequencies : frequencies;
	var shorter = bigger === frequencies ? this.frequencies : frequencies;

	var smoothing = bigger === this.frequencies ? this.smoothing : 1 - this.smoothing;

	for (var i = 0; i < bigger.length; i++) {
		bigger[i] = clamp(bigger[i] * smoothing + shorter[Math.floor(shorter.length * (i / bigger.length))] * (1 - smoothing), 0, 1);
	}

	return this.setTexture('frequencies', {
		data: bigger,
		format: gl.ALPHA
	});
};


/**
 * Render main loop
 */
Spectrum.prototype.render = function () {
	var gl = this.gl;

	if (!this.is2d) {
		Component.prototype.render.call(this);
	}

	else {

	}

	return this;
};
