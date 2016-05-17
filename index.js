(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var this$1 = this;

  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    args = Array.prototype.slice.call(arguments, 1);
    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this$1, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var this$1 = this;

  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    while (listeners.length)
      this$1.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.prototype.listenerCount = function(type) {
  if (this._events) {
    var evlistener = this._events[type];

    if (isFunction(evlistener))
      return 1;
    else if (evlistener)
      return evlistener.length;
  }
  return 0;
};

EventEmitter.listenerCount = function(emitter, type) {
  return emitter.listenerCount(type);
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],3:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var arguments$1 = arguments;

    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments$1.length; i++) {
            args[i - 1] = arguments$1[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],4:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],5:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],6:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":4,"./encode":5}],7:[function(require,module,exports){
/**
 * @module  gl-spectrum
 */

var extend = require('xtend/mutable');
var Component = require('gl-component');
var inherits = require('inherits');
var lg = require('mumath/lg');
var isBrowser = require('is-browser');
var createGrid = require('plot-grid');

module.exports = Spectrum;



/**
 * @contructor
 */
function Spectrum (options) {
	var this$1 = this;

	if (!(this instanceof Spectrum)) return new Spectrum(options);

	var that = this;

	Component.call(this, options);

	if (isBrowser) {
		this.container.classList.add('gl-spectrum');
	}

	if (!this.is2d) {
		var gl = this.context;

		var float = gl.getExtension('OES_texture_float');
		if (!float) throw Error('WebGL does not support floats.');
		var floatLinear = gl.getExtension('OES_texture_float_linear');
		if (!floatLinear) throw Error('WebGL does not support floats.');

		//setup frequencies texture
		this.frequenciesTexture = createTexture(gl);
		this.bindFrequencies(this.frequenciesTextureUnit);
		this.setFrequencies(this.frequencies);

		//setup kernel
		var kernelLocation = gl.getUniformLocation(this.program, 'kernel[0]');
		var kernelWeightLocation = gl.getUniformLocation(this.program, 'kernelWeight');
		gl.uniform1fv(kernelLocation, this.kernel);
		gl.uniform1f(kernelWeightLocation, this.kernel.reduce(function (prev, curr) { return prev + curr; }, 0));

		//setup params
		var logarithmicLocation = gl.getUniformLocation(this.program, 'logarithmic');
		gl.uniform1i(logarithmicLocation, this.logarithmic ? 1 : 0);
		var minFrequencyLocation = gl.getUniformLocation(this.program, 'minFrequency');
		gl.uniform1f(minFrequencyLocation, this.minFrequency);
		var maxFrequencyLocation = gl.getUniformLocation(this.program, 'maxFrequency');
		gl.uniform1f(maxFrequencyLocation, this.maxFrequency);
		var minDecibelsLocation = gl.getUniformLocation(this.program, 'minDecibels');
		gl.uniform1f(minDecibelsLocation, this.minDecibels);
		var maxDecibelsLocation = gl.getUniformLocation(this.program, 'maxDecibels');
		gl.uniform1f(maxDecibelsLocation, this.maxDecibels);
		var sampleRateLocation = gl.getUniformLocation(this.program, 'sampleRate');
		gl.uniform1f(sampleRateLocation, this.sampleRate);
	}
	else {

	}

	//setup grid
	this.grid = createGrid({
		container: this.container,
		viewport: this.viewport,
		lines: [{
			min: this.minFrequency,
			max: this.maxFrequency,
			orientation: 'x',
			logarithmic: this.logarithmic,
			titles: function (value) {
				return (value >= 1000 ? ((value / 1000).toFixed(0) + 'k') : value)+'Hz';
			}
		}, {
			min: this.minDecibels,
			max: this.maxDecibels,
			orientation: 'y'
		}, this.logarithmic ? {
			min: this.minFrequency,
			max: this.maxFrequency,
			orientation: 'x',
			logarithmic: this.logarithmic,
			values: function (value) {
				var str = value.toString();
				if (str[0] !== '1') return null;
				return value;
			},
			style: {
				borderLeftStyle: 'solid'
			}
		} : null],
		axes: this.gridAxes && [{
			name: 'Frequency',
			labels: function (value, i, opt) {
				var str = value.toString();
				if (str[0] !== '2' && str[0] !== '1' && str[0] !== '5') return null;
				return opt.titles[i];
			}
		}, {
			name: 'Magnitude'
		}]
	});

	this.on('resize', function (vp) { return this$1.grid.update({
		viewport: vp
	}); });
}

inherits(Spectrum, Component);


/**
 * Here we might have to do kernel averaging for some
 */
Spectrum.prototype.frag = "\n\tprecision mediump float;\n\n\tuniform sampler2D frequencies;\n\tuniform vec4 viewport;\n\tuniform float kernel[5];\n\tuniform float kernelWeight;\n\tuniform int logarithmic;\n\tuniform float maxFrequency;\n\tuniform float minFrequency;\n\tuniform float maxDecibels;\n\tuniform float minDecibels;\n\tuniform float sampleRate;\n\n\tfloat frequency;\n\tfloat magnitude;\n\n\tconst float log10 = log(10.);\n\n\tfloat lg (float a) {\n\t\treturn log(a) / log10;\n\t}\n\n\t//TODO: make log light\n\n\tfloat logRatio (float ratio) {\n\t\tfloat frequency = pow(10., lg(minFrequency) + ratio * (lg(maxFrequency) - lg(minFrequency)) );\n\t\treturn (frequency - minFrequency) / (maxFrequency - minFrequency);\n\t}\n\n\tvoid main () {\n\t\tvec2 coord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);\n\t\tfloat oneStep = 1. / viewport.z;\n\n\t\tif (logarithmic == 1) {\n\t\t\tcoord.x = logRatio(coord.x);\n\t\t\toneStep = logRatio(oneStep);\n\t\t}\n\n\t\t//map the whole freq range to visible range\n\t\tfloat halfRate = sampleRate * 0.5;\n\t\tfloat left = minFrequency / halfRate;\n\t\tfloat right = maxFrequency / halfRate;\n\t\tcoord.x = left + coord.x * (right - left);\n\n\t\t//weighted value of intensity\n\t\tmagnitude =\n\t\t\ttexture2D(frequencies, coord + oneStep * vec2(-2, 0)).w * kernel[0] +\n\t\t\ttexture2D(frequencies, coord + oneStep * vec2(-1, 0)).w * kernel[1] +\n\t\t\ttexture2D(frequencies, coord + oneStep * vec2( 0, 0)).w * kernel[2] +\n\t\t\ttexture2D(frequencies, coord + oneStep * vec2( 1, 0)).w * kernel[3] +\n\t\t\ttexture2D(frequencies, coord + oneStep * vec2( 2, 0)).w * kernel[4];\n\t\tmagnitude /= kernelWeight;\n\n\t\tfloat dist = (magnitude - coord.y) / magnitude;\n\t\tfloat intensity;\n\t\t// if (dist < 0.) {\n\t\t\t// intensity = 2. * exp(-4. * dist) - 1. * exp(-8. * dist);\n\t\t// \tintensity = (1. - dist) / sqrt(dist);\n\t\t// }\n\t\t// else {\n\t\t\tintensity = max(intensity, (1. - log(dist)) / 10.);\n\t\t// }\n\n\t\tgl_FragColor = vec4(vec3(intensity), 1);\n\n\t\t// gl_FragColor = vec4(vec3(magnitude*20.), 1);\n\t\t// gl_FragColor = vec4(vec3(1. - smoothstep(0.0, 0.04, dist)), 1);\n\t\t// gl_FragColor = vec4(vec3(coord.x), 1);\n\t\t// gl_FragColor = vec4( vec3( coord.y / 4. > intensity ? 1 : 0) , 1);\n\t}\n";


//evenly distributed within indicated diapasone
Spectrum.prototype.frequencies = new Float32Array(1024);

//index of frequencies texture
Spectrum.prototype.frequenciesTextureUnit = 0;

Spectrum.prototype.maxDecibels = 0;
Spectrum.prototype.minDecibels = -100;

Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 20;

Spectrum.prototype.smoothing = 0.2;

Spectrum.prototype.grid = true;

Spectrum.prototype.logarithmic = true;

Spectrum.prototype.orientation = 'horizontal';

//required to detect frequency resolution
Spectrum.prototype.sampleRate = 44100;


//TODO: line (with tail), bars,
Spectrum.prototype.style = 'classic';

//5-items linear kernel for smoothing frequencies
Spectrum.prototype.kernel = [1, 2, 10, 2, 1];


/**
 * Set frequencies data
 */
Spectrum.prototype.setFrequencies = function (frequencies) {
	var gl = this.context;

	var frequencies = frequencies || this.frequencies;

	gl.activeTexture(gl.TEXTURE0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, frequencies.length, 1, 0, gl.ALPHA, gl.FLOAT, frequencies);

	return this;
};

/**
 * Bind frequencies texture to a spot
 */
Spectrum.prototype.bindFrequencies = function (unit) {
	var gl = this.context;

	this.frequenciesTextureUnit = unit == null ? this.frequenciesTextureUnit : unit;

	var frequenciesLocation = gl.getUniformLocation(this.program, 'frequencies');
	gl.useProgram(this.program);
	gl.uniform1i(frequenciesLocation, this.frequenciesTextureUnit);

	gl.activeTexture(gl.TEXTURE0 + this.frequenciesTextureUnit);
	gl.bindTexture(gl.TEXTURE_2D, this.frequenciesTexture);

	return this;
};


/**
 * Render main loop
 */
Spectrum.prototype.render = function () {
	var gl = this.gl;

	if (!this.is2d) {
		Component.prototype.render.call(this);
	}

	else {

	}

	return this;
};




