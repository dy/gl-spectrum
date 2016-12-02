/**
 * @module  gl-spectrum/gl
 */
'use strict'

const Spectrum = require('./core')
const clamp = require('mumath/clamp')
const inherit = require('inherits')
const rgba = require('color-rgba')

module.exports = GlSpectrum;


inherit(GlSpectrum, Spectrum);

function GlSpectrum (opts) {
	if (!(this instanceof GlSpectrum)) return new GlSpectrum(opts);

	Spectrum.call(this, opts);

	var gl = this.gl;

	//setup alpha
	gl.enable( gl.BLEND );
	gl.blendEquation( gl.FUNC_ADD );
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	this.setTexture('colormap', {
		type: gl.UNSIGNED_BYTE,
		format: gl.RGBA,
		filter: gl.LINEAR,
		wrap: gl.CLAMP_TO_EDGE,
		height: this.levels,
		width: 1
	});

	this.on('data', (magnitudes, peak) => {
		this.recalc(magnitudes, peak);
	});

	this.on('update', () => {
		//update uniforms
		this.setUniform('align', this.align);
		this.setUniform('balance', this.balance);

		this.setUniform('minFrequency', this.minFrequency);
		this.setUniform('maxFrequency', this.maxFrequency);
		this.setUniform('minDb', this.minDb);
		this.setUniform('maxDb', this.maxDb);
		this.setUniform('logarithmic', this.log ? 1 : 0);
		this.setUniform('sampleRate', this.sampleRate);

		this.infoColorArr = rgba(this.infoColor);
		this.infoColorArr[3] *= .4;

		this.isFlat = this.palette.length === 1;

		if (this.isFlat) {
			let channels = rgba(this.palette, false);
			channels[3] *= 255;
			this.setUniform('color', channels);
		}
		else {
			let colormap = [];
			for (let i = 0; i < this.levels; i++) {
				let channels = rgba(this.getColor((i + .5)/this.levels), false);
				colormap.push(channels[0])
				colormap.push(channels[1])
				colormap.push(channels[2])
				colormap.push(channels[3]*255)
			}
			this.setTexture('colormap', colormap);
		}
	})

	this.update();
}




/**
 * Recalculate number of verteces
 */
Spectrum.prototype.recalc = function (magnitudes, peak) {
	if (!magnitudes) magnitudes = this.magnitudes;

	var positions = [], l = magnitudes.length;

	//creating vertices every time is not much slower than
	if (this.type === 'line') {
		for (let i = 0; i < l; i++) {
			positions[i*2] = i/l;
			positions[i*2 + 1] = magnitudes[i];
		}
		for (let i = l-1, j = 0; j < l; i--, j++) {
			positions[l*2 + j*2] = i/l;
			positions[l*2 + j*2 + 1] = -magnitudes[i];
		}
	}
	else if (this.type === 'fill') {
		for (let i = 0; i < l; i++) {
			positions.push(i/l);
			positions.push(magnitudes[i]);
			positions.push(i/l);
			positions.push(-magnitudes[i]);
		}
	}
	else {
		let w = this.barWidth / (this.viewport[2] - this.viewport[0]);

		for (let i = 0; i < l; i++) {
			let x = i/l;

			//left break
			positions.push(x);
			positions.push(magnitudes[i]);
			positions.push(x);
			positions.push(magnitudes[i]);

			//bar square
			positions.push(x);
			positions.push(magnitudes[i]);
			positions.push(x + w);
			positions.push(magnitudes[i]);
			positions.push(x);
			positions.push(-magnitudes[i]);
			positions.push(x + w);
			positions.push(-magnitudes[i]);

			//right break
			positions.push(x + w);
			positions.push(-magnitudes[i]);
			positions.push(x + w);
			positions.push(-magnitudes[i]);
		}
	}

	this.positions = positions;

	return this;
};


/**
 * Render main loop
 */
