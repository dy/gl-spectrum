/**
 * @module  gl-spectrum
 */

const Spectrum = require('./lib/core');
const clamp = require('mumath/clamp');

module.exports = Spectrum;

Spectrum.prototype.init = function () {
	var gl = this.gl;

	//setup alpha
	gl.enable( gl.BLEND );
	gl.blendEquation( gl.FUNC_ADD );
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	this.alignLocation = gl.getUniformLocation(this.program, 'align');
	this.minFrequencyLocation = gl.getUniformLocation(this.program, 'minFrequency');
	this.maxFrequencyLocation = gl.getUniformLocation(this.program, 'maxFrequency');
	this.logarithmicLocation = gl.getUniformLocation(this.program, 'logarithmic');
	this.sampleRateLocation = gl.getUniformLocation(this.program, 'sampleRate');
	this.trailLocation = gl.getUniformLocation(this.program, 'trail');
	this.balanceLocation = gl.getUniformLocation(this.program, 'balance');
	this.peakLocation = gl.getUniformLocation(this.program, 'peak');

	this.setTexture({
		frequencies: {
			type: gl.UNSIGNED_BYTE,
			filter: gl.LINEAR,
			wrap: gl.CLAMP_TO_EDGE,
			format: gl.ALPHA
		},
		fill: {
			type: gl.UNSIGNED_BYTE,
			format: gl.RGBA,
			// filter: gl.LINEAR,
			// wrap: gl.CLAMP_TO_EDGE,
			filter: gl.LINEAR,
			wrap: gl.CLAMP_TO_EDGE,
		}
	});

	this.on('push', (magnitudes, peak) => {
		//map mags to 0..255 range limiting by db subrange
		magnitudes = magnitudes.map((value) => clamp(255 * (1 + value / 100), 0, 255));

		this.gl.uniform1f(this.peakLocation, peak * .01 + 1);

		this.setTexture('frequencies', magnitudes);
	});

	this.on('resize', () => {
		this.recalc();
	});

	this.on('update', () => {

		//update verteces
		this.recalc();

		//update uniforms
		this.gl.uniform1f(this.alignLocation, this.align);
		this.gl.uniform1f(this.minFrequencyLocation, this.minFrequency);
		this.gl.uniform1f(this.maxFrequencyLocation, this.maxFrequency);
		this.gl.uniform1f(this.logarithmicLocation, this.logarithmic ? 1 : 0);
		this.gl.uniform1f(this.sampleRateLocation, this.sampleRate);
		this.gl.uniform1f(this.balanceLocation, this.balance || 0);
	})
}


Spectrum.prototype.antialias = true;
Spectrum.prototype.premultipliedAlpha = true;
Spectrum.prototype.alpha = true;
Spectrum.prototype.float = false;


//colors to map spectrum against
Spectrum.prototype.balance = .65;

Spectrum.prototype.type = 'bar';


//scale verteces to frequencies values and apply alignment
Spectrum.prototype.vert = `
	precision highp float;

	attribute vec2 position;

	uniform sampler2D frequencies;
	uniform float align;
	uniform float minFrequency;
	uniform float maxFrequency;
	uniform float logarithmic;
	uniform float sampleRate;
	uniform vec4 viewport;
	uniform float peak;

	varying float vDist;
	varying float vMag;
	varying float vLeft;

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

		float mag = texture2D(frequencies, vec2(f(coord.x), 0.5)).w;
		mag = clamp(mag, 0., 1.);

		vMag = mag;
		vLeft = coord.x;

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
	uniform vec4 viewport;
	uniform float align;
	uniform float trail;
	uniform float peak;
	uniform float balance;

	varying float vDist;
	varying float vMag;
	varying float vLeft;

	vec2 coord;

	float decide (float a, float b, float w) {
		return step(0.5, w) * b + step(w, 0.5) * a;
	}

	void main () {
		coord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);

		float mag = vMag;

		//calc dist
		float dist = abs(vDist);

		//calc intensity
		float intensity = pow(dist, .85) * balance + pow(mag/peak, 1.25) * (1. - balance);
		intensity /= (peak * .48 + .5);
		intensity = intensity * .85 + .15;

		gl_FragColor = vec4(vec3(1), 1);
		vec4 fillColor = texture2D(fill, vec2(max(0., intensity) + trail * (mag * .5 / peak + .15 ), coord.x));
		fillColor.a = 1.;
		gl_FragColor = fillColor;
	}
`;


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
		this.setTexture('frequencies', this.trailFrequencies.map(v => clamp(255 * (v * .01 + 1), 0, 255) ));
		gl.drawArrays(gl.LINES, 0, this.attributes.position.data.length / 2);
		gl.uniform1f(this.trailLocation, 0);
	}

	return this;
};