//create texture
function createTexture (gl) {
	var texture = gl.createTexture();

	gl.activeTexture(gl.TEXTURE0);

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

	return texture;
}

},{"gl-component":20,"inherits":23,"is-browser":25,"mumath/lg":29,"plot-grid":35,"xtend/mutable":51}],8:[function(require,module,exports){
(function (process){
'use strict';
var ESC = '\u001b[';
var x = module.exports;

x.cursorTo = function (x, y) {
	if (arguments.length === 0) {
		return ESC + 'H';
	}

	if (arguments.length === 1) {
		return ESC + (x + 1) + 'G';
	}

	return ESC + (y + 1) + ';' + (x + 1) + 'H';
};

x.cursorMove = function (x, y) {
	var ret = '';

	if (x < 0) {
		ret += ESC + (-x) + 'D';
	} else if (x > 0) {
		ret += ESC + x + 'C';
	}

	if (y < 0) {
		ret += ESC + (-y) + 'A';
	} else if (y > 0) {
		ret += ESC + y + 'B';
	}

	return ret;
};

x.cursorUp = function (count) {
	return ESC + (typeof count === 'number' ? count : 1) + 'A';
};

x.cursorDown = function (count) {
	return ESC + (typeof count === 'number' ? count : 1) + 'B';
};

x.cursorForward = function (count) {
	return ESC + (typeof count === 'number' ? count : 1) + 'C';
};

x.cursorBackward = function (count) {
	return ESC + (typeof count === 'number' ? count : 1) + 'D';
};

x.cursorLeft = ESC + '1000D';
x.cursorSavePosition = ESC + 's';
x.cursorRestorePosition = ESC + 'u';
x.cursorGetPosition = ESC + '6n';
x.cursorNextLine = ESC + 'E';
x.cursorPrevLine = ESC + 'F';
x.cursorHide = ESC + '?25l';
x.cursorShow = ESC + '?25h';

x.eraseLines = function (count) {
	var clear = '';

	for (var i = 0; i < count; i++) {
		clear += x.cursorLeft + x.eraseEndLine + (i < count - 1 ? x.cursorUp() : '');
	}

	return clear;
};

x.eraseEndLine = ESC + 'K';
x.eraseStartLine = ESC + '1K';
x.eraseLine = ESC + '2K';
x.eraseDown = ESC + 'J';
x.eraseUp = ESC + '1J';
x.eraseScreen = ESC + '2J';
x.scrollUp = ESC + 'S';
x.scrollDown = ESC + 'T';

x.clearScreen = '\u001bc';
x.beep = '\u0007';

x.image = function (buf, opts) {
	opts = opts || {};

	var ret = '\u001b]1337;File=inline=1';

	if (opts.width) {
		ret += ';width=' + opts.width;
	}

	if (opts.height) {
		ret += ';height=' + opts.height;
	}

	if (opts.preserveAspectRatio === false) {
		ret += ';preserveAspectRatio=0';
	}

	return ret + ':' + buf.toString('base64') + '\u0007';
};

x.iTerm = {};

x.iTerm.setCwd = function (cwd) {
	return '\u001b]50;CurrentDir=' + (cwd || process.cwd()) + '\u0007';
};

}).call(this,require('_process'))
},{"_process":3}],9:[function(require,module,exports){
'use strict';
module.exports = function () {
	return /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
};

},{}],10:[function(require,module,exports){
'use strict';

function assembleStyles () {
	var styles = {
		modifiers: {
			reset: [0, 0],
			bold: [1, 22], // 21 isn't widely supported and 22 does the same thing
			dim: [2, 22],
			italic: [3, 23],
			underline: [4, 24],
			inverse: [7, 27],
			hidden: [8, 28],
			strikethrough: [9, 29]
		},
		colors: {
			black: [30, 39],
			red: [31, 39],
			green: [32, 39],
			yellow: [33, 39],
			blue: [34, 39],
			magenta: [35, 39],
			cyan: [36, 39],
			white: [37, 39],
			gray: [90, 39]
		},
		bgColors: {
			bgBlack: [40, 49],
			bgRed: [41, 49],
			bgGreen: [42, 49],
			bgYellow: [43, 49],
			bgBlue: [44, 49],
			bgMagenta: [45, 49],
			bgCyan: [46, 49],
			bgWhite: [47, 49]
		}
	};

	// fix humans
	styles.colors.grey = styles.colors.gray;

	Object.keys(styles).forEach(function (groupName) {
		var group = styles[groupName];

		Object.keys(group).forEach(function (styleName) {
			var style = group[styleName];

			styles[styleName] = group[styleName] = {
				open: '\u001b[' + style[0] + 'm',
				close: '\u001b[' + style[1] + 'm'
			};
		});

		Object.defineProperty(styles, groupName, {
			value: group,
			enumerable: false
		});
	});

	return styles;
}

Object.defineProperty(module, 'exports', {
	enumerable: true,
	get: assembleStyles
});

},{}],11:[function(require,module,exports){
var size = require('element-size')

module.exports = fit

var scratch = new Float32Array(2)

function fit(canvas, parent, scale) {
  var isSVG = canvas.nodeName.toUpperCase() === 'SVG'

  canvas.style.position = canvas.style.position || 'absolute'
  canvas.style.top = 0
  canvas.style.left = 0

  resize.scale  = parseFloat(scale || 1)
  resize.parent = parent

  return resize()

  function resize() {
    var p = resize.parent || canvas.parentNode
    if (typeof p === 'function') {
      var dims   = p(scratch) || scratch
      var width  = dims[0]
      var height = dims[1]
    } else
    if (p && p !== document.body) {
      var psize  = size(p)
      var width  = psize[0]|0
      var height = psize[1]|0
    } else {
      var width  = window.innerWidth
      var height = window.innerHeight
    }

    if (isSVG) {
      canvas.setAttribute('width', width * resize.scale + 'px')
      canvas.setAttribute('height', height * resize.scale + 'px')
    } else {
      canvas.width = width * resize.scale
      canvas.height = height * resize.scale
    }

    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    return resize
  }
}

},{"element-size":15}],12:[function(require,module,exports){
(function (process){
'use strict';
var escapeStringRegexp = require('escape-string-regexp');
var ansiStyles = require('ansi-styles');
var stripAnsi = require('strip-ansi');
var hasAnsi = require('has-ansi');
var supportsColor = require('supports-color');
var defineProps = Object.defineProperties;
var isSimpleWindowsTerm = process.platform === 'win32' && !/^xterm/i.test(process.env.TERM);

function Chalk(options) {
	// detect mode if not set manually
	this.enabled = !options || options.enabled === undefined ? supportsColor : options.enabled;
}

// use bright blue on Windows as the normal blue color is illegible
if (isSimpleWindowsTerm) {
	ansiStyles.blue.open = '\u001b[94m';
}

var styles = (function () {
	var ret = {};

	Object.keys(ansiStyles).forEach(function (key) {
		ansiStyles[key].closeRe = new RegExp(escapeStringRegexp(ansiStyles[key].close), 'g');

		ret[key] = {
			get: function () {
				return build.call(this, this._styles.concat(key));
			}
		};
	});

	return ret;
})();

var proto = defineProps(function chalk() {}, styles);

function build(_styles) {
	var builder = function () {
		return applyStyle.apply(builder, arguments);
	};

	builder._styles = _styles;
	builder.enabled = this.enabled;
	// __proto__ is used because we must return a function, but there is
	// no way to create a function with a different prototype.
	/* eslint-disable no-proto */
	builder.__proto__ = proto;

	return builder;
}

function applyStyle() {
	// support varags, but simply cast to string in case there's only one arg
	var args = arguments;
	var argsLen = args.length;
	var str = argsLen !== 0 && String(arguments[0]);

	if (argsLen > 1) {
		// don't slice `arguments`, it prevents v8 optimizations
		for (var a = 1; a < argsLen; a++) {
			str += ' ' + args[a];
		}
	}

	if (!this.enabled || !str) {
		return str;
	}

	var nestedStyles = this._styles;
	var i = nestedStyles.length;

	// Turns out that on Windows dimmed gray text becomes invisible in cmd.exe,
	// see https://github.com/chalk/chalk/issues/58
	// If we're on Windows and we're dealing with a gray color, temporarily make 'dim' a noop.
	var originalDim = ansiStyles.dim.open;
	if (isSimpleWindowsTerm && (nestedStyles.indexOf('gray') !== -1 || nestedStyles.indexOf('grey') !== -1)) {
		ansiStyles.dim.open = '';
	}

	while (i--) {
		var code = ansiStyles[nestedStyles[i]];

		// Replace any instances already present with a re-opening code
		// otherwise only the part of the string until said closing code
		// will be colored, and the rest will simply be 'plain'.
		str = code.open + str.replace(code.closeRe, code.open) + code.close;
	}

	// Reset the original 'dim' if we changed it to work around the Windows dimmed gray issue.
	ansiStyles.dim.open = originalDim;

	return str;
}

function init() {
	var ret = {};

	Object.keys(styles).forEach(function (name) {
		ret[name] = {
			get: function () {
				return build.call(this, [name]);
			}
		};
	});

	return ret;
}

defineProps(Chalk.prototype, init());

module.exports = new Chalk();
module.exports.styles = ansiStyles;
module.exports.hasColor = hasAnsi;
module.exports.stripColor = stripAnsi;
module.exports.supportsColor = supportsColor;

}).call(this,require('_process'))
},{"_process":3,"ansi-styles":10,"escape-string-regexp":16,"has-ansi":22,"strip-ansi":43,"supports-color":44}],13:[function(require,module,exports){
(function (process){
'use strict';
var restoreCursor = require('restore-cursor');
var hidden = false;

exports.show = function () {
	hidden = false;
	process.stdout.write('\u001b[?25h');
};

exports.hide = function () {
	restoreCursor();
	hidden = true;
	process.stdout.write('\u001b[?25l');
};

exports.toggle = function (force) {
	if (force !== undefined) {
		hidden = force;
	}

	if (hidden) {
		exports.show();
	} else {
		exports.hide();
	}
};

}).call(this,require('_process'))
},{"_process":3,"restore-cursor":38}],14:[function(require,module,exports){
(function (process){
'use strict';

var frames = process.platform === 'win32' ?
	['-', '\\', '|', '/'] :
	['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

module.exports = function () {
	var i = 0;

	return function () {
		return frames[i = ++i % frames.length];
	};
};

module.exports.frames = frames;

}).call(this,require('_process'))
},{"_process":3}],15:[function(require,module,exports){
module.exports = getSize

function getSize(element) {
  // Handle cases where the element is not already
  // attached to the DOM by briefly appending it
  // to document.body, and removing it again later.
  if (element === window || element === document.body) {
    return [window.innerWidth, window.innerHeight]
  }

  if (!element.parentNode) {
    var temporary = true
    document.body.appendChild(element)
  }

  var bounds = element.getBoundingClientRect()
  var styles = getComputedStyle(element)
  var height = (bounds.height|0)
    + parse(styles.getPropertyValue('margin-top'))
    + parse(styles.getPropertyValue('margin-bottom'))
  var width  = (bounds.width|0)
    + parse(styles.getPropertyValue('margin-left'))
    + parse(styles.getPropertyValue('margin-right'))

  if (temporary) {
    document.body.removeChild(element)
  }

  return [width, height]
}

function parse(prop) {
  return parseFloat(prop) || 0
}

},{}],16:[function(require,module,exports){
'use strict';

var matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;

module.exports = function (str) {
	if (typeof str !== 'string') {
		throw new TypeError('Expected a string');
	}

	return str.replace(matchOperatorsRe, '\\$&');
};

},{}],17:[function(require,module,exports){
(function (process){
'use strict';

var cbs = [];
var called = false;

function exit(exit, signal) {
	if (called) {
		return;
	}

	called = true;

	cbs.forEach(function (el) {
		el();
	});

	if (exit === true) {
		process.exit(128 + signal);
	}
};

module.exports = function (cb) {
	cbs.push(cb);

	if (cbs.length === 1) {
		process.once('exit', exit);
		process.once('SIGINT', exit.bind(null, true, 2));
		process.once('SIGTERM', exit.bind(null, true, 15));
	}
};

}).call(this,require('_process'))
},{"_process":3}],18:[function(require,module,exports){
/**
 * Real values fourier transform.
 *
 * @module  fourier-transform
 *
 */

module.exports = function rfft (input, spectrum) {
	if (!input) throw Error("Input waveform is not provided, pass input array.");

	var N = input.length;

	var k = Math.floor(Math.log(N) / Math.LN2);

	if (Math.pow(2, k) !== N) throw Error("Invalid array size, must be a power of 2.");

	if (!spectrum) spectrum = new Array(N/2);

	//.forward call
	var n         = N,
		x         = new Array(N),
		TWO_PI    = 2*Math.PI,
		sqrt      = Math.sqrt,
		i         = n >>> 1,
		bSi       = 2 / n,
		n2, n4, n8, nn,
		t1, t2, t3, t4,
		i1, i2, i3, i4, i5, i6, i7, i8,
		st1, cc1, ss1, cc3, ss3,
		e,
		a,
		rval, ival, mag;

	reverseBinPermute(N, x, input);

	for (var ix = 0, id = 4; ix < n; id *= 4) {
		for (var i0 = ix; i0 < n; i0 += id) {
			//sumdiff(x[i0], x[i0+1]); // {a, b}  <--| {a+b, a-b}
			st1 = x[i0] - x[i0+1];
			x[i0] += x[i0+1];
			x[i0+1] = st1;
		}
		ix = 2*(id-1);
	}

	n2 = 2;
	nn = n >>> 1;

	while((nn = nn >>> 1)) {
		ix = 0;
		n2 = n2 << 1;
		id = n2 << 1;
		n4 = n2 >>> 2;
		n8 = n2 >>> 3;
		do {
			if(n4 !== 1) {
				for(i0 = ix; i0 < n; i0 += id) {
					i1 = i0;
					i2 = i1 + n4;
					i3 = i2 + n4;
					i4 = i3 + n4;

					//diffsum3_r(x[i3], x[i4], t1); // {a, b, s} <--| {a, b-a, a+b}
					t1 = x[i3] + x[i4];
					x[i4] -= x[i3];
					//sumdiff3(x[i1], t1, x[i3]);   // {a, b, d} <--| {a+b, b, a-b}
					x[i3] = x[i1] - t1;
					x[i1] += t1;

					i1 += n8;
					i2 += n8;
					i3 += n8;
					i4 += n8;

					//sumdiff(x[i3], x[i4], t1, t2); // {s, d}  <--| {a+b, a-b}
					t1 = x[i3] + x[i4];
					t2 = x[i3] - x[i4];

					t1 = -t1 * Math.SQRT1_2;
					t2 *= Math.SQRT1_2;

					// sumdiff(t1, x[i2], x[i4], x[i3]); // {s, d}  <--| {a+b, a-b}
					st1 = x[i2];
					x[i4] = t1 + st1;
					x[i3] = t1 - st1;

					//sumdiff3(x[i1], t2, x[i2]); // {a, b, d} <--| {a+b, b, a-b}
					x[i2] = x[i1] - t2;
					x[i1] += t2;
				}
			} else {
				for(i0 = ix; i0 < n; i0 += id) {
					i1 = i0;
					i2 = i1 + n4;
					i3 = i2 + n4;
					i4 = i3 + n4;

					//diffsum3_r(x[i3], x[i4], t1); // {a, b, s} <--| {a, b-a, a+b}
					t1 = x[i3] + x[i4];
					x[i4] -= x[i3];

					//sumdiff3(x[i1], t1, x[i3]);   // {a, b, d} <--| {a+b, b, a-b}
					x[i3] = x[i1] - t1;
					x[i1] += t1;
				}
			}

			ix = (id << 1) - n2;
			id = id << 2;
		} while (ix < n);

		e = TWO_PI / n2;

		for (var j = 1; j < n8; j++) {
			a = j * e;
			ss1 = Math.sin(a);
			cc1 = Math.cos(a);

			//ss3 = sin(3*a); cc3 = cos(3*a);
			cc3 = 4*cc1*(cc1*cc1-0.75);
			ss3 = 4*ss1*(0.75-ss1*ss1);

			ix = 0; id = n2 << 1;
			do {
				for (i0 = ix; i0 < n; i0 += id) {
					i1 = i0 + j;
					i2 = i1 + n4;
					i3 = i2 + n4;
					i4 = i3 + n4;

					i5 = i0 + n4 - j;
					i6 = i5 + n4;
					i7 = i6 + n4;
					i8 = i7 + n4;

					//cmult(c, s, x, y, &u, &v)
					//cmult(cc1, ss1, x[i7], x[i3], t2, t1); // {u,v} <--| {x*c-y*s, x*s+y*c}
					t2 = x[i7]*cc1 - x[i3]*ss1;
					t1 = x[i7]*ss1 + x[i3]*cc1;

					//cmult(cc3, ss3, x[i8], x[i4], t4, t3);
					t4 = x[i8]*cc3 - x[i4]*ss3;
					t3 = x[i8]*ss3 + x[i4]*cc3;

					//sumdiff(t2, t4);   // {a, b} <--| {a+b, a-b}
					st1 = t2 - t4;
					t2 += t4;
					t4 = st1;

					//sumdiff(t2, x[i6], x[i8], x[i3]); // {s, d}  <--| {a+b, a-b}
					//st1 = x[i6]; x[i8] = t2 + st1; x[i3] = t2 - st1;
					x[i8] = t2 + x[i6];
					x[i3] = t2 - x[i6];

					//sumdiff_r(t1, t3); // {a, b} <--| {a+b, b-a}
					st1 = t3 - t1;
					t1 += t3;
					t3 = st1;

					//sumdiff(t3, x[i2], x[i4], x[i7]); // {s, d}  <--| {a+b, a-b}
					//st1 = x[i2]; x[i4] = t3 + st1; x[i7] = t3 - st1;
					x[i4] = t3 + x[i2];
					x[i7] = t3 - x[i2];

					//sumdiff3(x[i1], t1, x[i6]);   // {a, b, d} <--| {a+b, b, a-b}
					x[i6] = x[i1] - t1;
					x[i1] += t1;

					//diffsum3_r(t4, x[i5], x[i2]); // {a, b, s} <--| {a, b-a, a+b}
					x[i2] = t4 + x[i5];
					x[i5] -= t4;
				}

				ix = (id << 1) - n2;
				id = id << 2;

			} while (ix < n);
		}
	}

	while (--i) {
		rval = x[i];
		ival = x[n-i-1];
		mag = bSi * sqrt(rval * rval + ival * ival);
		spectrum[i] = mag;
	}

	spectrum[0] = Math.abs(bSi * x[0]);

	return spectrum;
}


function reverseBinPermute (N, dest, source) {
	var halfSize    = N >>> 1,
		nm1         = N - 1,
		i = 1, r = 0, h;

	dest[0] = source[0];

	do {
		r += halfSize;
		dest[i] = source[r];
		dest[r] = source[i];

		i++;

		h = halfSize << 1;

		while (h = h >> 1, !((r ^= h) & h));

		if (r >= i) {
			dest[i]     = source[r];
			dest[r]     = source[i];

			dest[nm1-i] = source[nm1-r];
			dest[nm1-r] = source[nm1-i];
		}
		i++;
	} while (i < halfSize);

	dest[nm1] = source[nm1];
};
},{}],19:[function(require,module,exports){
module.exports = getCanvasContext
function getCanvasContext (type, opts) {
  if (typeof type !== 'string') {
    throw new TypeError('must specify type string')
  }
  if (typeof document === 'undefined') {
    return null // check for Node
  }

  opts = opts || {}
  var canvas = opts.canvas || document.createElement('canvas')
  if (typeof opts.width === 'number') {
    canvas.width = opts.width
  }
  if (typeof opts.height === 'number') {
    canvas.height = opts.height
  }

  var attribs = opts
  var gl
  try {
    var names = [ type ]
    // prefix GL contexts
    if (type.indexOf('webgl') === 0) {
      names.push('experimental-' + type)
    }

    for (var i = 0; i < names.length; i++) {
      gl = canvas.getContext(names[i], attribs)
      if (gl) return gl
    }
  } catch (e) {
    gl = null
  }
  return (gl || null) // ensure null on fail
}

},{}],20:[function(require,module,exports){
/**
 * @module  gl-spectrum
 */

var extend = require('xtend/mutable');
var getContext = require('get-canvas-context');
var fit = require('canvas-fit');
var loop = require('raf-loop');
var isBrowser = require('is-browser');
var Emitter = require('events').EventEmitter;
var inherits = require('inherits');

module.exports = Component;


/**
 * @contructor
 */
function Component (options) {
	var this$1 = this;

	if (!(this instanceof Component)) return new Component(options);

	if (options instanceof Function) {
		options = {
			render: options
		}
	}

	extend(this, options);

	if (!this.container) {
		this.container = isBrowser ? document.body : {};
	}

	//if no canvas defined - create new fullscreen canvas
	if (!this.canvas) {
		if (isBrowser) {
			this.canvas = document.createElement('canvas');
			this.container.appendChild(this.canvas);
		} else {
			this.canvas = {};
		}
	}

	//obtain context
	if (typeof this.context === 'string') {
		this.context = getContext(this.context, {
			canvas: this.canvas,
			premultipliedAlpha: this.premultipliedAlpha !== false,
			antialias: this.antialias !== false
		});
	}

	this.is2d = !this.context.drawingBufferHeight;

	//setup webgl context
	if (!this.is2d) {
		var gl = this.gl = this.context;

		//TODO: find a place for user to init textures extensions
		// var float = gl.getExtension('OES_texture_float');
		// if (!float) throw Error('WebGL does not support floats.');
		// var floatLinear = gl.getExtension('OES_texture_float_linear');
		// if (!floatLinear) throw Error('WebGL does not support floats.');

		this.program = createProgram(gl, this.vert, this.frag);

		//FIXME: ensure that buffer spot does not interfere with other occupied spots
		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,4,4,-1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.bindAttribLocation(this.program, 0, 'position');

		gl.linkProgram(this.program);
	}

	//set canvas fit container size
	if (isBrowser) {
		this.fit = fit(this.canvas, this.container);
		this.resize = this.resize.bind(this);

		this.resize();
		window.addEventListener('resize', this.resize, false);
	}

	//create raf loop
	this.engine = loop(function (dt) {
		this$1.emit('render');

		this$1.render();
	}).start();
}


inherits(Component, Emitter);


/**
 * Create and use webgl or 2d context
 */
Component.prototype.context = 'webgl';


Component.prototype.vert = "\n\tattribute vec2 position;\n\tvoid main () {\n\t\tgl_Position = vec4(position, 0, 1);\n\t}\n";


Component.prototype.frag = "\n\tprecision mediump float;\n\tuniform vec4 viewport;\n\tvoid main () {\n\t\tgl_FragColor = vec4(gl_FragCoord.xy / viewport.zw, 1, 1);\n\t}\n";

/**
 * Do resize routine
 */
Component.prototype.resize = function () {
	var gl = this.context;

	this.fit();

	var w = this.canvas.width, h = this.canvas.height;

	//if vp is undefined - set it as full-height
	var viewport;
	if (!this.viewport) {
		viewport = [0, 0, w, h];
	}
	else if (this.viewport instanceof Function) {
		viewport = this.viewport(w, h);
	}
	else {
		viewport = this.viewport;
	}

	if (!this.is2d) {
		gl.useProgram(this.program);

		var viewportLocation = gl.getUniformLocation(this.program, 'viewport');

		//this trickery inverts viewport Y
		var top = h-(viewport[3]+viewport[1]);
		var vp = [viewport[0], top, viewport[2], viewport[3] + Math.min(top, 0)];

		gl.viewport(vp[0], vp[1], vp[2], vp[3]);
		gl.uniform4fv(viewportLocation, vp);
	}

	this.emit('resize', viewport);

	return this;
};


/**
 * Render main loop
 */
Component.prototype.render = function () {
	var gl = this.context;

	if (!this.is2d) {
		gl.useProgram(this.program);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	return this;
};


//create texture
function createTexture (gl) {
	var texture = gl.createTexture();

	gl.activeTexture(gl.TEXTURE0);

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

	return texture;
}

//create program (2 shaders)
function createProgram (gl, vSrc, fSrc) {
	var fShader = gl.createShader(gl.FRAGMENT_SHADER);
	var vShader = gl.createShader(gl.VERTEX_SHADER);

	gl.shaderSource(fShader, fSrc);
	gl.shaderSource(vShader, vSrc);

	gl.compileShader(fShader);

	if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) {
		console.error(gl.getShaderInfoLog(fShader));
	}

	gl.compileShader(vShader);

	if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) {
		console.error(gl.getShaderInfoLog(vShader));
	}


	var program = gl.createProgram();
	gl.attachShader(program, vShader);
	gl.attachShader(program, fShader);
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error(gl.getProgramInfoLog(program));
	}

	gl.useProgram(program);

	return program;
}

},{"canvas-fit":11,"events":2,"get-canvas-context":19,"inherits":23,"is-browser":25,"raf-loop":36,"xtend/mutable":51}],21:[function(require,module,exports){
module.exports = asString
module.exports.add = append

function asString(fonts) {
  var href = getHref(fonts)
  return '<link href="' + href + '" rel="stylesheet" type="text/css">'
}

function asElement(fonts) {
  var href = getHref(fonts)
  var link = document.createElement('link')
  link.setAttribute('href', href)
  link.setAttribute('rel', 'stylesheet')
  link.setAttribute('type', 'text/css')
  return link
}

function getHref(fonts) {
  var family = Object.keys(fonts).map(function(name) {
    var details = fonts[name]
    name = name.replace(/\s+/, '+')
    return typeof details === 'boolean'
      ? name
      : name + ':' + makeArray(details).join(',')
  }).join('|')

  return 'http://fonts.googleapis.com/css?family=' + family
}

function append(fonts) {
  var link = asElement(fonts)
  document.head.appendChild(link)
  return link
}

function makeArray(arr) {
  return Array.isArray(arr) ? arr : [arr]
}

},{}],22:[function(require,module,exports){
'use strict';
var ansiRegex = require('ansi-regex');
var re = new RegExp(ansiRegex().source); // remove the `g` flag
module.exports = re.test.bind(re);

},{"ansi-regex":9}],23:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],24:[function(require,module,exports){
var inserted = {};

module.exports = function (css, options) {
    if (inserted[css]) return;
    inserted[css] = true;
    
    var elem = document.createElement('style');
    elem.setAttribute('type', 'text/css');

    if ('textContent' in elem) {
      elem.textContent = css;
    } else {
      elem.styleSheet.cssText = css;
    }
    
    var head = document.getElementsByTagName('head')[0];
    if (options && options.prepend) {
        head.insertBefore(elem, head.childNodes[0]);
    } else {
        head.appendChild(elem);
    }
};

},{}],25:[function(require,module,exports){
module.exports = true;
},{}],26:[function(require,module,exports){
(function (process){
'use strict';
var ansiEscapes = require('ansi-escapes');
var cliCursor = require('cli-cursor');

function main(stream) {
	var prevLineCount = 0;

	var render = function () {
		cliCursor.hide();
		var out = [].join.call(arguments, ' ') + '\n';
		stream.write(ansiEscapes.eraseLines(prevLineCount) + out);
		prevLineCount = out.split('\n').length;
	};

	render.clear = function () {
		stream.write(ansiEscapes.eraseLines(prevLineCount));
		prevLineCount = 0;
	};

	render.done = function () {
		prevLineCount = 0;
		cliCursor.show();
	};

	return render;
}

module.exports = main(process.stdout);
module.exports.stderr = main(process.stderr);
module.exports.create = main;

}).call(this,require('_process'))
},{"_process":3,"ansi-escapes":8,"cli-cursor":13}],27:[function(require,module,exports){

/**
 * Expose `render()`.`
 */

exports = module.exports = render;

/**
 * Expose `compile()`.
 */

exports.compile = compile;

/**
 * Render the given mustache `str` with `obj`.
 *
 * @param {String} str
 * @param {Object} obj
 * @return {String}
 * @api public
 */

function render(str, obj) {
  obj = obj || {};
  var fn = compile(str);
  return fn(obj);
}

/**
 * Compile the given `str` to a `Function`.
 *
 * @param {String} str
 * @return {Function}
 * @api public
 */

function compile(str) {
  var js = [];
  var toks = parse(str);
  var tok;

  for (var i = 0; i < toks.length; ++i) {
    tok = toks[i];
    if (i % 2 == 0) {
      js.push('"' + tok.replace(/"/g, '\\"') + '"');
    } else {
      switch (tok[0]) {
        case '/':
          tok = tok.slice(1);
          js.push(') + ');
          break;
        case '^':
          tok = tok.slice(1);
          assertProperty(tok);
          js.push(' + section(obj, "' + tok + '", true, ');
          break;
        case '#':
          tok = tok.slice(1);
          assertProperty(tok);
          js.push(' + section(obj, "' + tok + '", false, ');
          break;
        case '!':
          tok = tok.slice(1);
          assertProperty(tok);
          js.push(' + obj.' + tok + ' + ');
          break;
        default:
          assertProperty(tok);
          js.push(' + escape(obj.' + tok + ') + ');
      }
    }
  }

  js = '\n'
    + indent(escape.toString()) + ';\n\n'
    + indent(section.toString()) + ';\n\n'
    + '  return ' + js.join('').replace(/\n/g, '\\n');

  return new Function('obj', js);
}

/**
 * Assert that `prop` is a valid property.
 *
 * @param {String} prop
 * @api private
 */

function assertProperty(prop) {
  if (!prop.match(/^[\w.]+$/)) throw new Error('invalid property "' + prop + '"');
}

/**
 * Parse `str`.
 *
 * @param {String} str
 * @return {Array}
 * @api private
 */

function parse(str) {
  return str.split(/\{\{|\}\}/);
}

/**
 * Indent `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function indent(str) {
  return str.replace(/^/gm, '  ');
}

/**
 * Section handler.
 *
 * @param {Object} context obj
 * @param {String} prop
 * @param {String} str
 * @param {Boolean} negate
 * @api private
 */

function section(obj, prop, negate, str) {
  var val = obj[prop];
  if ('function' == typeof val) return val.call(obj, str);
  if (negate) val = !val;
  if (val) return str;
  return '';
}

/**
 * Escape the given `html`.
 *
 * @param {String} html
 * @return {String}
 * @api private
 */

function escape(html) {
  return String(html)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

},{}],28:[function(require,module,exports){
/**
 * @module  mumath/closest
 */

module.exports = function closest (num, arr) {
	var curr = arr[0];
	var diff = Math.abs (num - curr);
	for (var val = 0; val < arr.length; val++) {
		var newdiff = Math.abs (num - arr[val]);
		if (newdiff < diff) {
			diff = newdiff;
			curr = arr[val];
		}
	}
	return curr;
}
},{}],29:[function(require,module,exports){
/**
 * Base 10 logarithm
 *
 * @module mumath/lg
 */
module.exports = require('./wrap')(function (a) {
	return Math.log(a) / Math.log(10);
});
},{"./wrap":32}],30:[function(require,module,exports){
/**
 * @module mumath/order
 */
module.exports = require('./wrap')(function (n) {
	n = Math.abs(n);
	var order = Math.floor(Math.log(n) / Math.LN10 + 0.000000001);
	return Math.pow(10,order);
});
},{"./wrap":32}],31:[function(require,module,exports){
/**
 * Whether element is between left & right including
 *
 * @param {number} a
 * @param {number} left
 * @param {number} right
 *
 * @return {Boolean}
 */
module.exports = require('./wrap')(function(a, left, right){
	if (left > right) {
		var tmp = left;
		left = right;
		right = tmp;
	}
	if (a <= right && a >= left) return true;
	return false;
});
},{"./wrap":32}],32:[function(require,module,exports){
/**
 * Get fn wrapped with array/object attrs recognition
 *
 * @return {Function} Target function
 */
module.exports = function(fn){
	return function (a) {
		var this$1 = this;

		var args = arguments;
		if (a instanceof Array) {
			var result = new Array(a.length), slice;
			for (var i = 0; i < a.length; i++){
				slice = [];
				for (var j = 0, l = args.length, val; j < l; j++){
					val = args[j] instanceof Array ? args[j][i] : args[j];
					val = val;
					slice.push(val);
				}
				result[i] = fn.apply(this$1, slice);
			}
			return result;
		}
		else if (typeof a === 'object') {
			var result = {}, slice;
			for (var i in a){
				slice = [];
				for (var j = 0, l = args.length, val; j < l; j++){
					val = typeof args[j] === 'object' ? args[j][i] : args[j];
					val = val;
					slice.push(val);
				}
				result[i] = fn.apply(this, slice);
			}
			return result;
		}
		else {
			return fn.apply(this, args);
		}
	};
};
},{}],33:[function(require,module,exports){
'use strict';
module.exports = function (fn, errMsg) {
	if (typeof fn !== 'function') {
		throw new TypeError('Expected a function');
	}

	var ret;
	var called = false;
	var fnName = fn.displayName || fn.name || (/function ([^\(]+)/.exec(fn.toString()) || [])[1];

	var onetime = function () {
		if (called) {
			if (errMsg === true) {
				fnName = fnName ? fnName + '()' : 'Function';
				throw new Error(fnName + ' can only be called once.');
			}

			return ret;
		}

		called = true;
		ret = fn.apply(this, arguments);
		fn = null;

		return ret;
	};

	onetime.displayName = fnName;

	return onetime;
};

},{}],34:[function(require,module,exports){
(function (process){
// Generated by CoffeeScript 1.7.1
(function() {
  var getNanoSeconds, hrtime, loadTime;

  if ((typeof performance !== "undefined" && performance !== null) && performance.now) {
    module.exports = function() {
      return performance.now();
    };
  } else if ((typeof process !== "undefined" && process !== null) && process.hrtime) {
    module.exports = function() {
      return (getNanoSeconds() - loadTime) / 1e6;
    };
    hrtime = process.hrtime;
    getNanoSeconds = function() {
      var hr;
      hr = hrtime();
      return hr[0] * 1e9 + hr[1];
    };
    loadTime = getNanoSeconds();
  } else if (Date.now) {
    module.exports = function() {
      return Date.now() - loadTime;
    };
    loadTime = Date.now();
  } else {
    module.exports = function() {
      return new Date().getTime() - loadTime;
    };
    loadTime = new Date().getTime();
  }

}).call(this);

}).call(this,require('_process'))
},{"_process":3}],35:[function(require,module,exports){
/**
 * @module  plot-grid
 */

var extend = require('xtend');
var isBrowser = require('is-browser');
var lg = require('mumath/lg');
var Emitter = require('events').EventEmitter;
var inherits = require('inherits');
var sf = 0;
var className = ((require('insert-css')("._016038c6 {\r\n\tposition: relative;\r\n}\r\n\r\n._016038c6 .grid {\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\tbottom: 0;\r\n\tright: 0;\r\n\tfont-family: sans-serif;\r\n}\r\n._016038c6 .grid-line {\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\twidth: 0;\r\n\theight: 0;\r\n\tcolor: rgba(127,127,127,.3);\r\n}\r\n._016038c6 .grid-line[hidden] {\r\n\tdisplay: none;\r\n}\r\n\r\n._016038c6 .grid-line-x {\r\n\tborder-left: 1px dotted;\r\n\tmargin-left: -1px;\r\n\theight: 100%;\r\n}\r\n\r\n._016038c6 .grid-line-y {\r\n\tmargin-top: -1px;\r\n\tborder-bottom: 1px dotted;\r\n\twidth: 100%;\r\n\ttop: auto;\r\n}\r\n\r\n._016038c6 .grid-axis {\r\n\tposition: absolute;\r\n}\r\n._016038c6 .grid-axis-x {\r\n\ttop: auto;\r\n\tbottom: 0;\r\n\tright: 0;\r\n\tleft: 0;\r\n\tborder-bottom: 2px solid;\r\n\tmargin-bottom: -.5rem;\r\n}\r\n._016038c6 .grid-axis-y {\r\n\tborder-left: 2px solid;\r\n\tright: auto;\r\n\ttop: 0;\r\n\tbottom: 0;\r\n\tleft: -1px;\r\n    margin-left: -.5rem;\r\n}\r\n\r\n._016038c6 .grid-label {\r\n\tposition: absolute;\r\n\ttop: auto;\r\n\tleft: auto;\r\n\tmin-height: 1rem;\r\n\tfont-size: .8rem;\r\n}\r\n._016038c6 .grid-label-x {\r\n\tbottom: auto;\r\n\ttop: 100%;\r\n\tmargin-top: 1.5rem;\r\n\twidth: 2rem;\r\n\tmargin-left: -1rem;\r\n\ttext-align: center;\r\n}\r\n._016038c6 .grid-label-x:before {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\theight: .5rem;\r\n\twidth: 0;\r\n\tborder-left: 2px solid;\r\n\ttop: -1rem;\r\n\tmargin-left: -1px;\r\n\tmargin-top: -2px;\r\n\tleft: 1rem;\r\n}\r\n\r\n._016038c6 .grid-label-y {\r\n    right: 100%;\r\n    margin-right: 1.5rem;\r\n    margin-top: -.5rem;\r\n}\r\n._016038c6 .grid-label-y:before {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\twidth: .5rem;\r\n\theight: 0;\r\n\tborder-top: 2px solid;\r\n\tright: -1rem;\r\n\ttop: .4rem;\r\n\tmargin-right: -1px;\r\n}\r\n") || true) && "_016038c6");
var closestNumber = require('mumath/closest');
var mag = require('mumath/order');
var within = require('mumath/within');


module.exports = Grid;


function Grid (options) {
	var this$1 = this;

	if (!(this instanceof Grid)) return new Grid(options);

	extend(this, options);

	if (!isBrowser) return;

	//obtian container
	this.container = options.container || document.body;
	this.container.classList.add(className);

	//display grid
	this.grid = document.createElement('div');
	this.grid.classList.add('grid');
	this.container.appendChild(this.grid);

	this.lines = (options.lines || []).map(function (lines) { return lines && extend(this$1.defaultLines, lines); });
	this.axes = (options.axes || []).map(function (axis) { return axis && extend(this$1.defaultAxis, axis); });

	this.update(options);
}


inherits(Grid, Emitter);


Grid.prototype.container = null;
Grid.prototype.viewport = null;

Grid.prototype.lines = null;
Grid.prototype.axes = null;

Grid.prototype.defaultLines = {
	orientation: 'x',
	logarithmic: false,
	min: 0,
	max: 100,
	//detected from range
	values: null,
	//copied from values
	titles: null
};

Grid.prototype.defaultAxis = {
	name: '',
	//detected from range
	values: null,
	//copied from values
	labels: null,
	//copied from labels
	titles: null
};

Grid.prototype.update = function (options) {
	options = options || {};

	var grid = this.grid;

	//set viewport
	if (options.viewport) this.viewport = options.viewport;
	var viewport = this.viewport;

	var w = this.container.offsetWidth;
	var h = this.container === document.body ? window.innerHeight : this.container.offsetHeight;

	if (viewport instanceof Function) {
		viewport = viewport(w, h);
	}

	if (!viewport) viewport = [0,0,w,h];

	this.grid.style.left = viewport[0] + (typeof viewport[0] === 'number' ? 'px' : '');
	this.grid.style.top = viewport[1] + (typeof viewport[1] === 'number' ? 'px' : '');
	this.grid.style.width = viewport[2] + (typeof viewport[2] === 'number' ? 'px' : '');
	this.grid.style.height = viewport[3] + (typeof viewport[3] === 'number' ? 'px' : '');

	//hide all lines first
	var lines = grid.querySelectorAll('.grid-line');
	for (var i = 0; i < lines.length; i++) {
		lines[i].setAttribute('hidden', true);
	}
	var labels = grid.querySelectorAll('.grid-label');
	for (var i = 0; i < labels.length; i++) {
		labels[i].setAttribute('hidden', true);
	}

	//set lines
	this.lines.forEach(function (lines, idx) {
		if (!lines) return;

		//temp object keeping state of current lines run
		var stats = {};

		if (options.lines) lines = extend(this.lines[idx], options.lines[idx]);
		stats.lines = lines;

		var linesMin = Math.min(lines.max, lines.min);
		var linesMax = Math.max(lines.min, lines.max);
		stats.min = linesMin;
		stats.max = linesMax;

		//detect steps, if not defined, as one per each 50px
		var values = [];
		var intersteps = (lines.orientation === 'x' ? (typeof viewport[2] === 'number' ? viewport[2] : this.grid.clientWidth) : (typeof viewport[3] === 'number' ? viewport[3] : this.grid.clientHeight)) / 50;
		if (intersteps < 1) {
			values = [linesMin, linesMax];
		}
		else if (!lines.logarithmic) {
			var stepSize = (linesMax - linesMin) / Math.floor(intersteps);
			var order = mag(stepSize);

			stepSize = closestNumber(stepSize, [1, 2, 2.5, 5, 10].map(function (v) { return v * order; }));

			var start = stepSize * Math.round(linesMin / stepSize);

			for (var step = start; step <= linesMax; step += stepSize) {
				if (step < linesMin) continue;
				values.push(step);
			}
		}
		else {
			//each logarithmic divisor
			if (linesMin < 0 && linesMax > 0) throw Error('Cannot create logarithmic grid spanning over zero');

			[1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(function (base) {
				var order = mag(linesMin);
				var start = base * order;
				for (var step = start; step <= linesMax; step *=10) {
					if (step < linesMin) continue;
					values.push(step);
				}
			});
		}

		values = lines.values instanceof Function ?
			values.map(function (v, i) { return lines.values(v, i, stats); }, this).filter(function (v) { return v != null; }) :
			lines.values || values;
		stats.values = values;

		//define titles
		var titles = lines.titles instanceof Function ? values.map(function (v, i) { return lines.titles(v, i, stats); }, this) :
			lines.titles || values.slice().map(function (value) {
			return value.toLocaleString();
		});
		stats.titles = titles;

		//draw lines
		var offsets = values.map(function (value, i) {
			var line = grid.querySelector(("#grid-line-" + (lines.orientation) + "-" + (value|0) + "-" + idx));
			var ratio;
			if (!line) {
				line = document.createElement('span');
				line.id = "grid-line-" + (lines.orientation) + "-" + (value|0) + "-" + idx;
				line.classList.add('grid-line');
				line.classList.add(("grid-line-" + (lines.orientation)));
				line.setAttribute('data-value', value);
				line.setAttribute('title', titles[i]);
				grid.appendChild(line);
				if (!lines.logarithmic) {
					ratio = (value - linesMin) / (linesMax - linesMin);
				}
				else {
					ratio = (lg(value) - lg(linesMin)) / (lg(linesMax) - lg(linesMin));
				}
				if (lines.min > lines.max) ratio = 1 - ratio;

				ratio *= 100;
				if (lines.orientation === 'x') {
					line.style.left = ratio + '%';
				}
				else {
					line.style.top = (100 - ratio) + '%';
				}

				if (lines.style) {
					for (var prop in lines.style) {
						var val = lines.style[prop];
						if (typeof val === 'number') val += 'px';
						line.style[prop] = val;
					}
				}
			}
			else {
				ratio = parseFloat(line.getAttribute('data-value'));
			}
			line.removeAttribute('hidden');

			return ratio;
		});
		stats.offsets = offsets;


		//draw axes
		var axis = this.axes[idx];

		//do not paint inexisting axis
		if (!axis) return;

		if (options.axes) axis = extend(this.axes[idx], options.axes[idx]);
		stats.axis = axis;

		//define values
		var axisValues = axis.values || values;
		stats.axisValues = axisValues;

		//define titles
		var axisTitles = axis.titles instanceof Function ? axisValues.map(function (v, i) { return axis.titles(v, i, stats); }, this) : axis.titles ? axis.titles : axisValues === values ? titles : axisValues.slice().map(function (value) {
			return value.toLocaleString();
		});
		stats.axisTitles = axisTitles;

		//define labels
		var labels = axis.labels instanceof Function ? axisValues.map(function (v, i) { return axis.labels(v, i, stats); }, this) : axis.labels || axisTitles;
		stats.labels = labels;


		//put axis properly
		var axisEl = grid.querySelector(("#grid-axis-" + (lines.orientation)));
		if (!axisEl) {
			axisEl = document.createElement('span');
			axisEl.id = "grid-axis-" + (lines.orientation) + "-" + idx;
			axisEl.classList.add('grid-axis');
			axisEl.classList.add(("grid-axis-" + (lines.orientation)));
			axisEl.setAttribute('data-name', axis.name);
			axisEl.setAttribute('title', axis.name);
			grid.appendChild(axisEl);
		}
		axisEl.removeAttribute('hidden');

		//draw labels
		axisValues.forEach(function (value, i) {
			if (value == null || labels[i] == null) return;

			var label = grid.querySelector(("#grid-label-" + (lines.orientation) + "-" + (value|0) + "-" + idx));
			if (!label) {
				label = document.createElement('label');
				label.id = "grid-label-" + (lines.orientation) + "-" + (value|0) + "-" + idx;
				label.classList.add('grid-label');
				label.classList.add(("grid-label-" + (lines.orientation)));
				label.setAttribute('data-value', value);
				label.setAttribute('for', ("grid-line-" + (lines.orientation)));
				label.setAttribute('title', axisTitles[i]);
				label.innerHTML = labels[i];
				grid.appendChild(label);
				if (lines.orientation === 'x') {
					label.style.left = offsets[i] + '%';
				}
				else {
					label.style.top = (100 - offsets[i]) + '%';
				}
			}

			if (within(value, linesMin, linesMax)) {
				label.removeAttribute('hidden');
			} else {
				label.setAttribute('hidden', true);
			}
		});

	}, this);

	this.emit('update');

	return this;
};
},{"events":2,"inherits":23,"insert-css":24,"is-browser":25,"mumath/closest":28,"mumath/lg":29,"mumath/order":30,"mumath/within":31,"xtend":50}],36:[function(require,module,exports){
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var now = require('right-now')
var raf = require('raf')

module.exports = Engine
function Engine(fn) {
    if (!(this instanceof Engine)) 
        return new Engine(fn)
    this.running = false
    this.last = now()
    this._frame = 0
    this._tick = this.tick.bind(this)

    if (fn)
        this.on('tick', fn)
}

inherits(Engine, EventEmitter)

Engine.prototype.start = function() {
    if (this.running) 
        return
    this.running = true
    this.last = now()
    this._frame = raf(this._tick)
    return this
}

Engine.prototype.stop = function() {
    this.running = false
    if (this._frame !== 0)
        raf.cancel(this._frame)
    this._frame = 0
    return this
}

Engine.prototype.tick = function() {
    this._frame = raf(this._tick)
    var time = now()
    var dt = time - this.last
    this.emit('tick', dt)
    this.last = time
}
},{"events":2,"inherits":23,"raf":37,"right-now":39}],37:[function(require,module,exports){
(function (global){
var now = require('performance-now')
  , root = typeof window === 'undefined' ? global : window
  , vendors = ['moz', 'webkit']
  , suffix = 'AnimationFrame'
  , raf = root['request' + suffix]
  , caf = root['cancel' + suffix] || root['cancelRequest' + suffix]

for(var i = 0; !raf && i < vendors.length; i++) {
  raf = root[vendors[i] + 'Request' + suffix]
  caf = root[vendors[i] + 'Cancel' + suffix]
      || root[vendors[i] + 'CancelRequest' + suffix]
}

// Some versions of FF have rAF but not cAF
if(!raf || !caf) {
  var last = 0
    , id = 0
    , queue = []
    , frameDuration = 1000 / 60

  raf = function(callback) {
    if(queue.length === 0) {
      var _now = now()
        , next = Math.max(0, frameDuration - (_now - last))
      last = next + _now
      setTimeout(function() {
        var cp = queue.slice(0)
        // Clear queue here to prevent
        // callbacks from appending listeners
        // to the current frame's queue
        queue.length = 0
        for(var i = 0; i < cp.length; i++) {
          if(!cp[i].cancelled) {
            try{
              cp[i].callback(last)
            } catch(e) {
              setTimeout(function() { throw e }, 0)
            }
          }
        }
      }, Math.round(next))
    }
    queue.push({
      handle: ++id,
      callback: callback,
      cancelled: false
    })
    return id
  }

  caf = function(handle) {
    for(var i = 0; i < queue.length; i++) {
      if(queue[i].handle === handle) {
        queue[i].cancelled = true
      }
    }
  }
}

module.exports = function(fn) {
  // Wrap in a new function to prevent
  // `cancel` potentially being assigned
  // to the native rAF function
  return raf.call(root, fn)
}
module.exports.cancel = function() {
  caf.apply(root, arguments)
}
module.exports.polyfill = function() {
  root.requestAnimationFrame = raf
  root.cancelAnimationFrame = caf
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"performance-now":34}],38:[function(require,module,exports){
(function (process){
'use strict';
var onetime = require('onetime');
var exitHook = require('exit-hook');

module.exports = onetime(function () {
	exitHook(function () {
		process.stdout.write('\u001b[?25h');
	});
});

}).call(this,require('_process'))
},{"_process":3,"exit-hook":17,"onetime":33}],39:[function(require,module,exports){
(function (global){
module.exports =
  global.performance &&
  global.performance.now ? function now() {
    return performance.now()
  } : Date.now || function now() {
    return +new Date
  }

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],40:[function(require,module,exports){
var resolve = require('soundcloud-resolve')
var fonts = require('google-fonts')
var minstache = require('minstache')
var insert = require('insert-css')
var fs = require('fs')

var icons = {
    black: 'https://developers.soundcloud.com/assets/logo_black.png'
  , white: 'https://developers.soundcloud.com/assets/logo_white.png'
}

module.exports = badge
function noop(err){ if (err) throw err }

var inserted = false
var gwfadded = false
var template = null

function badge(options, callback) {
  if (!inserted) insert(".npm-scb-wrap {\n  font-family: 'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;\n  font-weight: 200;\n  position: absolute;\n  top: 0;\n  left: 0;\n  z-index: 999;\n}\n\n.npm-scb-wrap a {\n  text-decoration: none;\n  color: #000;\n}\n.npm-scb-white\n.npm-scb-wrap a {\n  color: #fff;\n}\n\n.npm-scb-inner {\n  position: absolute;\n  top: -120px; left: 0;\n  padding: 8px;\n  width: 100%;\n  height: 150px;\n  z-index: 2;\n  -webkit-transition: width 0.5s cubic-bezier(1, 0, 0, 1), top 0.5s;\n     -moz-transition: width 0.5s cubic-bezier(1, 0, 0, 1), top 0.5s;\n      -ms-transition: width 0.5s cubic-bezier(1, 0, 0, 1), top 0.5s;\n       -o-transition: width 0.5s cubic-bezier(1, 0, 0, 1), top 0.5s;\n          transition: width 0.5s cubic-bezier(1, 0, 0, 1), top 0.5s;\n}\n.npm-scb-wrap:hover\n.npm-scb-inner {\n  top: 0;\n}\n\n.npm-scb-artwork {\n  position: absolute;\n  top: 16px; left: 16px;\n  width: 104px; height: 104px;\n  box-shadow: 0 0 8px -3px #000;\n  outline: 1px solid rgba(0,0,0,0.1);\n  z-index: 2;\n}\n.npm-scb-white\n.npm-scb-artwork {\n  outline: 1px solid rgba(255,255,255,0.1);\n  box-shadow: 0 0 10px -2px rgba(255,255,255,0.9);\n}\n\n.npm-scb-info {\n  position: absolute;\n  top: 16px;\n  left: 120px;\n  width: 300px;\n  z-index: 1;\n}\n\n.npm-scb-info > a {\n  display: block;\n}\n\n.npm-scb-now-playing {\n  font-size: 12px;\n  line-height: 12px;\n  position: absolute;\n  width: 500px;\n  z-index: 1;\n  padding: 15px 0;\n  top: 0; left: 138px;\n  opacity: 1;\n  -webkit-transition: opacity 0.25s;\n     -moz-transition: opacity 0.25s;\n      -ms-transition: opacity 0.25s;\n       -o-transition: opacity 0.25s;\n          transition: opacity 0.25s;\n}\n\n.npm-scb-wrap:hover\n.npm-scb-now-playing {\n  opacity: 0;\n}\n\n.npm-scb-white\n.npm-scb-now-playing {\n  color: #fff;\n}\n.npm-scb-now-playing > a {\n  font-weight: bold;\n}\n\n.npm-scb-info > a > p {\n  margin: 0;\n  padding-bottom: 0.25em;\n  line-height: 1.35em;\n  margin-left: 1em;\n  font-size: 1em;\n}\n\n.npm-scb-title {\n  font-weight: bold;\n}\n\n.npm-scb-icon {\n  position: absolute;\n  top: 120px;\n  padding-top: 0.75em;\n  left: 16px;\n}\n"), inserted = true
  if (!template) template = minstache.compile("<div class=\"npm-scb-wrap\">\n  <div class=\"npm-scb-inner\">\n    <a target=\"_blank\" href=\"{{!urls.song}}\">\n      <img class=\"npm-scb-icon\" src=\"{{!icon}}\">\n      <img class=\"npm-scb-artwork\" src=\"{{!artwork}}\">\n    </a>\n    <div class=\"npm-scb-info\">\n      <a target=\"_blank\" href=\"{{!urls.song}}\">\n        <p class=\"npm-scb-title\">{{!title}}</p>\n      </a>\n      <a target=\"_blank\" href=\"{{!urls.artist}}\">\n        <p class=\"npm-scb-artist\">{{!artist}}</p>\n      </a>\n    </div>\n  </div>\n  <div class=\"npm-scb-now-playing\">\n    Now Playing:\n    <a href=\"{{!urls.song}}\">{{!title}}</a>\n    by\n    <a href=\"{{!urls.artist}}\">{{!artist}}</a>\n  </div>\n</div>")

  if (!gwfadded && options.getFonts) {
    fonts.add({ 'Open Sans': [300, 600] })
    gwfadded = true
  }

  options = options || {}
  callback = callback || noop

  var div   = options.el || document.createElement('div')
  var icon  = !('dark' in options) || options.dark ? 'black' : 'white'
  var id    = options.client_id
  var song  = options.song

  resolve(id, song, function(err, json) {
    if (err) return callback(err)
    if (json.kind !== 'track') throw new Error(
      'soundcloud-badge only supports individual tracks at the moment'
    )

    div.classList[
      icon === 'black' ? 'remove' : 'add'
    ]('npm-scb-white')

    div.innerHTML = template({
        artwork: json.artwork_url || json.user.avatar_url
      , artist: json.user.username
      , title: json.title
      , icon: icons[icon]
      , urls: {
          song: json.permalink_url
        , artist: json.user.permalink_url
      }
    })

    document.body.appendChild(div)

    callback(null, json.stream_url + '?client_id=' + id, json, div)
  })

  return div
}

},{"fs":1,"google-fonts":21,"insert-css":41,"minstache":27,"soundcloud-resolve":42}],41:[function(require,module,exports){
var inserted = [];

module.exports = function (css) {
    if (inserted.indexOf(css) >= 0) return;
    inserted.push(css);
    
    var elem = document.createElement('style');
    var text = document.createTextNode(css);
    elem.appendChild(text);
    
    if (document.head.childNodes.length) {
        document.head.insertBefore(elem, document.head.childNodes[0]);
    }
    else {
        document.head.appendChild(elem);
    }
};

},{}],42:[function(require,module,exports){
var qs  = require('querystring')
var xhr = require('xhr')

module.exports = resolve

function resolve(id, goal, callback) {
  var uri = 'https://api.soundcloud.com/resolve.json?' + qs.stringify({
      url: goal
    , client_id: id
  })

  xhr({
      uri: uri
    , method: 'GET'
  }, function(err, res, body) {
    if (err) return callback(err)
    try {
      body = JSON.parse(body)
    } catch(e) {
      return callback(e)
    }
    if (body.errors) return callback(new Error(
      body.errors[0].error_message
    ))

    var stream_url = body.kind === 'track'
      && body.stream_url + '?client_id=' + id

    return callback(null, body, stream_url)
  })
}

},{"querystring":6,"xhr":47}],43:[function(require,module,exports){
'use strict';
var ansiRegex = require('ansi-regex')();

module.exports = function (str) {
	return typeof str === 'string' ? str.replace(ansiRegex, '') : str;
};

},{"ansi-regex":9}],44:[function(require,module,exports){
(function (process){
'use strict';
var argv = process.argv;

var terminator = argv.indexOf('--');
var hasFlag = function (flag) {
	flag = '--' + flag;
	var pos = argv.indexOf(flag);
	return pos !== -1 && (terminator !== -1 ? pos < terminator : true);
};

module.exports = (function () {
	if ('FORCE_COLOR' in process.env) {
		return true;
	}

	if (hasFlag('no-color') ||
		hasFlag('no-colors') ||
		hasFlag('color=false')) {
		return false;
	}

	if (hasFlag('color') ||
		hasFlag('colors') ||
		hasFlag('color=true') ||
		hasFlag('color=always')) {
		return true;
	}

	if (process.stdout && !process.stdout.isTTY) {
		return false;
	}

	if (process.platform === 'win32') {
		return true;
	}

	if ('COLORTERM' in process.env) {
		return true;
	}

	if (process.env.TERM === 'dumb') {
		return false;
	}

	if (/^screen|^xterm|^vt100|color|ansi|cygwin|linux/i.test(process.env.TERM)) {
		return true;
	}

	return false;
})();

}).call(this,require('_process'))
},{"_process":3}],45:[function(require,module,exports){
(function (process){
/**
 * Simple node/browser test runner
 *
 * @module tst
 */

var chalk = require('chalk');
var isBrowser = require('is-browser');
var now = require('performance-now');
var elegantSpinner = require('elegant-spinner');
var logUpdate = require('log-update');
var ansi = require('ansi-escapes');
var inherits = require('inherits');
var Emitter = require('events');
var extend = require('xtend/mutable');


// Error.stackTraceLimit = 10;


//default indentation
test.INDENT = '  ';

//whether we run the only test, forcefully
test.ONLY_MODE = false;

//default timeout for async tests
test.TIMEOUT = 2000;

//max timeout
test.MAX_TIMEOUT = 10e5;

//chain of nested test calls
var tests = [];
var testCount = 0;

//planned tests to run
var testQueue = [];

//flag indicating that since some time tests are run in deferred fashion
//i.e. lost their stack in browser :(
var DEFERRED = false;

//indicate whether we are in only-detection mode (tests are just planned, not run)
//or we are in a forced full-bundle run. Unlikely user will ever touch this flag.
test.DETECT_ONLY = true;

//detect whether at least one test failed
test.ERROR = false;


//end with error, if any
process.on('exit', function () {
    if (test.ERROR) process.exit(1);
});


//run execution after all sync tests are registered
if (test.DETECT_ONLY) {
    setTimeout(function () {
        //if only detection mode wasn’t changed by user
        //which means sync tests are run already - run the thing
        if (test.DETECT_ONLY) {
            run();
        }
    });
}


/**
 * Test enqueuer
 */
function test (message, fn, only) {
    //if run in exclusive mode - allow only `test.only` calls
    if (test.ONLY_MODE && !only) {
        //but if test is run within the parent - allow it
        if (!tests.length) return test;
    }

    //ignore bad args
    if (!message) return test;

    //init test object params
    var testObj = new Test({
        id: testCount++,
        title: message,

        //pending, success, error, group
        status: null,

        //test function
        fn: fn,

        //nested tests
        children: [],

        //whether test should be resolved
        async: undefined,

        //whether the test is last child within the group
        last: false,

        //timeout for the async
        _timeout: test.TIMEOUT,

        //whether the test is the only to run (launched via .only method)
        only: !!only,

        //whether the test was started in deferred fashion
        //it can be sync, but launched after async
        deferred: DEFERRED
    });

    //handle args
    if (!fn) {
        //if only message passed - do skip
        if (!fn && typeof message === 'string') {
            testObj.status = 'skip';
        }
        else {
            //detect test name
            testObj.fn = message;
            message = message.name;
            if (!message) message = 'Test #' + testObj.id;

            //update test title
            testObj.title = message;
        }
    }

    //detect async as at least one function argument
    //NOTE: tests returning promise will set async flag here
    if (testObj.async == null) {
        testObj.async = !!(testObj.fn && testObj.fn.length);
    }

    //also detect promise, if passed one
    if (testObj.fn && testObj.fn.then) {
        //also that means that the test is run already
        //and tests within the promise executor are already detected it’s parent wrongly
        //nothing we can do. Redefining parent is not an option -
        //we don’t know which tests were of this parent, which were not.
        testObj.promise = testObj.fn;
        testObj.async = true;
        testObj.time = now();
    }

    //nested tests are detected here
    //because calls to `.test` from children happen only when some test is active
    testObj.parent = tests[tests.length - 1];

    //register children - supposed that parent will run all the children after fin
    if (testObj.parent) {
        testObj.parent.children.push(testObj);
    }
    //if test has no parent - plan it's separate run
    else {
        testQueue.push(testObj);
    }

    //if detecion only mode - ignore execution
    //if ONLY_MODE - execute it at instant
    if (!test.DETECT_ONLY || test.ONLY_MODE) {
        run();
    }

    return testObj;
}

/**
 * Tests queue runner
 */
var currentTest;
function run () {
    //ignore active run
    if (currentTest) return;

    //get the planned test
    currentTest = testQueue.shift();

    //if the queue is empty - return
    if (!currentTest) return;

    //ignore test if it is not the only run
    if (test.ONLY_MODE && !currentTest.only) {
        return planRun();
    }

    //exec it, the promise will be formed
    currentTest.exec();

    //at the moment test is run, we know all it’s children
    //push all the children to the queue, after the current test
    //FIXME: this guy erases good stacktrace :< Maybe call asyncs last?
    var children = currentTest.children;

    //mind the case if no only children test is selected - run them all instead of none
    if (children.every(function (child) {return !child.only})) {
        children.forEach(function (child) {
            child.only = true;
        });
    }

    for (var i = children.length; i--;){
        testQueue.unshift(children[i]);
    }

    //mark last kid
    if (children.length) {
        children[children.length - 1].last = true;
    }

    //if test is not async - run results at instant to avoid losing stacktrace
    if (!currentTest.async) {
        currentTest = null;
        run();
    }
    //plan running next test after the promise
    else {
        DEFERRED = true;
        currentTest.promise.then(planRun, planRun);
    }

    function planRun () {
        currentTest = null;
        run();
    }
}



/**
 * A test object constructor
 */
function Test (opts) {
    extend(this, opts);
}

inherits(Test, Emitter);


/**
 * Call before exec
 */
Test.prototype.after = function (cb) {
    this.once('after', cb);
    return this;
};

/**
 * Call after exec
 */
Test.prototype.before = function (cb) {
    this.once('before', cb);
    return this;
};

/**
 * Bind promise-like
 */
Test.prototype.then = function (resolve, reject) {
    this.once('success', resolve);
    this.once('error', reject);
    return this;
};

/**
 * Mocha-compat timeout setter
 */
Test.prototype.timeout = function (value) {
    if (value == null) return this._timeout;
    if (value === false) this._timeout = test.MAX_TIMEOUT;
    else if (value === Infinity) this._timeout = test.MAX_TIMEOUT;
    else this._timeout = value;
    return this;
}

/**
 * Prototype props
 *
 * @True {[type]}
 */
extend(Test.prototype, {
    id: testCount,
    title: 'Undefined test',

    //pending, success, error, group
    status: null,

    //test function
    fn: null,

    //nested tests
    children: [],

    //whether test should be resolved
    async: undefined,

    //whether the test is last child within the group
    last: false,

    //timeout for the async
    _timeout: test.TIMEOUT,

    //whether the test is the only to run (launched via .only method)
    only: false,

    //whether the test was started in deferred fashion
    //it can be sync, but launched after async
    deferred: DEFERRED
});

/**
 * Execute main test function
 */
Test.prototype.exec = function () {
    var self = this;

    //ignore skipping test
    if (self.status === 'skip') {
        self.promise = Promise.resolve();
        self.print();
        return self;
    }

    //save test to the chain
    tests.push(self);

    //display title of the test
    self.printTitle();

    //timeout promise timeout id
    var toId;

    //prepare test
    self.emit('before');

    //exec sync test
    if (!self.async) {
        self.promise = Promise.resolve();

        var time;
        try {

            self.time = now();
            var result = self.fn.call(self);
            time = now() - self.time;

        } catch (e) {
            self.fail(e);
        }

        //if the result is promise - whoops, we need to run async
        if (result && result.then) {
            self.async = true;
            self.promise = result;
            //FIXME: this guy violates the order of nesting
            //because so far it was thought as sync
            self.execAsync();
        }

        //if result is not error - do finish
        else {
            self.time = time;
            self.emit('after');

            if (!self.error) {
                if (!self.status !== 'group') self.status = 'success';

                self.emit('success');
                self.print();
            }
        }

    }
    else {
        self.execAsync();
    }

    //after promise’s executor, but before promise then’s
    //so user can’t create tests asynchronously, they should be created at once
    tests.pop();

    return self;
};


/*
 * Exec async test - it should be run in promise
 * sorry about the stacktrace, nothing I can do...
 */
Test.prototype.execAsync = function () {
    var self = this;

    //if promise is already created (by user) - race with timeout
    //FIXME: add time measure
    if (self.promise) {
        self.promise = Promise.race([
            self.promise,
            new Promise(execTimeout)
        ]);
    }
    //else - invoke function
    else {
        self.promise = Promise.race([
            new Promise(function (resolve, reject) {
                self.status = 'pending';
                self.time = now();
                return self.fn.call(self, resolve);
            }),
            new Promise(execTimeout)
        ])
    }

    self.promise.then(function () {
        self.time = now() - self.time;

        clearTimeout(toId);
        if (self.status !== 'group') self.status = 'success';

        self.emit('after');
        self.emit('success');

        self.print();
    }, function (e) {
        self.fail(e)
    });

    function execTimeout (resolve, reject) {
        toId = setTimeout(function () {
            reject(new Error('Timeout ' + self._timeout + 'ms reached. Please fix the test or set `this.timeout(' + (self._timeout + 1000) + ');`.'));
        }, self._timeout);
    }
};


/**
 * Resolve to error (error handler)
 */
Test.prototype.fail = function (e) {
    var self = this;

    if (typeof e !== 'object') e = Error(e);

    //grab stack (the most actual is here, further is mystically lost)
    self.stack = e.stack;

    //set flag that bundle is failed
    test.ERROR = true;

    var parent = self.parent;
    while (parent) {
        parent.status = 'group';
        parent = parent.parent;
    }

    //update test status
    self.status = 'error';
    self.error = e;

    self.emit('fail', e);

    self.print();
};


Test.prototype.printTitle = function () {
    var self = this;

    if (!isBrowser) {
        var frame = elegantSpinner();

        //print title (indicator of started, now current test)
        updateTitle();
        self.titleInterval = setInterval(updateTitle, 50);

        //update title frame
        function updateTitle () {
            //FIXME: this is the most undestructive for logs way of rendering, but crappy
            process.stdout.write(ansi.cursorLeft);
            process.stdout.write(ansi.eraseEndLine);
            process.stdout.write(chalk.white(indent(self) + ' ' + frame() + ' ' + self.title) + test.INDENT);
            // logUpdate(chalk.white(indent(test.indent) + ' ' + frame() + ' ' + test.title));
        }
    }
}
//clear printed title (node)
Test.prototype.clearTitle = function () {
    if (!isBrowser && this.titleInterval) {
        clearInterval(this.titleInterval);
        process.stdout.write(ansi.cursorLeft);
        process.stdout.write(ansi.eraseEndLine);
    }
}

//universal printer dependent on resolved test
Test.prototype.print = function () {
    var self = this;

    this.clearTitle();

    var single = self.children && self.children.length ? false : true;

    if (self.status === 'error') {
        self.printError();
    }
    else if (self.status === 'group') {
        self.printGroup(single);
    }
    else if (self.status === 'success') {
        self.printSuccess(single);
    }
    else if (self.status === 'skip') {
        self.printSkip(single);
    }

    //last child should close parent’s group in browser
    if (self.last) {
        if (isBrowser) {
            //if truly last - create as many groups as many last parents
            if (!self.children.length) {
                console.groupEnd();
                var parent = self.parent;
                while (parent && parent.last) {
                    console.groupEnd();
                    parent = parent.parent;
                }
            }
        } else {
            //create padding
            if (!self.children.length) console.log();
        }
    }
}

//print pure red error
Test.prototype.printError = function () {
    var self = this;

    //browser shows errors better
    if (isBrowser) {
        console.group('%c× ' + self.title, 'color: red; font-weight: normal');
        if (self.error) {
            if (self.error.name === 'AssertionError') {
                if (typeof self.error.expected !== 'object') {
                    var msg = '%cAssertionError:\n%c' + self.error.expected + '\n' + '%c' + self.error.operator + '\n' + '%c' + self.error.actual;
                    console.groupCollapsed(msg, 'color: red; font-weight: normal', 'color: green; font-weight: normal', 'color: gray; font-weight: normal', 'color: red; font-weight: normal');
                }
                else {
                    var msg = '%cAssertionError: ' + self.error.message;
                    console.groupCollapsed(msg, 'color: red; font-weight: normal');
                }
                console.error(self.stack);
                console.groupEnd();
            }
            else {
                var msg = typeof self.error === 'string' ? self.error : self.error.message;
                console.groupCollapsed('%c' + msg, 'color: red; font-weight: normal');
                console.error(self.stack);
                console.groupEnd();
            }
        }
        console.groupEnd();
    }
    else {
        console.log(chalk.red(indent(self) + ' × ') + chalk.red(self.title));

        if (self.error.stack) {
            if (self.error.name === 'AssertionError') {
                console.error(chalk.gray('AssertionError: ') + chalk.green(self.error.expected) + '\n' + chalk.gray(self.error.operator) + '\n' + chalk.red(self.error.actual));
            } else {
                //NOTE: node prints e.stack along with e.message
                var stack = self.error.stack.replace(/^\s*/gm, indent(self) + '   ');
                console.error(chalk.gray(stack));
            }
        }
    }
}

//print green success
Test.prototype.printSuccess = function (single) {
    var self = this;

    if (isBrowser) {
        if (single) {
            console.log('%c√ ' + self.title + '%c  ' + self.time.toFixed(2) + 'ms', 'color: green; font-weight: normal', 'color:rgb(150,150,150); font-size:0.9em');
        } else {
            self.printGroup();
        }
    }
    else {
        if (!single) {
            self.printGroup();
        }
        else {
            console.log(chalk.green(indent(self) + ' √ ') + chalk.green.dim(self.title) + chalk.gray(' ' + self.time.toFixed(2) + 'ms'));
        }
    }
}

//print yellow warning (not all tests are passed or it is container)
Test.prototype.printGroup = function () {
    var self = this;

    if (isBrowser) {
        console.group('%c+ ' + self.title + '%c  ' + self.time.toFixed(2) + 'ms', 'color: orange; font-weight: normal', 'color:rgb(150,150,150); font-size:0.9em');
    }
    else {
        console.log();
        console.log(indent(self) +' ' + chalk.yellow('+') + ' ' + chalk.yellow(self.title) + chalk.gray(' ' + self.time.toFixed(2) + 'ms'));
    }
}

//print blue skip
Test.prototype.printSkip = function (single) {
    var self = this;

    if (isBrowser) {
        console[single ? 'log' : 'group']('%c- ' + self.title, 'color: blue');
    }
    else {
        console.log(chalk.cyan(indent(self) + ' - ') + chalk.cyan.dim(self.title));
    }
}


//return indentation of for a test, based on nestedness
function indent (testObj) {
    var parent = testObj.parent;
    var str = '';
    while (parent) {
        str += test.INDENT;
        parent = parent.parent;
    }
    return str;
}




//skip alias
test.skip = function skip (message) {
   return test(message);
};

//only alias
test.only = function only (message, fn) {
    //indicate that only is detected, except for the case of intentional run
    if (fn) test.DETECT_ONLY = false;
    //change only mode to true
    test.ONLY_MODE = true;

    var result = test(message, fn, true);
    return result;
}

//more obvious chain
test.test = test;


module.exports = test;
}).call(this,require('_process'))
},{"_process":3,"ansi-escapes":8,"chalk":12,"elegant-spinner":14,"events":2,"inherits":23,"is-browser":25,"log-update":26,"performance-now":34,"xtend/mutable":51}],46:[function(require,module,exports){
var AudioContext = window.AudioContext || window.webkitAudioContext

module.exports = WebAudioAnalyser

function WebAudioAnalyser(audio, ctx, opts) {
  var this$1 = this;

  if (!(this instanceof WebAudioAnalyser)) return new WebAudioAnalyser(audio, ctx, opts)
  if (!(ctx instanceof AudioContext)) (opts = ctx), (ctx = null)

  opts = opts || {}
  this.ctx = ctx = ctx || new AudioContext

  if (!(audio instanceof AudioNode)) {
    audio = (audio instanceof Audio || audio instanceof HTMLAudioElement)
      ? ctx.createMediaElementSource(audio)
      : ctx.createMediaStreamSource(audio)
  }

  this.analyser = ctx.createAnalyser()
  this.stereo   = !!opts.stereo
  this.audible  = opts.audible !== false
  this.wavedata = null
  this.freqdata = null
  this.splitter = null
  this.merger   = null
  this.source   = audio

  if (!this.stereo) {
    this.output = this.source
    this.source.connect(this.analyser)
    if (this.audible)
      this.analyser.connect(ctx.destination)
  } else {
    this.analyser = [this.analyser]
    this.analyser.push(ctx.createAnalyser())

    this.splitter = ctx.createChannelSplitter(2)
    this.merger   = ctx.createChannelMerger(2)
    this.output   = this.merger

    this.source.connect(this.splitter)

    for (var i = 0; i < 2; i++) {
      this$1.splitter.connect(this$1.analyser[i], i, 0)
      this$1.analyser[i].connect(this$1.merger, 0, i)
    }

    if (this.audible)
      this.merger.connect(ctx.destination)
  }
}

WebAudioAnalyser.prototype.waveform = function(output, channel) {
  if (!output) output = this.wavedata || (
    this.wavedata = new Uint8Array((this.analyser[0] || this.analyser).frequencyBinCount)
  )

  var analyser = this.stereo
    ? this.analyser[channel || 0]
    : this.analyser

  analyser.getByteTimeDomainData(output)

  return output
}

WebAudioAnalyser.prototype.frequencies = function(output, channel) {
  if (!output) output = this.freqdata || (
    this.freqdata = new Uint8Array((this.analyser[0] || this.analyser).frequencyBinCount)
  )

  var analyser = this.stereo
    ? this.analyser[channel || 0]
    : this.analyser

  analyser.getByteFrequencyData(output)

  return output
}

},{}],47:[function(require,module,exports){
var window = require("global/window")
var once = require("once")

var messages = {
    "0": "Internal XMLHttpRequest Error",
    "4": "4xx Client Error",
    "5": "5xx Server Error"
}

var XHR = window.XMLHttpRequest || noop
var XDR = "withCredentials" in (new XHR()) ?
        window.XMLHttpRequest : window.XDomainRequest

module.exports = createXHR

function createXHR(options, callback) {
    if (typeof options === "string") {
        options = { uri: options }
    }

    options = options || {}
    callback = once(callback)

    var xhr

    if (options.cors) {
        xhr = new XDR()
    } else {
        xhr = new XHR()
    }

    var uri = xhr.url = options.uri
    var method = xhr.method = options.method || "GET"
    var body = options.body || options.data
    var headers = xhr.headers = options.headers || {}
    var isJson = false

    if ("json" in options) {
        isJson = true
        headers["Content-Type"] = "application/json"
        body = JSON.stringify(options.json)
    }

    xhr.onreadystatechange = readystatechange
    xhr.onload = load
    xhr.onerror = error
    // IE9 must have onprogress be set to a unique function.
    xhr.onprogress = function () {
        // IE must die
    }
    // hate IE
    xhr.ontimeout = noop
    xhr.open(method, uri)
    if (options.cors) {
        xhr.withCredentials = true
    }
    xhr.timeout = "timeout" in options ? options.timeout : 5000

    if ( xhr.setRequestHeader) {
        Object.keys(headers).forEach(function (key) {
            xhr.setRequestHeader(key, headers[key])
        })
    }

    xhr.send(body)

    return xhr

    function readystatechange() {
        if (xhr.readyState === 4) {
            load()
        }
    }

    function load() {
        var error = null
        var status = xhr.statusCode = xhr.status
        var body = xhr.body = xhr.response ||
            xhr.responseText || xhr.responseXML

        if (status === 0 || (status >= 400 && status < 600)) {
            var message = xhr.responseText ||
                messages[String(xhr.status).charAt(0)]
            error = new Error(message)

            error.statusCode = xhr.status
        }

        if (isJson) {
            try {
                body = xhr.body = JSON.parse(body)
            } catch (e) {}
        }

        callback(error, xhr, body)
    }

    function error(evt) {
        callback(evt, xhr)
    }
}


function noop() {}

},{"global/window":48,"once":49}],48:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window
} else if (typeof global !== "undefined") {
    module.exports = global
} else {
    module.exports = {}
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],49:[function(require,module,exports){
module.exports = once

once.proto = once(function () {
  Object.defineProperty(Function.prototype, 'once', {
    value: function () {
      return once(this)
    },
    configurable: true
  })
})

function once (fn) {
  var called = false
  return function () {
    if (called) return
    called = true
    return fn.apply(this, arguments)
  }
}

},{}],50:[function(require,module,exports){
module.exports = extend

var hasOwnProperty = Object.prototype.hasOwnProperty;

function extend() {
    var arguments$1 = arguments;

    var target = {}

    for (var i = 0; i < arguments$1.length; i++) {
        var source = arguments$1[i]

        for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],51:[function(require,module,exports){
module.exports = extend

var hasOwnProperty = Object.prototype.hasOwnProperty;

function extend(target) {
    var arguments$1 = arguments;

    for (var i = 1; i < arguments$1.length; i++) {
        var source = arguments$1[i]

        for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],52:[function(require,module,exports){
var test = require('tst');
var Spectrum = require('./');
// var Formant = require('audio-formant');
// var Speaker = require('audio-speaker');
// var Sink = require('audio-sink');
// var Slice = require('audio-slice');
var ft = require('fourier-transform');
var isBrowser = require('is-browser');
var SCBadge = require('soundcloud-badge');
var Analyser = require('web-audio-analyser');


//stream soundcloud
var audio = new Audio;
var badge = SCBadge({
	client_id: '6b7ae5b9df6a0eb3fcca34cc3bb0ef14'
	, song: 'https://soundcloud.com/einmusik/einmusik-live-watergate-4th-may-2016'
	, dark: false
	, getFonts: false
}, function(err, src, data, div) {
	if (err) throw err;

	//TODO: read url from href here
	audio.src = src;//'https://api.soundcloud.com/tracks/263762161/stream?client_id=6b7ae5b9df6a0eb3fcca34cc3bb0ef14';
	audio.crossOrigin = 'Anonymous';
	audio.addEventListener('canplay', function() {
		audio.play();
	}, false);
});

var analyser = Analyser(audio, { audible: true, stereo: false })



//generate input sine
var N = 4096;
var sine = new Float32Array(N);
var saw = new Float32Array(N);
var noise = new Float32Array(N);
var rate = 44100;

for (var i = 0; i < N; i++) {
	sine[i] = Math.sin(50 * Math.PI * 2 * (i / rate));
	saw[i] = 2 * ((1000 * i / rate) % 1) - 1;
	noise[i] = Math.random() * 2 - 1;
}

//normalize browser style
if (isBrowser) {
	document.body.style.margin = '0';
	document.body.style.boxSizing = 'border-box';
}



test('linear classics', function () {
	// var frequencies = new Float32Array(ft(sine));
	// var frequencies = new Float32Array(1024).fill(0.5);
	var frequencies = new Float32Array(analyser.analyser.frequencyBinCount);

	var spectrum = new Spectrum({
		gridAxes: false,
		frequencies: frequencies,
		minFrequency: 40
		// logarithmic: false
		// viewport: function (w, h) {
		// 	return [50,20,w-70,h-60];
		// }
	}).on('render', function () {
		analyser.analyser.getFloatFrequencyData(frequencies);
		frequencies = frequencies.map(function (v) {
			return (100 + v) / 100;
		});
		spectrum.setFrequencies(frequencies);
	});
});

test('log scale', function () {

});

test.skip('streaming', function () {
	var spectrum = new Spectrum({

	});

	Formant([1/1000, 1, 1, 0.5])
	.on('data', function (buffer) {
		spectrum.setFrequencies(buffer)
	})
	.pipe(Slice(1))
	.pipe(Sink());
});

test.skip('2d', function () {

});

test.skip('node', function () {

});


test.skip('viewport', function () {

});


test('clannels');

test('classic');

test('bars');

test('bars line');

test('dots');

test('dots line');

test('colormap (heatmap)');

test('multilayered (max values)');

test('line');

test('oscilloscope');


},{"./":7,"fourier-transform":18,"is-browser":25,"soundcloud-badge":40,"tst":45,"web-audio-analyser":46}]},{},[52]);
