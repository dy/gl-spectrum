/**
 * Simplified 2d version of spectrum
 */

var Spectrum = require('./lib/core');
var clamp = require('mumath/clamp');
var mix = require('mumath/mix');
var spiral = require('spiral-2d');


module.exports = Spectrum;

Spectrum.prototype.context = '2d';


//return color based on current palette
Spectrum.prototype.getColor = function (ratio) {
	var cm = this.fillData;
	ratio = clamp(ratio, 0, 1);
	var idx = ratio*(cm.length*.25 - 1);
	var amt = idx % 1;
	var left = cm.slice(Math.floor(idx)*4, Math.floor(idx)*4 + 4);
	var right = cm.slice(Math.ceil(idx)*4, Math.ceil(idx)*4 + 4);
	var values = left.map((v,i) => (v * (1 - amt) + right[i] * amt)|0 );
	return values;
}


//generic draw
Spectrum.prototype.draw = function () {
	var ctx = this.context;

	var type = ''+this.type;
	var isLine = /line/.test(type);
	var isFill = /fill/.test(type);
	var isBar = /bar/.test(type);

	ctx.clearRect.apply(ctx,this.viewport);

	this.drawSpiral(this.magnitudes);

	// if (isLine) return this.drawLine(this.magnitudes);
	// else if (isBar) return this.drawBar(this.magnitudes);
	// return this.drawFill();
};


Spectrum.prototype.drawSpiral = function (data) {
	var ctx = this.context;
	var width = this.viewport[2],
		height = this.viewport[3];
	var center = [width*.5, height*.5];
	var balance = .5;

	//log spiral
	if (this.logarithmic) {
		var startAngle = Math.PI * Math.log10(this.minFrequency) * 2;
		var endAngle = Math.PI * Math.log10(this.maxFrequency) * 2;

		if (width > height) {
			var b = spiral.logarithmic.b(height*.5, endAngle, 1);
		}
		else {
			var b = spiral.logarithmic.b(width*.5, endAngle, 1);
		}


		//paint spiral curve in canvas
		ctx.beginPath();
		var coords = spiral.logarithmic(center, startAngle, 1, b);
		ctx.moveTo(coords[0], coords[1]);

		//draw spiral
		for (var angle = startAngle; angle <= endAngle; angle+=0.1) {
			coords = spiral.logarithmic(center, angle, 1, b);
			ctx.lineTo(coords[0], coords[1]);
		}
		ctx.lineWidth = this.width;
		ctx.strokeStyle = `rgba(${this.getColor(1)})`;
		ctx.stroke();


		//draw bars
		var ratio = 0, maxAmp = 0, amp = 0, nf, f, x, offset;
		// var gradient = ctx.createLinearGradient(this.viewport[0],0,width,0);
		// gradient.addColorStop(0, `rgba(${this.getColor(0.5)})`)

		var coords = spiral.logarithmic(center, startAngle, 1, b);
		ctx.moveTo(coords[0], coords[1]);

		for (var i = 0; i < data.length; i++) {
			nf = (i + .5) / data.length;
			f = this.unf(nf);

			angle = f * (endAngle - startAngle) + startAngle;

			amp = data[i];
			relativeAmp = (amp + 100) / (this.peak + 100);
			amp = clamp((amp - this.minDecibels) / (this.maxDecibels - this.minDecibels), 0, 1);

			ratio = (angle - startAngle) / (endAngle - startAngle);
			maxAmp = spiral.radius(angle, 1, b) - spiral.radius(angle - Math.PI * 2, 1, b);

			var radius = amp * maxAmp;
			var from = spiral.logarithmic(center, angle, 1, b);
			var to = [-radius * Math.cos(angle) + from[0], -radius * Math.sin(angle) + from[1]];

			ctx.beginPath();
			ctx.moveTo(from[0], from[1]);
			ctx.lineTo(to[0], to[1]);
			ctx.strokeStyle = `rgba(${this.getColor( amp*balance + relativeAmp*(1 - balance) )})`;
			ctx.stroke();
		}

	}

	//archimedean spiral
	else {
		if (width > height) {
			var b = spiral.archimedean.b(width*.5, Math.PI * 4, 0);
		}
		else {
			var b = spiral.archimedean.b(height*.5, Math.PI * 4, 0);
		}

		//paint spiral curve in canvas
		ctx.beginPath();
		ctx.moveTo(center[0], center[1]);
		for (var angle = 0; angle <= Math.PI * 4; angle+=0.01) {
			var coords = spiral.archimedean(center, angle, 0, b);
			ctx.lineTo(coords[0], coords[1]);
		}

		ctx.lineWidth = this.width;
		ctx.strokeStyle = `rgba(${this.getColor(.5)})`;
		ctx.stroke();
	}

	return this;
};


