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
		this.bindTexture('frequencies', this.frequenciesTextureUnit);
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
		if (this.colorMap) {
			//named colormap
			if (typeof this.colorMap === 'string') {
				this.colorMap = new Float32Array(flatten(colormap({
					colormap: this.colorMap,
					nshades: 10,
					format: 'rgba',
					alpha: 1
				})));
			}
			//custom array
			else {
				this.colorMap = new Float32Array(this.colorMap);
			}
			this.bindTexture({colorMap: this.colorMapTextureUnit});
			this.setTexture('colorMap', this.colorMap);
		}
	}
	else {

	}

	//setup grid
	this.grid = createGrid({
		container: this.container,
		viewport: this.viewport,
		lines: [{
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
		axes: this.gridAxes && [{
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
	uniform sampler2D colorMap;

	float frequency;

	const float log10 = log(10.);

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

		return ratio;
	}

	void main () {
		vec2 coord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);
		vec2 bin = vec2(1. / viewport.zw);

		//collect 5 closest magnitudes
		float magnitude[5];
		magnitude[0] = texture2D(frequencies, vec2(f(coord.x - 2.*bin.x), 0)).w;
		magnitude[1] = texture2D(frequencies, vec2(f(coord.x - bin.x), 0)).w;
		magnitude[2] = texture2D(frequencies, vec2(f(coord.x), 0)).w;
		magnitude[3] = texture2D(frequencies, vec2(f(coord.x + bin.x), 0)).w;
		magnitude[4] = texture2D(frequencies, vec2(f(coord.x + 2.*bin.x), 0)).w;

		//pick distances to nearby magnitudes
		float dist[5];
		dist[0] = (magnitude[0] - coord.y) / max(magnitude[0] + 2.*bin.y, 1e-20);
		dist[1] = (magnitude[1] - coord.y) / max(magnitude[1] + 1.*bin.y, 1e-20);
		dist[2] = (magnitude[2] - coord.y) / max(magnitude[2], 1e-20);
		dist[3] = (magnitude[3] - coord.y) / max(magnitude[3] + 1.*bin.y, 1e-20);
		dist[4] = (magnitude[4] - coord.y) / max(magnitude[4] + 2.*bin.y, 1e-20);

		float intensity = (dist[0] * kernel[0] + dist[1] * kernel[1] + dist[2] * kernel[2] + dist[3] * kernel[3] + dist[4] * kernel[4]) / kernelWeight;

		// texture2D();

		gl_FragColor = vec4(vec3(intensity), 1);
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

Spectrum.prototype.smoothing = 0.2;

Spectrum.prototype.grid = true;

Spectrum.prototype.logarithmic = true;

Spectrum.prototype.orientation = 'horizontal';

//required to detect frequency resolution
Spectrum.prototype.sampleRate = 44100;

//colors to map spectrum against
Spectrum.prototype.colorMap = 'hot';
Spectrum.prototype.colorMapTextureUnit = 1;


//TODO: line (with tail), bars,
Spectrum.prototype.style = 'classic';

//5-items linear kernel for smoothing frequencies
Spectrum.prototype.kernel = [1, 2, 3, 2, 1];


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
