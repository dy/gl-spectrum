/**
 * @module  gl-spectrum
 */

var extend = require('xtend/mutable');
var Component = require('gl-component');
var inherits = require('inherits');


module.exports = Spectrum;



/**
 * @contructor
 */
function Spectrum (options) {
	if (!(this instanceof Spectrum)) return new Spectrum(options);

	Component.call(this, options);

	if (!this.is2d) {
		var gl = this.context;

		var float = gl.getExtension('OES_texture_float');
		if (!float) throw Error('WebGL does not support floats.');
		var floatLinear = gl.getExtension('OES_texture_float_linear');
		if (!floatLinear) throw Error('WebGL does not support floats.');

		//setup data texture
		this.texture = createTexture(gl);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.texture);

		gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, this.frequencies.length, 1, 0, gl.ALPHA, gl.FLOAT, this.frequencies);

		var frequenciesLocation = gl.getUniformLocation(this.program, 'frequencies');
		gl.useProgram(this.program);
		gl.uniform1i(frequenciesLocation, 0);
	}
	else {

	}
}

inherits(Spectrum, Component);


/**
 * Default frag painter code
 */
Spectrum.prototype.frag = `
	precision mediump float;

	uniform sampler2D frequencies;
	uniform vec4 viewport;

	float frequency;
	float intensity;

	void main () {
		vec2 coord = gl_FragCoord.xy / viewport.zw;

		intensity = texture2D(frequencies, vec2(coord.x, 0)).w;

		// gl_FragColor = vec4(vec3(intensity - coord.y), 1);
		gl_FragColor = vec4(vec3(coord.y < intensity ? coord.y : 0.), 1);
	}
`;


//evenly distributed within indicated diapasone
Spectrum.prototype.frequencies = null;

Spectrum.prototype.maxDecibels = 0;
Spectrum.prototype.minDecibels = -90;

Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 20;

Spectrum.prototype.smoothing = 0.2;

Spectrum.prototype.grid = true;

Spectrum.prototype.logFrequency = false;
Spectrum.prototype.logDecibels = false;


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