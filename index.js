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
		var kernelLocation = gl.getUniformLocation(this.program, "kernel[0]");
		var kernelWeightLocation = gl.getUniformLocation(this.program, "kernelWeight");
		gl.uniform1fv(kernelLocation, this.kernel);
		gl.uniform1f(kernelWeightLocation, this.kernel.reduce((prev, curr) => prev + curr, 0));
	}
	else {

	}

	this.grid = createGrid({
		container: this.container,
		viewport: this.viewport,
		lines: [{
			min: this.minFrequency,
			max: this.maxFrequency,
			orientation: 'x',
			logarithmic: true,
			titles: function (value) {
				return value >= 1000 ? ((value / 1000).toFixed(0) + 'k') : value;
			}
		}, {
			min: this.minDecibels,
			max: this.maxDecibels,
			orientation: 'y'
		}, {
			min: this.minFrequency,
			max: this.maxFrequency,
			orientation: 'x',
			logarithmic: true,
			values: function (value) {
				var str = value.toString();
				if (str[0] !== '1') return null;
				return value;
			},
			style: {
				borderLeftStyle: 'solid'
			}
		}],
		axes: this.gridAxes && [{
			name: 'Frequency',
			labels: function (value, i, opt) {
				var str = value.toString();
				if (str[0] !== '2' && str[0] !== '1' && str[0] !== '5') return null;
				return opt.titles[i];
			}
		}, {
			name: 'Magniture'
		}]
	});

	this.on('resize', (vp) => console.log(vp) && this.grid.update({
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

	float frequency;
	float intensity;

	void main () {
		vec2 coord = (gl_FragCoord.xy - viewport.xy) / viewport.zw;
		float onePixel = 1. / viewport.z;

		//weighted value of intensity
		intensity =
			texture2D(frequencies, coord + onePixel * vec2(-2, 0)).w * kernel[0] +
			texture2D(frequencies, coord + onePixel * vec2(-1, 0)).w * kernel[1] +
			texture2D(frequencies, coord + onePixel * vec2( 0, 0)).w * kernel[2] +
			texture2D(frequencies, coord + onePixel * vec2( 1, 0)).w * kernel[3] +
			texture2D(frequencies, coord + onePixel * vec2( 2, 0)).w * kernel[4];
		intensity /= kernelWeight;

		// gl_FragColor = vec4(vec3(intensity*20.), 1);

		float dist = abs(coord.y - intensity);
		gl_FragColor = vec4(vec3(1. - smoothstep(0.0, 0.04, dist)), 1);

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


//TODO: line (with tail), bars,
Spectrum.prototype.style = 'classic';

//5-items linear kernel for smoothing frequencies
Spectrum.prototype.kernel = [1, 2, 20, 2, 1];


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
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

	return texture;
}
