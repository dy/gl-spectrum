/**
 * @module  gl-spectrum
 */

var extend = require('xtend/mutable');
var Component = require('gl-component');
var inherits = require('inherits');
var lg = require('mumath/lg');
var sf = require('sheetify');
var cssClass = sf('./index.css');
var isBrowser = require('is-browser');


module.exports = Spectrum;



/**
 * @contructor
 */
function Spectrum (options) {
	if (!(this instanceof Spectrum)) return new Spectrum(options);

	var that = this;

	Component.call(this, options);

	if (isBrowser) {
		this.container.classList.add(cssClass);
		this.container.classList.add('gl-spectrum');
	}

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

	if (isBrowser) {
		//detect decades
		var decades = Math.round(lg(this.maxFrequency/this.minFrequency));
		var decadeOffset = lg(this.minFrequency/10);

		//display grid
		this.grid = document.createElement('div');
		this.grid.classList.add('grid');

		//show frequencies
		var line;
		for (var f = this.minFrequency, i = 0; f <= this.maxFrequency; f*=10, i++) {
			line = document.createElement('span');
			line.classList.add('grid-line');
			line.classList.add('grid-line-h');
			if (!i) line.classList.add('grid-line-first');
			line.setAttribute('data-value', f.toLocaleString());
			line.style.left = f2w(f, 100) + '%';
			this.grid.appendChild(line);
		}
		line.classList.add('grid-line-last');

		//draw magnitude limits
		var mRange = this.maxDecibels - this.minDecibels;
		for (var m = this.minDecibels, i = 0; m <= this.maxDecibels; m += 10, i += 10) {
			line = document.createElement('span');
			line.classList.add('grid-line');
			line.classList.add('grid-line-v');
			if (!i) line.classList.add('grid-line-first');
			line.setAttribute('data-value', m.toLocaleString());
			line.style.bottom = 100 * i / mRange + '%';
			this.grid.appendChild(line);
		}
		line.classList.add('grid-line-last');

		this.container.appendChild(this.grid);

		//make grid repeat size of canvas
		this.on('resize', function (viewport) {
			that.grid.style.left = viewport[0] + 'px';
			that.grid.style.top = viewport[1] + 'px';
			that.grid.style.width = viewport[2] + 'px';
			that.grid.style.height = viewport[3] + 'px';
		});

		this.resize();
	}


	/** Map frequency to an x coord */
	function f2w (f, w) {
		var decadeW = w / decades;
		return decadeW * (lg(f) - 1 - decadeOffset);
	};


	/** Map x coord to a frequency */
	function w2f (x, w) {
		var decadeW = w / decades;
		return Math.pow(10, x/decadeW + 1 + decadeOffset);
	};
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
		vec2 coord = (gl_FragCoord.xy - viewport.xy) / viewport.zw;

		intensity = texture2D(frequencies, vec2(coord.x, 0)).w;

		gl_FragColor = vec4(vec3(intensity), step(0.1, intensity) + 0.1);

		float dist = abs(coord.y - intensity);
		// gl_FragColor = vec4(vec3(1. - smoothstep(0.0, 0.04, dist)), 1);
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


Spectrum.prototype.orientation = 'horizontal';


//TODO: line (with tail), bars,
Spectrum.prototype.style = 'classic';


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
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

	return texture;
}
