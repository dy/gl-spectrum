/**
 * Simplified 2d version of spectrum
 */

var Spectrum = require('./lib/core');
var clamp = require('mumath/clamp');
var mix = require('mumath/mix');

module.exports = Spectrum;

Spectrum.prototype.context = '2d';


//return color based on current palette
// Spectrum.prototype.getColor = function (ratio) {
// 	var cm = this.fillData;
// 	ratio = clamp(ratio, 0, 1);
// 	var idx = (ratio*(cm.length - 1)*.25)|0;
// 	var left = cm.slice(Math.floor(idx)*4, Math.floor(idx)*4 + 4);
// 	var right = cm.slice(Math.ceil(idx)*4, Math.ceil(idx)*4 + 4);
// 	var amt = idx % 1;
// 	var values = left.map((v,i) => (v * (1 - amt) + right[i] * amt)|0 );
// 	return values;
// }

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



//
Spectrum.prototype.draw = function () {
	var ctx = this.context;
	var width = this.viewport[2],
		height = this.viewport[3];

	var type = ''+this.type;
	var isLine = /line/.test(type);
	var isFill = /fill/.test(type);
	var isBar = /bar/.test(type);

	ctx.clearRect.apply(ctx,this.viewport);

	//FIXME: value of 1 fucks up here and in gl-spectrum apparently
	ctx.lineWidth = this.trail ? this.width * 2 : this.width;

	var prevX = -1, prevOffset = -1, nf, f, x, offset, amp, relativeAmp;
	var padding = 40;

	//draw trail
	var gradient = ctx.createLinearGradient(this.viewport[0],0,width,0);
	this.createShape(this.trailMagnitudes, gradient);
	ctx.fillStyle = gradient;
	ctx.strokeStyle = `rgba(${this.getColor(1)})`;
	if ((isFill && this.trail) || isLine) {
		ctx.stroke();
	}
	if (isLine && this.trail) {
		ctx.fill();
	}

	//draw main magnitudes
	this.createShape(this.magnitudes);
	ctx.strokeStyle = gradient;
	ctx.fillStyle = gradient;

	if (isLine && this.trail) {
		ctx.save();
		ctx.globalCompositeOperation = 'xor';
		ctx.fillStyle = 'rgba(0,0,0,1)';
		ctx.fill();
		ctx.restore();
	}
	if (isFill) ctx.fill();


	var magnitudes = this.magnitudes;
	var trail = this.trailMagnitudes;
	var barWidth;
	if (isBar) {
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
	}
};


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
}


//get linear f from logarithmic f
Spectrum.prototype.f = function (ratio) {
	var halfRate = this.sampleRate * .5;
	var leftF = this.minFrequency / halfRate;
	var rightF = this.maxFrequency / halfRate;

	//forward action
	if (this.logarithmic) {
		var logF = Math.pow(10.,
			Math.log10(this.minFrequency) + ratio * (Math.log10(this.maxFrequency) - Math.log10(this.minFrequency))
		);
		ratio = (logF - this.minFrequency) / (this.maxFrequency - this.minFrequency);
	}


	ratio = leftF + ratio * (rightF - leftF);

	return ratio;
};

//get log-shifted f from linear f
Spectrum.prototype.unf = function (ratio) {
	var halfRate = this.sampleRate * .5;
	var leftF = this.minFrequency / halfRate;
	var rightF = this.maxFrequency / halfRate;

	//back action
	ratio = (ratio - leftF) / (rightF - leftF);

	if (this.logarithmic) {
		var logRatio = ratio * (this.maxFrequency - this.minFrequency) + this.minFrequency;

		ratio = (Math.log10(logRatio) - Math.log10(this.minFrequency)) / (Math.log10(this.maxFrequency) - Math.log10(this.minFrequency));
	}

	return clamp(ratio, 0, 1);
};
