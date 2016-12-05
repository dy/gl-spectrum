/**
 * @module  gl-spectrum/gl
 */
'use strict'

const Spectrum = require('./core')
const clamp = require('mumath/clamp')
const inherit = require('inherits')
const rgba = require('color-rgba')
const uniform = require('gl-util/uniform')
const attribute = require('gl-util/attribute')
const texture = require('gl-util/texture')
const setProgram = require('gl-util/program')

module.exports = GlSpectrum;


inherit(GlSpectrum, Spectrum);

function GlSpectrum (opts) {
	if (!(this instanceof GlSpectrum)) return new GlSpectrum(opts);

	Spectrum.call(this, opts);

	var gl = this.gl = this.context;

	this.program = setProgram(gl, this.vert, this.frag);

	texture(this.gl, 'position', {usage: gl.STREAM_DRAW, size: 2})
	texture(this.gl, 'colormap', {
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
		let gl = this.gl;

		setProgram(gl, this.program);

		//update uniforms
		uniform(gl, 'align', this.align, this.program);
		uniform(gl, 'balance', this.balance, this.program);
		uniform(gl, 'minFrequency', this.minFrequency, this.program);
		uniform(gl, 'maxFrequency', this.maxFrequency, this.program);
		uniform(gl, 'minDb', this.minDb, this.program);
		uniform(gl, 'maxDb', this.maxDb, this.program);
		uniform(gl, 'logarithmic', this.log ? 1 : 0, this.program);
		uniform(gl, 'sampleRate', this.sampleRate, this.program);
		uniform(gl, 'shape', [this.canvas.width, this.canvas.height], this.program);

		this.infoColorArr = rgba(this.infoColor);
		this.infoColorArr[3] *= this.trailAlpha;

		this.bgArr = rgba(this.background || 'white');

		this.isFlat = this.palette.length === 1;

		if (this.isFlat) {
			this.colorArr = rgba(this.palette[0]);
		}

		let colormap = [];
		for (let i = 0; i < this.levels; i++) {
			let channels = rgba(this.getColor((i + .5)/this.levels), false);
			colormap.push(channels[0])
			colormap.push(channels[1])
			colormap.push(channels[2])
			colormap.push(channels[3]*255)
		}
		texture(this.gl, 'colormap', colormap);
	})

	this.update();
}



GlSpectrum.prototype.antialias = true;
GlSpectrum.prototype.alpha = false;
GlSpectrum.prototype.premultipliedAlpha = true;
GlSpectrum.prototype.preserveDrawingBuffer = false;
GlSpectrum.prototype.depth = false;
GlSpectrum.prototype.stencil = false;


/**
 * Recalculate number of verteces
 */
GlSpectrum.prototype.calcPositions = function (type, magnitudes) {
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
		let w = this.barWidth / this.canvas.width;

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


GlSpectrum.prototype.render = function () {
	this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
	if (!this.alpha) {
		let bg = this.bgArr;
		this.gl.clearColor(...bg);
		this.gl.clear(this.gl.COLOR_BUFFER_BIT);
	}
	this.emit('render')
	this.draw();
}


/**
 * Render main loop
 */
GlSpectrum.prototype.draw = function () {
	setProgram(this.gl, this.program);

	let gl = this.gl;

	if (this.positions) {
		uniform(this.gl, 'alpha', 1, this.program);
		uniform(this.gl, 'peak', this.peak, this.program);
		uniform(this.gl, 'flatFill', this.isFlat ? 1 : 0, this.program);
		attribute(this.gl, 'position', this.positions);
		if (this.isFlat) uniform(this.gl, 'color', this.colorArr, this.program);

		//draw fill
		if (this.type === 'line') {
			gl.drawArrays(gl.LINE_STRIP, 0, this.positions.length/2);
		}
		else {
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.positions.length/2);
		}

		//draw trail
		if (this.trail) {
			uniform(this.gl, 'alpha', this.trailAlpha, this.program);
			uniform(this.gl, 'flatFill', this.isFlat ? 1 : 0, this.program);
			uniform(this.gl, 'balance', this.balance*.5, this.program);
			if (this.isFlat) uniform(this.gl, 'color', this.infoColorArr, this.program);
			uniform(this.gl, 'peak', this.trailPeak, this.program);
			attribute(this.gl, 'position', this.trailPositions);
			gl.drawArrays(gl.LINE_STRIP, 0, this.trailPositions.length/2);
			uniform(this.gl, 'balance', this.balance, this.program);
		}
	}

	//draw grid
	if (this.grid) {
		this.grid.draw();
	}

	return this;
};




//vertex shader applies alignment mapping
GlSpectrum.prototype.vert = `
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



GlSpectrum.prototype.frag = `
	precision highp float;

	uniform sampler2D colormap;
	uniform vec2 shape;
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
			vec2 coord = gl_FragCoord.xy / shape;

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