//render line-style
Spectrum.prototype.drawLine = function () {
	var ctx = this.context;
	var width = this.viewport[2],
		height = this.viewport[3];

	ctx.lineWidth = this.trail ? this.width * 2 : this.width;

	//draw trail
	var gradient = ctx.createLinearGradient(this.viewport[0],0,width,0);
	this.createShape(this.trailMagnitudes, gradient);
	ctx.fillStyle = gradient;
	ctx.strokeStyle = `rgba(${this.getColor(1)})`;
	ctx.stroke();
	if (this.trail) {
		ctx.fill();
	}

	//draw main magnitudes
	this.createShape(this.magnitudes);
	ctx.strokeStyle = gradient;
	ctx.fillStyle = gradient;

	if (this.trail) {
		ctx.save();
		ctx.globalCompositeOperation = 'xor';
		ctx.fillStyle = 'rgba(0,0,0,1)';
		ctx.fill();
		ctx.restore();
	}

	return this;
};


//render fill-style
Spectrum.prototype.drawFill = function () {
	var ctx = this.context;
	var width = this.viewport[2],
		height = this.viewport[3];


	ctx.lineWidth = this.width;

	//draw trail
	var gradient = ctx.createLinearGradient(this.viewport[0],0,width,0);
	this.createShape(this.trailMagnitudes, gradient);
	ctx.fillStyle = gradient;
	ctx.strokeStyle = `rgba(${this.getColor(1)})`;
	if (this.trail) {
		ctx.stroke();
	}

	//draw main magnitudes
	this.createShape(this.magnitudes);
	ctx.strokeStyle = gradient;
	ctx.fillStyle = gradient;

	ctx.fill();

	return this;
};


//render bar-style
//FIXME: ponder on making even bars for log fn
Spectrum.prototype.drawBar = function () {
	var ctx = this.context;
	var prevX = -1, prevOffset = -1, nf, f, x, offset, amp;

	var width = this.viewport[2],
		height = this.viewport[3];

	var magnitudes = this.magnitudes;
	var trail = this.trailMagnitudes;
	var barWidth;

	for (var i = .5; i < magnitudes.length; i++) {
		nf = i / magnitudes.length;
		f = this.unf(nf);

		x = f * width;
		offset = nf * (magnitudes.length - 1);

		barWidth = Math.min(this.width, Math.abs(x - prevX));
		if (x === prevX) continue;
		prevX = x|0;
		if (offset === prevOffset) continue;
		prevOffset = offset|0;

		amp = magnitudes[offset|0];
		amp = clamp((amp - this.minDecibels) / (this.maxDecibels - this.minDecibels), 0, 1);

		ctx.fillRect(x - barWidth, (height*(1 - this.align) - amp*height*(1 - this.align) ), barWidth, (amp*height));
	}

	if (this.trail) {
		ctx.fillStyle = `rgba(${this.getColor(1)})`;
		prevX = 0;
		for (var i = .5; i < trail.length; i++) {
			nf = i / trail.length;
			f = this.unf(nf);

			x = f * width;
			offset = nf * (trail.length - 1);

			barWidth = Math.min(this.width, x - prevX);

			if (x === prevX) continue;
			prevX = x|0;
			if (offset === prevOffset) continue;
			prevOffset = offset|0;

			amp = trail[offset|0];
			amp = clamp((amp - this.minDecibels) / (this.maxDecibels - this.minDecibels), 0, 1);


			ctx.fillRect(x - barWidth, (height*(1 - this.align) - amp*height*(1 - this.align) ), barWidth, 1);
			ctx.fillRect(x - barWidth, (height*(1 - this.align) - amp*height*(1 - this.align) + amp*height ) - 1, barWidth, 1);
		}
	}

	return this;
};


