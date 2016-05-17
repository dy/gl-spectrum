/**
 * @module  gl-spectrum
 */

var extend = require('xtend/mutable');
var Component = require('gl-component');
var inherits = require('inherits');
var lg = require('mumath/lg');
var isBrowser = require('is-browser');
var createGrid = require('plot-grid');

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
		this.frequenciesTexture = createTexture(gl);
		this.bindFrequencies(this.frequenciesTextureUnit);
		this.setFrequencies(this.frequencies);

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

	float frequency;
	float magnitude;

	const float log10 = log(10.);

	float lg (float a) {
		return log(a) / log10;
	}

	//TODO: make log light

	float logRatio (float ratio) {
		float frequency = pow(10., lg(minFrequency) + ratio * (lg(maxFrequency) - lg(minFrequency)) );
		return (frequency - minFrequency) / (maxFrequency - minFrequency);
	}

	void main () {
		vec2 coord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);
		float oneStep = 1. / viewport.z;

		if (logarithmic == 1) {
			coord.x = logRatio(coord.x);
			oneStep = logRatio(oneStep);
		}

		//map the whole freq range to visible range
		float halfRate = sampleRate * 0.5;
		float left = minFrequency / halfRate;
		float right = maxFrequency / halfRate;
		coord.x = left + coord.x * (right - left);

		//weighted value of intensity
		magnitude =
			texture2D(frequencies, coord + oneStep * vec2(-2, 0)).w * kernel[0] +
			texture2D(frequencies, coord + oneStep * vec2(-1, 0)).w * kernel[1] +
			texture2D(frequencies, coord + oneStep * vec2( 0, 0)).w * kernel[2] +
			texture2D(frequencies, coord + oneStep * vec2( 1, 0)).w * kernel[3] +
			texture2D(frequencies, coord + oneStep * vec2( 2, 0)).w * kernel[4];
		magnitude /= kernelWeight;

		float dist = (magnitude - coord.y) / magnitude;
		float intensity;
		// if (dist < 0.) {
			// intensity = 2. * exp(-4. * dist) - 1. * exp(-8. * dist);
		// 	intensity = (1. - dist) / sqrt(dist);
		// }
		// else {
			intensity = max(intensity, (1. - log(dist)) / 10.);
		// }

		gl_FragColor = vec4(vec3(intensity), 1);

		// gl_FragColor = vec4(vec3(magnitude*20.), 1);
		// gl_FragColor = vec4(vec3(1. - smoothstep(0.0, 0.04, dist)), 1);
		// gl_FragColor = vec4(vec3(coord.x), 1);
		// gl_FragColor = vec4( vec3( coord.y / 4. > intensity ? 1 : 0) , 1);
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


//TODO: line (with tail), bars,
Spectrum.prototype.style = 'classic';

//5-items linear kernel for smoothing frequencies
Spectrum.prototype.kernel = [1, 2, 10, 2, 1];


/**
 * Set frequencies data
 */
Spectrum.prototype.setFrequencies = function (frequencies) {
	var gl = this.context;

	var frequencies = frequencies || this.frequencies;

	gl.activeTexture(gl.TEXTURE0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, frequencies.length, 1, 0, gl.ALPHA, gl.FLOAT, frequencies);

	return this;
};

/**
 * Bind frequencies texture to a spot
 */
Spectrum.prototype.bindFrequencies = function (unit) {
	var gl = this.context;

	this.frequenciesTextureUnit = unit == null ? this.frequenciesTextureUnit : unit;

	var frequenciesLocation = gl.getUniformLocation(this.program, 'frequencies');
	gl.useProgram(this.program);
	gl.uniform1i(frequenciesLocation, this.frequenciesTextureUnit);

	gl.activeTexture(gl.TEXTURE0 + this.frequenciesTextureUnit);
	gl.bindTexture(gl.TEXTURE_2D, this.frequenciesTexture);

	return this;
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




//create texture
function createTexture (gl) {
	var texture = gl.createTexture();

	gl.activeTexture(gl.TEXTURE0);

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

	return texture;
}
