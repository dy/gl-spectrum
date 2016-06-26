/**
 * Simplified 2d version of spectrum
 */

var Spectrum = require('./lib/core');
var clamp = require('mumath/clamp');

module.exports = Spectrum;

Spectrum.prototype.context = '2d';


//convert normal f to relative f
Spectrum.prototype.f = function (ratio) {
	var halfRate = this.sampleRate * .5;
	if (this.logarithmic) {
		var logF = Math.pow(10., Math.log10(this.minFrequency) + ratio * (Math.log10(this.maxFrequency) - Math.log10(this.minFrequency)) );
		ratio = (logF - this.minFrequency) / (this.maxFrequency - this.minFrequency);
	}

	var leftF = this.minFrequency / halfRate;
	var rightF = this.maxFrequency / halfRate;

	ratio = leftF + ratio * (rightF - leftF);

	return ratio;
}

//return color based on current palette
Spectrum.prototype.getColor = function (ratio) {
	var cm = this.fillData;
	var idx = (ratio*(cm.length - 1)*.25)|0;
	var left = cm.slice(Math.floor(idx)*4, Math.floor(idx)*4 + 4);
	var right = cm.slice(Math.ceil(idx)*4, Math.ceil(idx)*4 + 4);
	var amt = idx % 1;
	var values = left.map((v,i) => (v * (1 - amt) + right[i] * amt)|0 );
	return values;
}


//
Spectrum.prototype.draw = function () {
	var ctx = this.context;
	var width = this.viewport[2],
		height = this.viewport[3];
	var data = this.magnitudes;

	var type = ''+this.type;
	var isLine = /line/.test(type);
	var isFill = /fill/.test(type);
	var isBar = /bar/.test(type);

	ctx.clearRect.apply(ctx,this.viewport);

	//FIXME: value of 1 fucks up here and in gl-spectrum apparently
	ctx.fillStyle = `rgba(${this.getColor(1)})`;
	ctx.strokeStyle = `rgba(${this.getColor(1)})`;
	ctx.lineWidth = this.width;

	var prevX = -1, prevOffset = -1, nf, f, x, offset, amp, relativeAmp;

	var gradient = ctx.createLinearGradient(this.viewport[0],0,width,0);

	//build shape
	ctx.beginPath();
	ctx.moveTo(-10, height * (1 - this.align));
	gradient.addColorStop(0, `rgba(${this.getColor(0)})`);
	for (var i = 0; i < data.length; i++) {
		nf = i / data.length;
		f = this.f(nf);

		x = nf * width;
		offset = Math.floor(f * data.length);

		if (offset === prevOffset) continue;
		prevOffset = offset;

		amp = data[offset];
		relativeAmp = this.peak / amp;
		amp = clamp((amp - this.minDecibels) / (this.maxDecibels - this.minDecibels), 0, 1);

		gradient.addColorStop(x/width, `rgba(${this.getColor( amp*.5+relativeAmp*.5 )})`);
		ctx.lineTo(x, (height*(1 - this.align) - amp*height*(1 - this.align) ));
	}

	prevOffset = -1;
	ctx.lineTo(width+10, height * (1 - this.align));
	for (var i = data.length; i>0; i--) {
		nf = i / data.length;
		f = this.f(nf);

		x = nf * width;
		offset = Math.ceil(f * data.length);

		if (offset === prevOffset) continue;
		prevOffset = offset;

		amp = data[offset];
		amp = clamp((amp - this.minDecibels) / (this.maxDecibels - this.minDecibels), 0, 1);

		ctx.lineTo(x, (height*(1 - this.align) + amp*height*(this.align) ));
	}
	ctx.lineTo(-10, height * (1 - this.align));
	ctx.closePath();

	ctx.strokeStyle = gradient;
	ctx.fillStyle = gradient;
	(isLine || isFill) && ctx.stroke();
	isFill && ctx.fill();

	if (isBar) {
		for (var i = 0; i < data.length; i++) {
			nf = i / data.length;
			f = this.f(nf);

			x = nf * width;
			offset = f * data.length;

			// if (x === prevX) continue;
			if (offset - prevOffset < 1) continue;
			prevX = x|0;
			prevOffset = offset;

			amp = data[offset|0];
			amp = clamp((amp - this.minDecibels) / (this.maxDecibels - this.minDecibels), 0, 1);

			ctx.fillRect(x, (height*(1 - this.align) - amp*height*(1 - this.align) ), this.width, (amp*height));
		}
	}

}