//create shape for a data in rect view
Spectrum.prototype.createShape = function (data, gradient) {
	var ctx = this.context;
	var prevX = -1, prevOffset = -1, nf, f, x, offset, amp, relativeAmp;
	var padding = 40;
	var balance = .5;

	var width = this.viewport[2],
		height = this.viewport[3];

	ctx.beginPath();
	ctx.moveTo(-padding, height * (1 - this.align));
	gradient && gradient.addColorStop(0, `rgba(${this.getColor(0.5)})`);

	for (var i = 0; i < data.length; i++) {
		nf = (i + .5) / data.length;
		f = this.unf(nf);

		x = f * width;
		offset = nf * (data.length - 1);

		amp = mix(data[offset|0], data[(offset+1)|0], offset%1);
		relativeAmp = (amp + 100) / (this.peak + 100);
		amp = clamp((amp - this.minDecibels) / (this.maxDecibels - this.minDecibels), 0, 1);
		gradient && gradient.addColorStop(f, `rgba(${this.getColor( amp*balance + relativeAmp*(1 - balance) )})`);
		ctx.lineTo(x, (height*(1 - this.align) - amp*height*(1 - this.align) ));
	}

	prevOffset = -1;
	prevX = -1;
	ctx.lineTo(width+padding, height * (1 - this.align));
	for (var i = data.length - 1; i>=0; i--) {
		nf = (i + .5) / data.length;
		f = this.unf(nf);

		x = f * width;
		offset = nf * (data.length - 1);

		amp = mix(data[offset|0], data[(offset+1)|0], offset%1);
		amp = clamp((amp - this.minDecibels) / (this.maxDecibels - this.minDecibels), 0, 1);

		ctx.lineTo(x, (height*(1 - this.align) + amp*height*(this.align) ));
	}
	ctx.lineTo(-padding, height * (1 - this.align));
	ctx.closePath();

	return this;
};


//get linear f from logarithmic f
Spectrum.prototype.f = function (ratio, log) {
	log = log == null ? this.logarithmic : log;

	var halfRate = this.sampleRate * .5;
	var leftF = this.minFrequency / halfRate;
	var rightF = this.maxFrequency / halfRate;

	//forward action
	if (log) {
		var logF = Math.pow(10.,
			Math.log10(this.minFrequency) + ratio * (Math.log10(this.maxFrequency) - Math.log10(this.minFrequency))
		);
		ratio = (logF - this.minFrequency) / (this.maxFrequency - this.minFrequency);
	}


	ratio = leftF + ratio * (rightF - leftF);

	return ratio;
};

//get log-shifted f from linear f
Spectrum.prototype.unf = function (ratio, log) {
	log = log == null ? this.logarithmic : log;

	var halfRate = this.sampleRate * .5;
	var leftF = this.minFrequency / halfRate;
	var rightF = this.maxFrequency / halfRate;

	//back action
	ratio = (ratio - leftF) / (rightF - leftF);

	if (log) {
		var logRatio = ratio * (this.maxFrequency - this.minFrequency) + this.minFrequency;

		ratio = (Math.log10(logRatio) - Math.log10(this.minFrequency)) / (Math.log10(this.maxFrequency) - Math.log10(this.minFrequency));
	}

	return clamp(ratio, 0, 1);
};
