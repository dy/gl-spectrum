## Q: how to make single-line spectrum?
1. We could provide specific colormap with only >0.9 black.
	- too worrisome
2. We could provide separate program.
	+ We could set a separate optional gradient param, that would work for single-color bars too.

## Q: how to make bars?
1. We could set grouping parameter.
2. We could delegate to a separate program.
	- Yet requires the size of the bar
		+ That is solvable with mask

## Q: what is designation of mask in line-mode?
* Ideally - map line value, instead of smoothstep. So we need thin mask.
	+ That would replace kernel and make it actual.

## Q: how do we make bar’s gradient?
* If we separate it to a program
	+ We could provide optional enabled gradient via param. Related with line-only style.

## Q: how to make dots?
* If we do separate program
	+ Then it is just a way of treating mask - via cycle.

## Q: how do we define mask size?
* Via user input mask size. That is also weight for grouping/averaging.

## Q: how to make glow?
* Via mask. Define custom kernel.

## Q: how to make symmetrical view?
* Via program mode: symmetrical:true

## Q: what should be the gradient of symmetrical view?
* I guess like in line mode, but from the center. It is ok.

## Q: how do we interpolate inter-frequencies? Should we?
+ That would allow for natural nearest/average/linear/smooth views.
* That might be somehow related with bar grouping. And as far bar grouping might be related with mask, we can... interpolate by mask averaging?

## Q: how do we do fill-only style?
* Optinal `fill` or `gradient` param I guess. Related with line-only style.

## Q: how do we define style of filling gradient?
* We could do gradient-mask, or gradient kernel - a set of values representing gradient.
	- It reserves texture spot for really unimportant task. At most - use uniform array. Like, 3 values or 5 values.
	+ That is natural for dots/bar style.
	- We could provide linear grad and let user scale it to log or in some custom way himself. Like reserve values from 0.1 to 0.9 for fill gradient.

## Q: how do we make max/shadow frequencies?
* I guess each program style has it’s own shadow frequency view.
	* For bars it is single mask size
	* For dots it is single mask as well
	* For lines it is ...shadow line?

## Q: what is the API of shadow frequencies?
1. We can set a delay size, related with smoothing param.
	- it definitely should be settable to false, so we need `shadow` or `trail` param.
2. We could pass a separate set of frequencies
	- a texture again...
		+ To avoid texture squatting we could place all technical textures into a sprite.
			+ And delegate it to gl-component.

## Q: how do we make x-colormap?
* Well setting gradient mask a texture would allow for that... Rarely one needs to colorize line, usually just gradient - like phase etc. Basically - mapped colorspace.

## Q: how do we do background image not-plain color?
* Do colormap with 0=transparent.
* Place proper gradientmap?

## Q: should we keep colormap when there are gradient?
* we could just pick extreme gradient values and that’s it.
* better leave colormap but make it 2d-able.

## Q: how do we organize bg rendering?
1. That would be nice to have a simple way to set bg to 0-level of colormap.
	* Therefore, bg should be rendered along by a single component.
2. We could combine it in a single component
	* then we would have to update the gl-component API to include multiple programs, buffers etc.
		- that is lazy for me.
		- reserving gl-component for a single program is quite nice and simple practice.
		+ that would allow for avoiding managing reserved texture spots.

## Q: should we render bg as a separate component, but include it in gl-spectrum?
+ That would allow for reusability in gl-spectrum, gl-waveform etc.
+ That would remove need in combining multiple buffers in single component, we in that case keep things discreet.

## Q: how can we organize a single component combining any type of audio-info: spectrum, waveform or spectrogram?
* call it audio-stats and render anything by a chosen type.
+ That would allow for persistent style across selected components.

## Q: will there be a problem as a result of re-including gl-background in gl-spectrum, gl-waveform etc?
* should not, it should be a single component.

## Q: what is the strategy of mapping log frequencies through vertex shader?
* we should provide freq’s texture as is (linear), and take current vertex coord.x as normal frequency value.
	* Therefore, vertex values should be properly scaled - log and subview

## Q: should our freq texture contain all the freq’s or only subrange?
* all freq’s is clearer, but requires subview recalc within the shader in case
	* ? how do we do this case, how should we map verteces?
		* 0-vertex should be mapped to 0.2 texture for one. 1-vertex to 0.9. How?
		* ideally we should do vertex.x*.5 + .5 and obtain proper texture value.
			- but in this case we force picking interpolated frequency, because freq array should be subviewed for that case.
			+ though the freq texture contains 0..1 subview values.
		* if we subview frequency in vert,
			+ that is less calcs, and also parallel, which is faster than CPU
			- that forces conditioning in shader - decision whether log or real subview
* subview is mapped to 0..1 range, but the fill x-colors are shifted with changing subview.
* So the answer: we map in vertex shaders, conditionless. Pass whole texture as is.

## Q: how is it possible - to avoid subviewing in CPU with falsy interpolation - and at the same time avoid log condition in shader?
* we have to equalize lg(minF) + ratio * (lg(maxF) - lg(minF)) and minF + ratio * (maxF - minF). How to make lg(f) function which with some argument returns f?
	* simple. y = step(0., isLog) * log(x) + x * step(isLog, x) / log(10) ...