Spectrum.prototype.draw = function (gl) {
	//draw data
	if (!this.positions) return this;

	this.setUniform('peak', this.peak);
	this.setAttribute('position', this.positions);

	this.setUniform('flatFill', this.isFlat ? 1 : 0);

	if (this.type === 'line') {
		// if (this.trail) {
		// 	this.setUniform('type', 2);
		// 	gl.drawArrays(gl.TRIANGLE_STRIP, 0, count);
		// }
		// this.setUniform('type', 1);
		gl.drawArrays(gl.LINE_STRIP, 0, this.positions.length/2);
	}
	else {
		// this.setUniform('type', 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.positions.length/2);
		// if (this.trail) {
		// 	this.setUniform('type', 1);
		// 	gl.drawArrays(gl.LINES, 0, count);
		// }
	}


	return this;
};




//vertex shader applies alignment mapping
Spectrum.prototype.vert = `
	precision highp float;

	attribute vec2 position;
	uniform float align;
	uniform float peak;
	uniform float minFrequency;
	uniform float maxFrequency;
	uniform float minDb;
	uniform float maxDb;
	uniform float logarithmic;
	uniform float sampleRate;

	varying float vIntensity;

	float decide (float a, float b, float w) {
		return step(0.5, w) * b + step(w, 0.5) * a;
	}

	float f (float ratio) {
		float halfRate = sampleRate * .5;
		float leftF = minFrequency / halfRate;
		float rightF = maxFrequency / halfRate;

		ratio = (ratio - leftF) / (rightF - leftF);

		float logRatio = ratio * (maxFrequency - minFrequency) + minFrequency;

		logRatio = log(logRatio/minFrequency) / log(maxFrequency/minFrequency);

		ratio = decide(ratio, logRatio, logarithmic);

		return clamp(ratio, 0., 1.);
	}

	void main () {
		vIntensity = abs(position.y)/peak;

		gl_Position = vec4(
			f(position.x) * 2. - 1.,
			(align * 2. - 1.) + step(0., position.y) * position.y * (1. - align) + step(position.y, 0.) * position.y * align,
		0, 1);
	}
`;


`
	precision highp float;

	attribute vec2 position;

	uniform sampler2D magnitudes;
	// uniform sampler2D trail;
	uniform float align;
	uniform float minFrequency;
	uniform float maxFrequency;
	uniform float minDb;
	uniform float maxDb;
	uniform float logarithmic;
	uniform float sampleRate;
	uniform vec4 viewport;
	uniform float width;
	uniform float size;
	uniform float peak;
	// uniform float trailPeak;
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
		return clamp( ((mag - 1.) * 100. - minDb) / (maxDb - minDb), 0., 1.);
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


		// float trail = texture2D(trail, vec2(leftX, 0.5)).w;
		float mag = texture2D(magnitudes, vec2(leftX, 0.5)).w;

		// vIntensity = decide(mag/peak, trail/trailPeak, type);
		vIntensity = mag/peak;

		// trail = m(trail);
		mag = m(mag);

		vMag = mag;

		//map y-coord to alignment
		// mag = decide(mag, trail, type);
		coord.y = coord.y * mag - mag * align + align;

		//save distance from the align
		vDist = (coord.y - align) * (1. / max(align, 1. - align));

		// gl_Position = vec4(position, 0, 1);
		gl_Position = vec4(coord*2. - 1., 0, 1);
	}
`;


Spectrum.prototype.frag = `
	precision highp float;

	uniform sampler2D colormap;
	uniform vec4 viewport;
	uniform float align;
	uniform float peak;
	uniform float balance;
	uniform float flatFill;
	uniform vec4 color;

	varying float vIntensity;

	void main () {
		if (flatFill > 0.) {
			gl_FragColor = color;
		}

		else {
			vec2 coord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);

			float dist = abs(coord.y - align);
			float amt = dist/peak;

			float intensity = pow((amt + dist)*.5 + .5, .8888) * balance + pow(vIntensity, 2.) * (1. - balance);
			intensity = clamp(intensity, 0., 1.);

			vec4 color = texture2D(colormap, vec2(coord.x, intensity));

			gl_FragColor = color;
		}
	}
`;



`
	precision highp float;

	uniform sampler2D colormap;
	uniform vec4 viewport;
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


		vec4 color = texture2D(colormap, vec2(intensity, coord.x));
		color.a = 1.;

		// gl_FragColor = color;
		gl_FragColor = vec4(0,0,0,1);
	}
`;
