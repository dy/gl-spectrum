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
	this.minDecibelsLocation = gl.getUniformLocation(this.program, 'minDecibels');
	this.maxDecibelsLocation = gl.getUniformLocation(this.program, 'maxDecibels');
	this.logarithmicLocation = gl.getUniformLocation(this.program, 'logarithmic');
	this.sampleRateLocation = gl.getUniformLocation(this.program, 'sampleRate');
	this.peakLocation = gl.getUniformLocation(this.program, 'peak');
	this.trailPeakLocation = gl.getUniformLocation(this.program, 'trailPeak');
	this.widthLocation = gl.getUniformLocation(this.program, 'width');
	this.sizeLocation = gl.getUniformLocation(this.program, 'size');
	this.typeLocation = gl.getUniformLocation(this.program, 'type');
	this.brightnessLocation = gl.getUniformLocation(this.program, 'brightness');

	this.setTexture({
		magnitudes: {
			type: gl.UNSIGNED_BYTE,
			filter: gl.LINEAR,
			wrap: gl.CLAMP_TO_EDGE,
			format: gl.ALPHA
		},
		trail: {
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

	this.on('data', (magnitudes) => {
		//map mags to 0..255 range limiting by db subrange
		magnitudes = magnitudes.map((value) => clamp(255 * (1 + value / 100), 0, 255));
		var trail = this.trailMagnitudes.map(v => clamp(255 * (v * .01 + 1), 0, 255));

		this.gl.uniform1f(this.peakLocation, this.peak * .01 + 1);
		this.gl.uniform1f(this.trailPeakLocation, this.trailPeak * .01 + 1);

		this.setTexture('magnitudes', magnitudes);
		this.setTexture('trail', trail);
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
		this.gl.uniform1f(this.minDecibelsLocation, this.minDecibels);
		this.gl.uniform1f(this.maxDecibelsLocation, this.maxDecibels);
		this.gl.uniform1f(this.logarithmicLocation, this.logarithmic ? 1 : 0);
		this.gl.uniform1f(this.sampleRateLocation, this.sampleRate);
		this.gl.uniform1f(this.widthLocation, this.width);
		this.gl.uniform1f(this.sizeLocation, this.magnitudes.length);
		this.gl.uniform1f(this.brightnessLocation, 1);
	})
}


Spectrum.prototype.antialias = true;
Spectrum.prototype.premultipliedAlpha = true;
Spectrum.prototype.alpha = true;
Spectrum.prototype.float = false;


//scale verteces to magnitudes values and apply alignment
Spectrum.prototype.vert = `
	precision highp float;

	attribute vec2 position;

	uniform sampler2D magnitudes;
	uniform sampler2D trail;
	uniform float align;
	uniform float minFrequency;
	uniform float maxFrequency;
	uniform float minDecibels;
	uniform float maxDecibels;
	uniform float logarithmic;
	uniform float sampleRate;
	uniform vec4 viewport;
	uniform float width;
	uniform float size;
	uniform float peak;
	uniform float trailPeak;
	uniform float type;

	varying float vDist;
	varying float vMag;
	varying float vIntensity;

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

	float unf (float ratio) {
		float halfRate = sampleRate * .5;
		float leftF = minFrequency / halfRate;
		float rightF = maxFrequency / halfRate;

		ratio = (ratio - leftF) / (rightF - leftF);

		float logRatio = ratio * (maxFrequency - minFrequency) + minFrequency;

		logRatio = (lg(logRatio) - lg(minFrequency)) / (lg(maxFrequency) - lg(minFrequency));

		ratio = decide(ratio, logRatio, logarithmic);

		return clamp(ratio, 0., 1.);
	}

	//bring magnitude to range
	float m (float mag) {
		return clamp( ((mag - 1.) * 100. - minDecibels) / (maxDecibels - minDecibels), 0., 1.);
	}

	void main () {
		vec2 coord = position;

		float c = .01 / size;

		//the bar’s left coord x
		float leftX = floor( (coord.x + c) * size)/size;
		float nextLeftX = ceil( (coord.x + c) * size)/size;

		float isRight = step( .25 / size, coord.x - leftX);

		float widthRatio = width / viewport.z;

		float realLeftX = unf(leftX);
		coord.x = decide(realLeftX, min(unf(nextLeftX), realLeftX + widthRatio), isRight);


		float trail = texture2D(trail, vec2(leftX, 0.5)).w;
		float mag = texture2D(magnitudes, vec2(leftX, 0.5)).w;

		vIntensity = decide(mag/peak, trail/trailPeak, type);

		trail = m(trail);
		mag = m(mag);

		vMag = mag;

		//map y-coord to alignment
		mag = decide(mag, trail, type);
		coord.y = coord.y * mag - mag * align + align;

		//save distance from the align
		vDist = (coord.y - align) * (1. / max(align, 1. - align));

		// gl_Position = vec4(position, 0, 1);
		gl_Position = vec4(coord*2. - 1., 0, 1);
	}
`;

Spectrum.prototype.frag = `
	precision highp float;

	uniform sampler2D fill;
	uniform vec4 viewport;
	uniform float align;
	uniform float width;
	uniform float type;

	const float balance = .5;

	varying float vDist;
	varying float vIntensity;
	varying float vMag;

	vec2 coord;

	float decide (float a, float b, float w) {
		return step(0.5, w) * b + step(w, 0.5) * a;
	}

	void main () {
		coord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);

		float dist = abs(vDist);

		//0-type - render magnitudes
		//1-type - render trail
		//2-type - render variance of trail/mag

		float intensity = pow(dist + .1, .8888) * balance + pow(vIntensity, 2.) * (1. - balance);
		intensity = clamp(intensity, 0., 1.);

		intensity = decide(intensity, (intensity + .333) * 1.1, step(.5, type));

		float widthRatio = (width - .5) / viewport.w;
		float mag = abs(vMag);
		intensity *= decide(1., .5 * smoothstep(.99 * mag, 1.01*mag, dist), type - .5);


		vec4 fillColor = texture2D(fill, vec2(intensity, coord.x));
		fillColor.a = 1.;

		gl_FragColor = fillColor;
	}
`;


/**
 * Recalculate number of verteces
 */
//FIXME: might be need to be called on data push as it takes data length
Spectrum.prototype.recalc = function () {
	var data = [], l = this.magnitudes.length;

	var type = ''+this.type;
	var isBar = /bar/.test(type);
	var isLine = /line/.test(type);
	var isFill = /fill/.test(type);

	//stripe
	if (!isBar) {
		for (var i = 0; i < l; i++) {
			var curr = i/l;
			var next = (i+1)/l;
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

	//bars
	else {
		for (var i = 0; i < l; i++) {
			var curr = i/l;
			var next = (i+.5)/l;
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

	var type = ''+this.type;
	var isLine = /line/.test(type);

	if (isLine) {
		if (this.trail) {
			gl.uniform1f(this.typeLocation, 2);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.attributes.position.data.length / 2);
		}
		gl.uniform1f(this.typeLocation, 1);
		gl.drawArrays(gl.LINES, 0, this.attributes.position.data.length / 2);
	} else {
		gl.uniform1f(this.typeLocation, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.attributes.position.data.length / 2);
		if (this.trail) {
			gl.uniform1f(this.typeLocation, 1);
			gl.drawArrays(gl.LINES, 0, this.attributes.position.data.length / 2);
		}
	}

	return this;
};
