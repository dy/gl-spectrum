/**
 * Simplified 2d version of spectrum
 */

var Spectrum = require('./lib/core');


module.exports = Spectrum;


//rendering style: line, bar, fill
Spectrum.prototype.type = 'bar'


//
Spectrum.prototype.draw = function () {
	var ctx = this.context;
	var width = this.viewport[2],
		height = this.viewport[3];
	var data = this.frequencies;

	ctx.clearRect.apply(ctx,this.viewport);

	var prevX = 0;
	for (var i = 0; i < data.length; i++) {
		var nf = i / data.length;
		var f = this.f(nf);
		var x = (f * width)|0;
		if (x === prevX) continue;
		prevX = x;
		var amp = data[(f * data.length)|0] / 255;
		amp = clamp((amp * 100. - 100 - this.minDecibels) / (this.maxDecibels - this.minDecibels), 0, 1);

		if (this.type === 'bar') {
			ctx.fill(x, 0, 1, amp * height);
		}
		else if (this.type === 'line') {

		}
		else {

		}
	}
}