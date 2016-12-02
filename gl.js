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

	this.on('data', (magnitudes, trail) => {
		this.positions = this.calcPositions(this.type, magnitudes);
		this.trailPositions = this.calcPositions('line', trail);
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
		this.infoColorArr[3] *= this.trailAlpha;

		this.bgArr = rgba(this.background || 'white');

		this.isFlat = this.palette.length === 1;

		if (this.isFlat) {
			this.colorArr = rgba(this.palette);
		}

		let colormap = [];
		for (let i = 0; i < this.levels; i++) {
			let channels = rgba(this.getColor((i + .5)/this.levels), false);
			colormap.push(channels[0])
			colormap.push(channels[1])
			colormap.push(channels[2])
			colormap.push(channels[3]*255)
		}
		this.setTexture('colormap', colormap);
	})

	this.update();
}




/**
 * Recalculate number of verteces
 */
Spectrum.prototype.calcPositions = function (type, magnitudes) {
	if (!magnitudes) magnitudes = this.magnitudes;

	var positions = [], l = magnitudes.length;

	//creating vertices every time is not much slower than
	if (type === 'line') {
		for (let i = 0; i < l; i++) {
			positions[i*2] = i/l;
			positions[i*2 + 1] = magnitudes[i];
		}
		for (let i = l-1, j = 0; j < l; i--, j++) {
			positions[l*2 + j*2] = i/l;
			positions[l*2 + j*2 + 1] = -magnitudes[i];
		}
	}
	else if (type === 'fill') {
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

	return positions;
};


/**
 * Render main loop
 */
Spectrum.prototype.draw = function (gl, viewport) {
	if (!this.glAttribs.alpha) {
		let bg = this.bgArr;
		gl.clearColor(bg[0], bg[1], bg[2], 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	if (this.positions) {
		this.setUniform('alpha', 1);
		this.setUniform('peak', this.peak);
		this.setUniform('flatFill', this.isFlat ? 1 : 0);
		this.setAttribute('position', this.positions);
		if (this.isFlat) this.setUniform('color', this.colorArr);

		//draw fill
		if (this.type === 'line') {
			gl.drawArrays(gl.LINE_STRIP, 0, this.positions.length/2);
		}
		else {
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.positions.length/2);
		}

		//draw trail
		if (this.trail) {
			this.setUniform('alpha', this.trailAlpha);
			this.setUniform('flatFill', this.isFlat ? 1 : 0);
			this.setUniform('balance', this.balance*.5);
			if (this.isFlat) this.setUniform('color', this.infoColorArr);
			this.setUniform('peak', this.trailPeak);
			this.setAttribute('position', this.trailPositions);
			gl.drawArrays(gl.LINE_STRIP, 0, this.trailPositions.length/2);
			this.setUniform('balance', this.balance);
		}
	}

	//draw grid
	if (this.grid) {
		this.grid.redraw();
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
		float minF = max(minFrequency, 1e-5);
		float leftF = minF / halfRate;
		float rightF = maxFrequency / halfRate;

		ratio = (ratio - leftF) / (rightF - leftF);

		float logRatio = ratio * (maxFrequency - minF) + minF;

		logRatio = log(logRatio/minF) / log(maxFrequency/minF);

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



Spectrum.prototype.frag = `
	precision highp float;

	uniform sampler2D colormap;
	uniform vec4 viewport;
	uniform float align;
	uniform float peak;
	uniform float balance;
	uniform float flatFill;
	uniform vec4 color;
	uniform float alpha;

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
			color.a *= alpha;

			gl_FragColor = color;
		}
	}
`;
