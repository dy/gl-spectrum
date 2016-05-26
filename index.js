(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
'use strict'

exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

function init () {
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i]
    revLookup[code.charCodeAt(i)] = i
  }

  revLookup['-'.charCodeAt(0)] = 62
  revLookup['_'.charCodeAt(0)] = 63
}

init()

function toByteArray (b64) {
  var i, j, l, tmp, placeHolders, arr
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0

  // base64 is 4/3 + up to two characters of the original data
  arr = new Arr(len * 3 / 4 - placeHolders)

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len

  var L = 0

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)]
    arr[L++] = (tmp >> 16) & 0xFF
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[L++] = tmp & 0xFF
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var output = ''
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    output += lookup[tmp >> 2]
    output += lookup[(tmp << 4) & 0x3F]
    output += '=='
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1])
    output += lookup[tmp >> 10]
    output += lookup[(tmp >> 4) & 0x3F]
    output += lookup[(tmp << 2) & 0x3F]
    output += '='
  }

  parts.push(output)

  return parts.join('')
}

},{}],3:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('isarray')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

function typedArraySupport () {
  try {
    var arr = new Uint8Array(1)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    this.length = 0
    this.parent = undefined
  }

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype
  return arr
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (object.buffer instanceof ArrayBuffer) {
      return fromTypedArray(that, object)
    }
    if (object instanceof ArrayBuffer) {
      return fromArrayBuffer(that, object)
    }
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array) {
  array.byteLength // this throws if `array` is not a valid ArrayBuffer

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(array)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromTypedArray(that, new Uint8Array(array))
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
  if (typeof Symbol !== 'undefined' && Symbol.species &&
      Buffer[Symbol.species] === Buffer) {
    // Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
    Object.defineProperty(Buffer, Symbol.species, {
      value: null,
      configurable: true
    })
  }
} else {
  // pre-set for values that may exist in the future
  Buffer.prototype.length = undefined
  Buffer.prototype.parent = undefined
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = '' + string

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var this$1 = this;

  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this$1, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this$1, start, end)

      case 'ascii':
        return asciiSlice(this$1, start, end)

      case 'binary':
        return binarySlice(this$1, start, end)

      case 'base64':
        return base64Slice(this$1, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this$1, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  var this$1 = this;

  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this$1, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this$1, string, offset, length)

      case 'ascii':
        return asciiWrite(this$1, string, offset, length)

      case 'binary':
        return binaryWrite(this$1, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this$1, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this$1, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var this$1 = this;

  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end)
    newBuf.__proto__ = Buffer.prototype
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this$1[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  var this$1 = this;

  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this$1[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  var this$1 = this;

  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this$1[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  var this$1 = this;

  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this$1[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  var this$1 = this;

  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this$1[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  var this$1 = this;

  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this$1[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  var this$1 = this;

  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this$1[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  var this$1 = this;

  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this$1[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  var this$1 = this;

  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this$1[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  var this$1 = this;

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this$1[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this$1[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    )
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  var this$1 = this;

  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this$1[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this$1[i] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"base64-js":2,"ieee754":6,"isarray":4}],4:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
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

},{}],6:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":8,"./encode":9}],11:[function(require,module,exports){
/**
 * @module  gl-spectrum
 */

var extend = require('xtend/mutable');
var Component = require('gl-component');
var inherits = require('inherits');
var lg = require('mumath/lg');
var isBrowser = require('is-browser');
var createGrid = require('plot-grid');
var colormap = require('colormap');
var flatten = require('flatten');
var clamp = require('mumath/clamp');
var weighting = require('a-weighting');

module.exports = Spectrum;



/**
 * @contructor
 */
function Spectrum (options) {
	if (!(this instanceof Spectrum)) return new Spectrum(options);

	var that = this;

	options = options || {};
	options.antialias = true;

	Component.call(this, options);

	if (isBrowser) {
		this.container.classList.add('gl-spectrum');
	}


	if (!this.is2d) {
		var gl = this.gl;

		var float = gl.getExtension('OES_texture_float');
		if (!float) throw Error('WebGL does not support floats.');
		var floatLinear = gl.getExtension('OES_texture_float_linear');
		if (!floatLinear) throw Error('WebGL does not support floats.');

		this.maskSizeLocation = gl.getUniformLocation(this.program, 'maskSize');
		this.alignLocation = gl.getUniformLocation(this.program, 'align');
	}

	this.update();
}

inherits(Spectrum, Component);



Spectrum.prototype.maxDecibels = -30;
Spectrum.prototype.minDecibels = -100;

Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 20;

Spectrum.prototype.smoothing = 0.5;

Spectrum.prototype.snap = null;

Spectrum.prototype.grid = true;
Spectrum.prototype.axes = false;

Spectrum.prototype.logarithmic = true;

Spectrum.prototype.weighting = 'itu';

//evenly distributed within indicated diapasone
Spectrum.prototype.frequencies = new Float32Array(512).fill(Spectrum.prototype.minDecibels);


//TODO
Spectrum.prototype.orientation = 'horizontal';

//required to detect frequency resolution
Spectrum.prototype.sampleRate = 44100;

//colors to map spectrum against
Spectrum.prototype.fill = 'greys';
Spectrum.prototype.background = null;

//amount of alignment
Spectrum.prototype.align = .0;

//TODO implement shadow frequencies, like averaged/max values
Spectrum.prototype.shadow = [];

//mask defines style of bars, dots or line
Spectrum.prototype.mask = null;


/**
 * Here we might have to do kernel averaging for some
 */
Spectrum.prototype.frag = "\n\tprecision lowp float;\n\n\tuniform sampler2D frequencies;\n\tuniform sampler2D fill;\n\tuniform sampler2D mask;\n\tuniform sampler2D background;\n\tuniform vec4 viewport;\n\tuniform vec2 maskSize;\n\tuniform float align;\n\n\tvec2 coord;\n\tvec2 bin;\n\tfloat currMag;\n\tfloat prevMag;\n\tfloat nextMag;\n\tfloat currF;\n\tfloat prevF;\n\tfloat nextF;\n\tfloat maxMag;\n\tfloat minMag;\n\tfloat slope;\n\tfloat alpha;\n\n\t//return magnitude of normalized frequency\n\tfloat magnitude (float nf) {\n\t\treturn texture2D(frequencies, vec2((nf), 0.5)).w;\n\t}\n\n\tfloat within (float x, float left, float right) {\n\t\treturn step(left, x) * step(x, right);\n\t}\n\n\tfloat distToLine(vec2 p1, vec2 p2, vec2 testPt) {\n\t\tvec2 lineDir = p2 - p1;\n\t\tvec2 perpDir = vec2(lineDir.y, -lineDir.x);\n\t\tvec2 dirToPt1 = p1 - testPt;\n\t\treturn abs(dot(normalize(perpDir), dirToPt1));\n\t}\n\n\tvoid main () {\n\t\tcoord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);\n\t\tbin = vec2(1. / viewport.zw);\n\t\t// prevF = coord.x - .5*bin.x;\n\t\t// currF = coord.x;\n\t\t// nextF = coord.x + .5*bin.x;\n\t\t// prevMag = magnitude(prevF);\n\t\t// currMag = magnitude(currF);\n\t\t// nextMag = magnitude(nextF);\n\t\t// maxMag = max(currMag, prevMag);\n\t\t// minMag = min(currMag, prevMag);\n\t\t// slope = (currMag - prevMag) / bin.x;\n\t\t// alpha = atan(currMag - prevMag, bin.x);\n\n\n\t\t//calc mask\n\t\tfloat maskX = mod(gl_FragCoord.x, maskSize.x);\n\t\tfloat maskOutset = gl_FragCoord.x - maskX + .5;\n\n\t\t//find mask’s offset frequency\n\t\tfloat mag = max(magnitude(maskOutset / viewport.z), 0.);\n\n\t\t//calc dist\n\t\tfloat dist = abs(align - coord.y);\n\n\t\t//calc intensity\n\t\tfloat maxAlign = min(max(align, 1. - align), .75);\n\t\tfloat minAlign = max(1. - maxAlign, .25);\n\t\tfloat intensity = pow(dist / max(align, 1. - align), .85) * (maxAlign) + (minAlign);\n\n\n\t\t//apply mask\n\t\tfloat top = coord.y - mag + align*mag - align + .5*maskSize.y/viewport.w;\n\t\tfloat bottom = -coord.y - align*mag + align + .5*maskSize.y/viewport.w;\n\t\tfloat maskY = max(\n\t\t\tmax(top * viewport.w / maskSize.y, .5),\n\t\t\tmax(bottom * viewport.w / maskSize.y, .5)\n\t\t);\n\t\tvec2 maskCoord = vec2(maskX / maskSize.x, maskY);\n\t\tfloat maskLevel = texture2D(mask, maskCoord).x;\n\n\t\t//active area limits 0-mask case\n\t\tfloat active = smoothstep(-0.001, 0.001, top - maskSize.y/viewport.w) + smoothstep(-0.001, 0.001, bottom - maskSize.y/viewport.w);\n\t\tmaskLevel *= (1. - active);\n\n\t\t// gl_FragColor = vec4(vec3(intensity), 1);\n\t\tvec4 bgColor = texture2D(background, coord);\n\t\tvec4 fillColor = texture2D(fill, vec2(coord.x, max(0., intensity)));\n\t\tgl_FragColor = fillColor * maskLevel + bgColor * (1. - maskLevel);\n\t}\n";


/**
 * Set frequencies taking into account smoothing, logarithmic and grouping params
 */
Spectrum.prototype.setFrequencies = function (frequencies) {
	var this$1 = this;

	if (!frequencies) return this;

	var gl = this.gl;
	var minF = this.minFrequency, maxF = this.maxFrequency;
	var minDb = this.minDecibels, maxDb = this.maxDecibels;
	var halfRate = this.sampleRate * 0.5;
	var l = halfRate / this.frequencies.length;

	//choose bigger data
	var bigger = this.frequencies.length >= frequencies.length ? this.frequencies : frequencies;
	var shorter = bigger === frequencies ? this.frequencies : frequencies;

	var smoothing = bigger === this.frequencies ? this.smoothing : 1 - this.smoothing;


	for (var i = 0; i < bigger.length; i++) {
		bigger[i] = clamp(bigger[i], -200, 0) * smoothing + clamp(shorter[Math.floor(shorter.length * (i / bigger.length))], -200, 0) * (1 - smoothing);
	}

	//save actual frequencies
	this.frequencies = bigger;

	//prepare f’s for rendering
	frequencies = this.frequencies.slice();

	//apply a-weighting
	if (weighting[this.weighting]) {
		var w = weighting[this.weighting];
		frequencies = frequencies.map(function (mag, i, data) { return clamp(mag + 20 * Math.log(w(i * l)) / Math.log(10), -100, 0); });
	}

	//subview freqs - min/max f, log mapping, db limiting
	frequencies = frequencies.map(function (mag, i, frequencies) {
		var ratio = (i + .5) / frequencies.length;

		if (this$1.logarithmic) {
			var frequency = Math.pow(10., lg(minF) + ratio * (lg(maxF) - lg(minF)) );
			ratio = (frequency - minF) / (maxF - minF);
		}

		var leftF = minF / halfRate;
		var rightF = maxF / halfRate;

		ratio = leftF + ratio * (rightF - leftF);

		//apply linear interpolation
		//TODO: implement here another interpolation: hi-f gets lost
		var left = frequencies[Math.floor(ratio * frequencies.length)];
		var right = frequencies[Math.ceil(ratio * frequencies.length)];
		var fract = (ratio * frequencies.length) % 1;
		var value = left * (1 - fract) + right * fract;

		//closest interpolation
		// var value = frequencies[Math.round(ratio * frequencies.length)];

		//snap
		if (this$1.snap) {
			value = Math.round(value * this$1.snap) / this$1.snap;
		}

		//sublimit db to 0..1 range
		return (value - minDb) / (maxDb - minDb);
	}, this);

	return this.setTexture('frequencies', {
		data: frequencies,
		format: gl.ALPHA,
		magFilter: this.gl.NEAREST,
		minFilter: this.gl.NEAREST,
		wrap: this.gl.CLAMP_TO_EDGE
	});
};


/**
 * Reset colormap
 */
Spectrum.prototype.setFill = function (cm, inverse) {
	//named colormap
	var this$1 = this;

	if (typeof cm === 'string') {
		this.fill = (flatten(colormap({
			colormap: cm,
			nshades: 128,
			format: 'rgba',
			alpha: 1
		})).map(function (v,i) { return !((i + 1) % 4) ? v : v/255; }));
	}
	//custom array
	else {
		this.fill = (flatten(cm));
	}

	if (inverse) {
		var reverse = this.fill.slice();
		for (var i = 0; i < this$1.fill.length; i+=4){
			reverse[this$1.fill.length - i - 1] = this$1.fill[i + 3];
			reverse[this$1.fill.length - i - 2] = this$1.fill[i + 2];
			reverse[this$1.fill.length - i - 3] = this$1.fill[i + 1];
			reverse[this$1.fill.length - i - 4] = this$1.fill[i + 0];
		}
		this.fill = reverse;
	}

	this.setTexture('fill', {
		data: this.fill,
		width: 1,
		height: (this.fill.length / 4)|0,
		format: this.gl.RGBA,
		magFilter: this.gl.LINEAR,
		minFilter: this.gl.LINEAR,
		wrap: this.gl.CLAMP_TO_EDGE
	});

	//ensure bg
	if (!this.background) {
		this.setBackground(this.fill.slice(0, 4));
	}

	//set grid color to colormap’s color
	if (this._grid) {
		var gridColor = this.fill.slice(-4).map(function (v) { return v*255; });
		this._grid.linesContainer.style.color = "rgba(" + gridColor + ")";
	}

	return this;
};


/** Set background */
Spectrum.prototype.setBackground = function (bg) {
	this.setTexture('background', {
		data: bg || this.fill.slice(0, 4),
		format: this.gl.RGBA,
		magFilter: this.gl.LINEAR,
		minFilter: this.gl.LINEAR,
		wrap: this.gl.CLAMP_TO_EDGE
	});

	return this;
};

/**
 * Set named or array mask
 */
Spectrum.prototype.setMask = function (mask) {
	this.mask = mask || [1,1,1,1]

	this.setTexture('mask', {
		data: this.mask,
		type: this.gl.FLOAT,
		format: this.gl.LUMINOCITY,
		wrap: this.gl.CLAMP_TO_EDGE
	});

	this.gl.uniform2f(this.maskSizeLocation, this.textures.mask.width, this.textures.mask.height);

	return this;
};


/**
 * Update uniforms values, textures etc.
 * It should be called when the settings changed.
 */
Spectrum.prototype.update = function () {
	var this$1 = this;

	var gl = this.gl;

	//create grid, if not created yet
	if (this.grid) {
		if (!this._grid) {
			this._grid = createGrid({
				container: this.container,
				viewport: this.viewport,
				lines: Array.isArray(this.grid.lines) ? this.grid.lines : (this.grid.lines === undefined || this.grid.lines === true) && [{
					min: this.minFrequency,
					max: this.maxFrequency,
					orientation: 'x',
					logarithmic: this.logarithmic,
					titles: function (value) {
						return (value >= 1000 ? ((value / 1000).toLocaleString() + 'k') : value.toLocaleString()) + 'Hz';
					}
				}, {
					min: this.minDecibels,
					max: this.maxDecibels,
					orientation: 'y',
					titles: function (value) {
						return value.toLocaleString() + 'dB';
					}
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
					titles: null,
					style: {
						borderLeftStyle: 'solid',
						pointerEvents: 'none',
						opacity: '0.08'
					}
				} : null],
				axes: Array.isArray(this.grid.axes) ? this.grid.axes : (this.grid.axes || this.axes) && [{
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

			this.on('resize', function () { return this$1._grid.update({
				viewport: this$1.viewport
			}); });
		} else {
			this._grid.grid.style.display = 'block';
		}
	}
	else if (this._grid) {
		this._grid.grid.style.display = 'none';
	}

	//update textures
	this.setFrequencies(this.frequencies);
	this.setFill(this.fill);
	this.setMask(this.mask);
	this.setBackground(this.background);

	this.gl.uniform1f(this.alignLocation, this.align);

	return this;
};


/**
 * Render main loop
 */
Spectrum.prototype.render = function () {
	var this$1 = this;

	Component.prototype.render.call(this);

	if (this.is2d) {
		//TODO: 2d rendering?
		var context = this.context;
		var fill = this.fill;

		context.fillStyle = 'rgba(' + fill.slice(0,4).join(',') + ')';
		context.fillRect.apply(context, this.viewport);

		//calculate per-bar averages
		var bars = [];
		for (var i = 0; i < this$1.frequencies.length; i++) {

		}
	}

	return this;
};

},{"a-weighting":16,"colormap":28,"flatten":36,"gl-component":40,"inherits":43,"is-browser":45,"mumath/clamp":48,"mumath/lg":50,"plot-grid":57,"xtend/mutable":75}],12:[function(require,module,exports){
module.exports = function a (f) {
	var f2 = f*f;
	return 1.2588966 * 148840000 * f2*f2 /
	((f2 + 424.36) * Math.sqrt((f2 + 11599.29) * (f2 + 544496.41)) * (f2 + 148840000));
};

},{}],13:[function(require,module,exports){
module.exports = function b (f) {
	var f2 = f*f;
	return 1.019764760044717 * 148840000 * f*f2 /
	((f2 + 424.36) * Math.sqrt(f2 + 25122.25) * (f2 + 148840000));
};

},{}],14:[function(require,module,exports){
module.exports = function c (f) {
	var f2 = f*f;
	return 1.0069316688518042 * 148840000 * f2 /
	((f2 + 424.36) * (f2 + 148840000));
};

},{}],15:[function(require,module,exports){
module.exports = function d (f) {
	var f2 = f*f;
	return (f / 6.8966888496476e-5) * Math.sqrt(
		(
			((1037918.48 - f2)*(1037918.48 - f2) + 1080768.16*f2) /
			((9837328 - f2)*(9837328 - f2) + 11723776*f2)
		) /	((f2 + 79919.29) * (f2 + 1345600))
	);
};

},{}],16:[function(require,module,exports){
/**
 * @module  noise-weighting
 */

module.exports = {
	a: require('./a'),
	b: require('./b'),
	c: require('./c'),
	d: require('./d'),
	itu: require('./itu'),
	z: require('./z')
};
},{"./a":12,"./b":13,"./c":14,"./d":15,"./itu":17,"./z":18}],17:[function(require,module,exports){
module.exports = function itu (f) {
	var f2 = f*f;

	var h1 = -4.737338981378384e-24*f2*f2*f2 + 2.043828333606125e-15*f2*f2 - 1.363894795463638e-7*f2 + 1;
	var h2 = 1.306612257412824e-19*f2*f2*f - 2.118150887518656e-11*f2*f + 5.559488023498642e-4*f;

	return 8.128305161640991 * 1.246332637532143e-4 * f / Math.sqrt(h1*h1 + h2*h2);
};

},{}],18:[function(require,module,exports){
module.exports = function (f) {
	return 1;
};

},{}],19:[function(require,module,exports){
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
},{"_process":7}],20:[function(require,module,exports){
'use strict';
module.exports = function () {
	return /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
};

},{}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
'use strict';

var arraytools  = function () {

  var that = {};

  var RGB_REGEX =  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,.*)?\)$/;
  var RGB_GROUP_REGEX = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,?\s*(.*)?\)$/;

  function isPlainObject (v) {
    return !Array.isArray(v) && v !== null && typeof v === 'object';
  }

  function linspace (start, end, num) {
    var inc = (end - start) / Math.max(num - 1, 1);
    var a = [];
    for( var ii = 0; ii < num; ii++)
      a.push(start + ii*inc);
    return a;
  }

  function zip () {
      var arrays = [].slice.call(arguments);
      var lengths = arrays.map(function (a) {return a.length;});
      var len = Math.min.apply(null, lengths);
      var zipped = [];
      for (var i = 0; i < len; i++) {
          zipped[i] = [];
          for (var j = 0; j < arrays.length; ++j) {
              zipped[i][j] = arrays[j][i];
          }
      }
      return zipped;
  }

  function zip3 (a, b, c) {
      var len = Math.min.apply(null, [a.length, b.length, c.length]);
      var result = [];
      for (var n = 0; n < len; n++) {
          result.push([a[n], b[n], c[n]]);
      }
      return result;
  }

  function sum (A) {
    var acc = 0;
    accumulate(A, acc);
    function accumulate(x) {
      for (var i = 0; i < x.length; i++) {
        if (Array.isArray(x[i]))
          accumulate(x[i], acc);
        else
          acc += x[i];
      }
    }
    return acc;
  }

  function copy2D (arr) {
    var carr = [];
    for (var i = 0; i < arr.length; ++i) {
      carr[i] = [];
      for (var j = 0; j < arr[i].length; ++j) {
        carr[i][j] = arr[i][j];
      }
    }

    return carr;
  }


  function copy1D (arr) {
    var carr = [];
    for (var i = 0; i < arr.length; ++i) {
      carr[i] = arr[i];
    }

    return carr;
  }


  function isEqual(arr1, arr2) {
    if(arr1.length !== arr2.length)
      return false;
    for(var i = arr1.length; i--;) {
      if(arr1[i] !== arr2[i])
        return false;
    }

    return true;
  }


  function str2RgbArray(str, twoFiftySix) {
    // convert hex or rbg strings to 0->1 or 0->255 rgb array
    var rgb,
        match;

    if (typeof str !== 'string') return str;

    rgb = [];
    // hex notation
    if (str[0] === '#') {
      str = str.substr(1) // remove hash
      if (str.length === 3) str += str // fff -> ffffff
      match = parseInt(str, 16);
      rgb[0] = ((match >> 16) & 255);
      rgb[1] = ((match >> 8) & 255);
      rgb[2] = (match & 255);
    }

    // rgb(34, 34, 127) or rgba(34, 34, 127, 0.1) notation
    else if (RGB_REGEX.test(str)) {
      match = str.match(RGB_GROUP_REGEX);
      rgb[0] = parseInt(match[1]);
      rgb[1] = parseInt(match[2]);
      rgb[2] = parseInt(match[3]);
    }

    if (!twoFiftySix) {
      for (var j=0; j<3; ++j) rgb[j] = rgb[j]/255
    }


    return rgb;
  }


  function str2RgbaArray(str, twoFiftySix) {
    // convert hex or rbg strings to 0->1 or 0->255 rgb array
    var rgb,
        match;

    if (typeof str !== 'string') return str;

    rgb = [];
    // hex notation
    if (str[0] === '#') {
      str = str.substr(1) // remove hash
      if (str.length === 3) str += str // fff -> ffffff
      match = parseInt(str, 16);
      rgb[0] = ((match >> 16) & 255);
      rgb[1] = ((match >> 8) & 255);
      rgb[2] = (match & 255);
    }

    // rgb(34, 34, 127) or rgba(34, 34, 127, 0.1) notation
    else if (RGB_REGEX.test(str)) {
      match = str.match(RGB_GROUP_REGEX);
      rgb[0] = parseInt(match[1]);
      rgb[1] = parseInt(match[2]);
      rgb[2] = parseInt(match[3]);
      if (match[4]) rgb[3] = parseFloat(match[4]);
      else rgb[3] = 1.0;
    }



    if (!twoFiftySix) {
      for (var j=0; j<3; ++j) rgb[j] = rgb[j]/255
    }


    return rgb;
  }





  that.isPlainObject = isPlainObject;
  that.linspace = linspace;
  that.zip3 = zip3;
  that.sum = sum;
  that.zip = zip;
  that.isEqual = isEqual;
  that.copy2D = copy2D;
  that.copy1D = copy1D;
  that.str2RgbArray = str2RgbArray;
  that.str2RgbaArray = str2RgbaArray;

  return that

}


module.exports = arraytools();

},{}],23:[function(require,module,exports){
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

},{"element-size":33}],24:[function(require,module,exports){
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
},{"_process":7,"ansi-styles":21,"escape-string-regexp":34,"has-ansi":42,"strip-ansi":67,"supports-color":68}],25:[function(require,module,exports){
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
},{"_process":7,"restore-cursor":60}],26:[function(require,module,exports){
(function (Buffer){
var clone = (function() {
'use strict';

/**
 * Clones (copies) an Object using deep copying.
 *
 * This function supports circular references by default, but if you are certain
 * there are no circular references in your object, you can save some CPU time
 * by calling clone(obj, false).
 *
 * Caution: if `circular` is false and `parent` contains circular references,
 * your program may enter an infinite loop and crash.
 *
 * @param `parent` - the object to be cloned
 * @param `circular` - set to true if the object to be cloned may contain
 *    circular references. (optional - true by default)
 * @param `depth` - set to a number if the object is only to be cloned to
 *    a particular depth. (optional - defaults to Infinity)
 * @param `prototype` - sets the prototype to be used when cloning an object.
 *    (optional - defaults to parent prototype).
*/
function clone(parent, circular, depth, prototype) {
  var filter;
  if (typeof circular === 'object') {
    depth = circular.depth;
    prototype = circular.prototype;
    filter = circular.filter;
    circular = circular.circular
  }
  // maintain two arrays for circular references, where corresponding parents
  // and children have the same index
  var allParents = [];
  var allChildren = [];

  var useBuffer = typeof Buffer != 'undefined';

  if (typeof circular == 'undefined')
    circular = true;

  if (typeof depth == 'undefined')
    depth = Infinity;

  // recurse this function so we don't reset allParents and allChildren
  function _clone(parent, depth) {
    // cloning null always returns null
    if (parent === null)
      return null;

    if (depth == 0)
      return parent;

    var child;
    var proto;
    if (typeof parent != 'object') {
      return parent;
    }

    if (clone.__isArray(parent)) {
      child = [];
    } else if (clone.__isRegExp(parent)) {
      child = new RegExp(parent.source, __getRegExpFlags(parent));
      if (parent.lastIndex) child.lastIndex = parent.lastIndex;
    } else if (clone.__isDate(parent)) {
      child = new Date(parent.getTime());
    } else if (useBuffer && Buffer.isBuffer(parent)) {
      child = new Buffer(parent.length);
      parent.copy(child);
      return child;
    } else {
      if (typeof prototype == 'undefined') {
        proto = Object.getPrototypeOf(parent);
        child = Object.create(proto);
      }
      else {
        child = Object.create(prototype);
        proto = prototype;
      }
    }

    if (circular) {
      var index = allParents.indexOf(parent);

      if (index != -1) {
        return allChildren[index];
      }
      allParents.push(parent);
      allChildren.push(child);
    }

    for (var i in parent) {
      var attrs;
      if (proto) {
        attrs = Object.getOwnPropertyDescriptor(proto, i);
      }

      if (attrs && attrs.set == null) {
        continue;
      }
      child[i] = _clone(parent[i], depth - 1);
    }

    return child;
  }

  return _clone(parent, depth);
}

/**
 * Simple flat clone using prototype, accepts only objects, usefull for property
 * override on FLAT configuration object (no nested props).
 *
 * USE WITH CAUTION! This may not behave as you wish if you do not know how this
 * works.
 */
clone.clonePrototype = function clonePrototype(parent) {
  if (parent === null)
    return null;

  var c = function () {};
  c.prototype = parent;
  return new c();
};

// private utility functions

function __objToStr(o) {
  return Object.prototype.toString.call(o);
};
clone.__objToStr = __objToStr;

function __isDate(o) {
  return typeof o === 'object' && __objToStr(o) === '[object Date]';
};
clone.__isDate = __isDate;

function __isArray(o) {
  return typeof o === 'object' && __objToStr(o) === '[object Array]';
};
clone.__isArray = __isArray;

function __isRegExp(o) {
  return typeof o === 'object' && __objToStr(o) === '[object RegExp]';
};
clone.__isRegExp = __isRegExp;

function __getRegExpFlags(re) {
  var flags = '';
  if (re.global) flags += 'g';
  if (re.ignoreCase) flags += 'i';
  if (re.multiline) flags += 'm';
  return flags;
};
clone.__getRegExpFlags = __getRegExpFlags;

return clone;
})();

if (typeof module === 'object' && module.exports) {
  module.exports = clone;
}

}).call(this,require("buffer").Buffer)
},{"buffer":3}],27:[function(require,module,exports){
module.exports={"jet":[{"index":0,"rgb":[0,0,131]},{"index":0.125,"rgb":[0,60,170]},{"index":0.375,"rgb":[5,255,255]},{"index":0.625,"rgb":[255,255,0]},{"index":0.875,"rgb":[250,0,0]},{"index":1,"rgb":[128,0,0]}],"hsv":[{"index":0,"rgb":[255,0,0]},{"index":0.169,"rgb":[253,255,2]},{"index":0.173,"rgb":[247,255,2]},{"index":0.337,"rgb":[0,252,4]},{"index":0.341,"rgb":[0,252,10]},{"index":0.506,"rgb":[1,249,255]},{"index":0.671,"rgb":[2,0,253]},{"index":0.675,"rgb":[8,0,253]},{"index":0.839,"rgb":[255,0,251]},{"index":0.843,"rgb":[255,0,245]},{"index":1,"rgb":[255,0,6]}],"hot":[{"index":0,"rgb":[0,0,0]},{"index":0.3,"rgb":[230,0,0]},{"index":0.6,"rgb":[255,210,0]},{"index":1,"rgb":[255,255,255]}],"cool":[{"index":0,"rgb":[0,255,255]},{"index":1,"rgb":[255,0,255]}],"spring":[{"index":0,"rgb":[255,0,255]},{"index":1,"rgb":[255,255,0]}],"summer":[{"index":0,"rgb":[0,128,102]},{"index":1,"rgb":[255,255,102]}],"autumn":[{"index":0,"rgb":[255,0,0]},{"index":1,"rgb":[255,255,0]}],"winter":[{"index":0,"rgb":[0,0,255]},{"index":1,"rgb":[0,255,128]}],"bone":[{"index":0,"rgb":[0,0,0]},{"index":0.376,"rgb":[84,84,116]},{"index":0.753,"rgb":[169,200,200]},{"index":1,"rgb":[255,255,255]}],"copper":[{"index":0,"rgb":[0,0,0]},{"index":0.804,"rgb":[255,160,102]},{"index":1,"rgb":[255,199,127]}],"greys":[{"index":0,"rgb":[0,0,0]},{"index":1,"rgb":[255,255,255]}],"yignbu":[{"index":0,"rgb":[8,29,88]},{"index":0.125,"rgb":[37,52,148]},{"index":0.25,"rgb":[34,94,168]},{"index":0.375,"rgb":[29,145,192]},{"index":0.5,"rgb":[65,182,196]},{"index":0.625,"rgb":[127,205,187]},{"index":0.75,"rgb":[199,233,180]},{"index":0.875,"rgb":[237,248,217]},{"index":1,"rgb":[255,255,217]}],"greens":[{"index":0,"rgb":[0,68,27]},{"index":0.125,"rgb":[0,109,44]},{"index":0.25,"rgb":[35,139,69]},{"index":0.375,"rgb":[65,171,93]},{"index":0.5,"rgb":[116,196,118]},{"index":0.625,"rgb":[161,217,155]},{"index":0.75,"rgb":[199,233,192]},{"index":0.875,"rgb":[229,245,224]},{"index":1,"rgb":[247,252,245]}],"yiorrd":[{"index":0,"rgb":[128,0,38]},{"index":0.125,"rgb":[189,0,38]},{"index":0.25,"rgb":[227,26,28]},{"index":0.375,"rgb":[252,78,42]},{"index":0.5,"rgb":[253,141,60]},{"index":0.625,"rgb":[254,178,76]},{"index":0.75,"rgb":[254,217,118]},{"index":0.875,"rgb":[255,237,160]},{"index":1,"rgb":[255,255,204]}],"bluered":[{"index":0,"rgb":[0,0,255]},{"index":1,"rgb":[255,0,0]}],"rdbu":[{"index":0,"rgb":[5,10,172]},{"index":0.35,"rgb":[106,137,247]},{"index":0.5,"rgb":[190,190,190]},{"index":0.6,"rgb":[220,170,132]},{"index":0.7,"rgb":[230,145,90]},{"index":1,"rgb":[178,10,28]}],"picnic":[{"index":0,"rgb":[0,0,255]},{"index":0.1,"rgb":[51,153,255]},{"index":0.2,"rgb":[102,204,255]},{"index":0.3,"rgb":[153,204,255]},{"index":0.4,"rgb":[204,204,255]},{"index":0.5,"rgb":[255,255,255]},{"index":0.6,"rgb":[255,204,255]},{"index":0.7,"rgb":[255,153,255]},{"index":0.8,"rgb":[255,102,204]},{"index":0.9,"rgb":[255,102,102]},{"index":1,"rgb":[255,0,0]}],"rainbow":[{"index":0,"rgb":[150,0,90]},{"index":0.125,"rgb":[0,0,200]},{"index":0.25,"rgb":[0,25,255]},{"index":0.375,"rgb":[0,152,255]},{"index":0.5,"rgb":[44,255,150]},{"index":0.625,"rgb":[151,255,0]},{"index":0.75,"rgb":[255,234,0]},{"index":0.875,"rgb":[255,111,0]},{"index":1,"rgb":[255,0,0]}],"portland":[{"index":0,"rgb":[12,51,131]},{"index":0.25,"rgb":[10,136,186]},{"index":0.5,"rgb":[242,211,56]},{"index":0.75,"rgb":[242,143,56]},{"index":1,"rgb":[217,30,30]}],"blackbody":[{"index":0,"rgb":[0,0,0]},{"index":0.2,"rgb":[230,0,0]},{"index":0.4,"rgb":[230,210,0]},{"index":0.7,"rgb":[255,255,255]},{"index":1,"rgb":[160,200,255]}],"earth":[{"index":0,"rgb":[0,0,130]},{"index":0.1,"rgb":[0,180,180]},{"index":0.2,"rgb":[40,210,40]},{"index":0.4,"rgb":[230,230,50]},{"index":0.6,"rgb":[120,70,20]},{"index":1,"rgb":[255,255,255]}],"electric":[{"index":0,"rgb":[0,0,0]},{"index":0.15,"rgb":[30,0,100]},{"index":0.4,"rgb":[120,0,100]},{"index":0.6,"rgb":[160,90,0]},{"index":0.8,"rgb":[230,200,0]},{"index":1,"rgb":[255,250,220]}], "alpha": [{"index":0, "rgb": [255,255,255,0]},{"index":0, "rgb": [255,255,255,1]}]};

},{}],28:[function(require,module,exports){
/*
 * Ben Postlethwaite
 * January 2013
 * License MIT
 */
'use strict';

var at = require('arraytools');
var clone = require('clone');
var colorScale = require('./colorScales');

module.exports = function (spec) {

    /*
     * Default Options
     */
    var indicies, rgba, fromrgba, torgba,
        nsteps, cmap, colormap, format,
        nshades, colors, alpha, index, i,
        r = [],
        g = [],
        b = [],
        a = [];

    if ( !at.isPlainObject(spec) ) spec = {};

    nshades = spec.nshades || 72;
    format = spec.format || 'hex';

    colormap = spec.colormap;
    if (!colormap) colormap = 'jet';

    if (typeof colormap === 'string') {
        colormap = colormap.toLowerCase();

        if (!colorScale[colormap]) {
            throw Error(colormap + ' not a supported colorscale');
        }

        cmap = clone(colorScale[colormap]);

    } else if (Array.isArray(colormap)) {
        cmap = clone(colormap);

    } else {
        throw Error('unsupported colormap option', colormap);
    }

    if (cmap.length > nshades) {
        throw new Error(
            colormap+' map requires nshades to be at least size '+cmap.length
        );
    }

    if (!Array.isArray(spec.alpha)) {

        if (typeof spec.alpha === 'number') {
            alpha = [spec.alpha, spec.alpha];

        } else {
            alpha = [1, 1];
        }

    } else if (spec.alpha.length !== 2) {
        alpha = [1, 1];

    } else {
        alpha = clone(spec.alpha);
    }

    /*
     * map index points from 0->1 to 0 -> n-1
     */
    indicies = cmap.map(function(c) {
        return Math.round(c.index * nshades);
    });

    /*
     * Add alpha channel to the map
     */
    if (alpha[0] < 0) alpha[0] = 0;
    if (alpha[1] < 0) alpha[0] = 0;
    if (alpha[0] > 1) alpha[0] = 1;
    if (alpha[1] > 1) alpha[0] = 1;

    for (i = 0; i < indicies.length; ++i) {
        index = cmap[i].index;
        rgba = cmap[i].rgb;

        // if user supplies their own map use it
        if (rgba.length === 4 && rgba[3] >= 0 && rgba[3] <= 1) continue;
        rgba[3] = alpha[0] + (alpha[1] - alpha[0])*index;
    }

    /*
     * map increasing linear values between indicies to
     * linear steps in colorvalues
     */
    for (i = 0; i < indicies.length-1; ++i) {
        nsteps = indicies[i+1] - indicies[i];
        fromrgba = cmap[i].rgb;
        torgba = cmap[i+1].rgb;
        r = r.concat(at.linspace(fromrgba[0], torgba[0], nsteps ) );
        g = g.concat(at.linspace(fromrgba[1], torgba[1], nsteps ) );
        b = b.concat(at.linspace(fromrgba[2], torgba[2], nsteps ) );
        a = a.concat(at.linspace(fromrgba[3], torgba[3], nsteps ) );
    }

    r = r.map( Math.round );
    g = g.map( Math.round );
    b = b.map( Math.round );

    colors = at.zip(r, g, b, a);

    if (format === 'hex') colors = colors.map( rgb2hex );
    if (format === 'rgbaString') colors = colors.map( rgbaStr );

    return colors;
};


function rgb2hex (rgba) {
    var dig, hex = '#';
    for (var i = 0; i < 3; ++i) {
        dig = rgba[i];
        dig = dig.toString(16);
        hex += ('00' + dig).substr( dig.length );
    }
    return hex;
}

function rgbaStr (rgba) {
    return 'rgba(' + rgba.join(',') + ')';
}

},{"./colorScales":27,"arraytools":22,"clone":26}],29:[function(require,module,exports){
module.exports = function gainToDecibels(value) {
  if (value == null) return 0
  return Math.round(Math.round(20 * (0.43429 * Math.log(value)) * 100) / 100 * 10) / 10
}
},{}],30:[function(require,module,exports){
module.exports = {
  fromGain: require('./from-gain'),
  toGain: require('./to-gain')
}
},{"./from-gain":29,"./to-gain":31}],31:[function(require,module,exports){
module.exports = function decibelsToGain(value){
  if (value <= -40){
    return 0
  }
  return Math.round(Math.exp(value / 8.6858) * 10000) / 10000
}
},{}],32:[function(require,module,exports){
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
},{"_process":7}],33:[function(require,module,exports){
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

},{}],34:[function(require,module,exports){
'use strict';

var matchOperatorsRe = /[|\\{}()[\]^$+*?.]/g;

module.exports = function (str) {
	if (typeof str !== 'string') {
		throw new TypeError('Expected a string');
	}

	return str.replace(matchOperatorsRe, '\\$&');
};

},{}],35:[function(require,module,exports){
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
},{"_process":7}],36:[function(require,module,exports){
module.exports = function flatten(list, depth) {
  depth = (typeof depth == 'number') ? depth : Infinity;

  if (!depth) {
    if (Array.isArray(list)) {
      return list.map(function(i) { return i; });
    }
    return list;
  }

  return _flatten(list, 1);

  function _flatten(list, d) {
    return list.reduce(function (acc, item) {
      if (Array.isArray(item) && d < depth) {
        return acc.concat(_flatten(item, d + 1));
      }
      else {
        return acc.concat(item);
      }
    }, []);
  }
};

},{}],37:[function(require,module,exports){
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
},{}],38:[function(require,module,exports){
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

},{}],39:[function(require,module,exports){
/** generate unique id for selector */
var counter = Date.now() % 1e9;

module.exports = function getUid(){
	return (Math.random() * 1e9 >>> 0) + (counter++);
};
},{}],40:[function(require,module,exports){
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
var isPlainObject = require('mutype/is-object');

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

	//preserve initial viewport argument
	this._viewport = this.viewport;

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

	var gl = this.gl = this.context;

	//cache of textures
	this.textures = {};

	//setup webgl context
	if (!this.is2d) {
		if (this.float) {
			var float = gl.getExtension('OES_texture_float');
			if (!float) throw Error('WebGL does not support floats.');
			var floatLinear = gl.getExtension('OES_texture_float_linear');
			if (!floatLinear) throw Error('WebGL does not support floats.');
		}

		this.program = this.createProgram(this.vert, this.frag);

		//FIXME: ensure that buffer spot does not interfere with other occupied spots
		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,4,4,-1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.bindAttribLocation(this.program, 0, 'position');

		gl.linkProgram(this.program);

		//stub textures with empty data (to avoid errors)
		var numUniforms = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
		for(var i=0; i<numUniforms; ++i) {
			var info = gl.getActiveUniform(this$1.program, i);
			if (info && info.type === gl.SAMPLER_2D) {
				this$1.setTexture(info.name, null);
			}
		}
	}

	//set canvas fit container size
	if (isBrowser) {
		this.fit = fit(this.canvas, this.container);
		this.resize = this.resize.bind(this);

		this.resize();
		window.addEventListener('resize', this.resize, false);
	}


	//create raf loop
	this.engine = loop(function (dt) { return this$1.render(); }).start();
}


inherits(Component, Emitter);


/**
 * Create and use webgl or 2d context
 */
Component.prototype.context = 'webgl';


Component.prototype.vert = "\n\tattribute vec2 position;\n\tvoid main () {\n\t\tgl_Position = vec4(position, 0, 1);\n\t}\n";


Component.prototype.frag = "\n\tprecision mediump float;\n\tuniform vec4 viewport;\n\tvoid main () {\n\t\tgl_FragColor = vec4(gl_FragCoord.xy / viewport.zw, 1, 1);\n\t}\n";


//enable floating-point textures
Component.prototype.float = true;

//Increased each time new texture added
Component.prototype.texturesCount = 0;


/**
 * Set texture
 */
Component.prototype.setTexture = function (a, b) {
	if (this.is2d) return this;

	if (arguments.length === 2) {
		var opts = {};
		opts[a] = b;
	}
	else {
		var opts = a || {};
	}

	var gl = this.context;

	gl.useProgram(this.program);

	for (var name in opts) {
		var obj = this.textures[name];

		//check if passed some data/image-like object for the texture or settings object
		var opt = isPlainObject(opts[name]) ? opts[name] : {data: opts[name]};

		//if no object - create and bind texture
		if (!obj) {
			obj = this.textures[name] = {name: name};
		}

		if (!obj.texture) {
			obj.texture = gl.createTexture();
		}

		if (!obj.location) {
			obj.location = gl.getUniformLocation(this.program, name);
		}

		if (obj.unit == null || opt.unit != null) {
			obj.unit = opt.unit != null ? opt.unit : this.texturesCount++;
			this.texturesCount = Math.max(this.texturesCount, obj.unit);
			gl.activeTexture(gl.TEXTURE0 + obj.unit);
			gl.bindTexture(gl.TEXTURE_2D, obj.texture);
			gl.uniform1i(obj.location, obj.unit);
		}
		else {
			gl.activeTexture(gl.TEXTURE0 + obj.unit);
		}

		if (!obj.wrapS || opt.wrapS || opt.wrap) {
			obj.wrapS = opt.wrap && opt.wrap[0] || opt.wrapS || opt.wrap || gl.REPEAT;
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, obj.wrapS);
		}
		if (!obj.wrapT || opt.wrapT || opt.wrap) {
			obj.wrapT = opt.wrap && opt.wrap[1] || opt.wrapT || opt.wrap || gl.REPEAT;
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, obj.wrapT);
		}

		if (!obj.minFilter || opt.minFilter) {
			obj.minFilter = opt.minFilter || gl.NEAREST;
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, obj.minFilter);
		}

		if (!obj.magFilter || opt.magFilter) {
			obj.magFilter = opt.magFilter || gl.NEAREST;
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, obj.magFilter);
		}

		if (!obj.type || opt.type) {
			obj.type = opt.type || obj.type || (this.float ? gl.FLOAT : gl.UNSIGNED_BYTE);
		}

		if (!obj.format || opt.format) {
			obj.format = opt.format || obj.format || gl.RGBA;
		}

		var data = opt.data || [0, 0, 0, 1];

		//handle raw data case
		if (Array.isArray(data) || ArrayBuffer.isView(data)) {
			if (opt && opt.shape) {
				obj.width = opt.shape[0];
				obj.height = opt.shape[1];
			}
			else {
				obj.width = opt.width || data.width || (obj.format === gl.ALPHA ? data.length : Math.max(data.length / 4, 1));
				obj.height = opt.height || data.height || 1;
			}

			obj.data = new Float32Array(data);

			gl.texImage2D(gl.TEXTURE_2D, 0, obj.format, obj.width, obj.height, 0, obj.format, obj.type, obj.data);
		} else {
			obj.width = data.width;
			obj.height = data.height;
			obj.data = data;

			gl.texImage2D(gl.TEXTURE_2D, 0, obj.format, obj.format, obj.type, obj.data);
		}
	}

	return this;
};


/**
 * Do resize routine
 */
Component.prototype.resize = function () {
	var gl = this.context;

	this.fit();

	var w = this.canvas.width, h = this.canvas.height;

	//if vp is undefined - set it as full-height
	if (!this._viewport) {
		this.viewport = [0, 0, w, h];
	}
	else if (this._viewport instanceof Function) {
		this.viewport = this._viewport(w, h);
	}
	else {
		this.viewport = this._viewport;
	}

	if (!this.is2d) {
		gl.useProgram(this.program);

		var viewportLocation = gl.getUniformLocation(this.program, 'viewport');

		//this trickery inverts viewport Y
		var top = h-(this.viewport[3]+this.viewport[1]);
		var vp = [this.viewport[0], top, this.viewport[2], this.viewport[3] + Math.min(top, 0)];

		gl.viewport(vp[0], vp[1], vp[2], vp[3]);
		gl.uniform4fv(viewportLocation, vp);
	}

	this.emit('resize');

	return this;
};


/**
 * Stop rendering loop
 */
Component.prototype.stop = function () {
	this.engine.stop();
	return this;
};


/**
 * Render main loop
 */
Component.prototype.render = function () {
	var gl = this.context;

	this.emit('render');

	if (!this.is2d) {
		gl.useProgram(this.program);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	return this;
};


//create program (2 shaders)
Component.prototype.createProgram = function (vSrc, fSrc) {
	if (this.is2d) return null;

	var gl = this.gl;

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

},{"canvas-fit":23,"events":5,"get-canvas-context":38,"inherits":43,"is-browser":45,"mutype/is-object":54,"raf-loop":58,"xtend/mutable":75}],41:[function(require,module,exports){
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

},{}],42:[function(require,module,exports){
'use strict';
var ansiRegex = require('ansi-regex');
var re = new RegExp(ansiRegex().source); // remove the `g` flag
module.exports = re.test.bind(re);

},{"ansi-regex":20}],43:[function(require,module,exports){
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

},{}],44:[function(require,module,exports){
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

},{}],45:[function(require,module,exports){
module.exports = true;
},{}],46:[function(require,module,exports){
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
},{"_process":7,"ansi-escapes":19,"cli-cursor":25}],47:[function(require,module,exports){

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

},{}],48:[function(require,module,exports){
/**
 * Clamp value.
 * Detects proper clamp min/max.
 *
 * @param {number} a Current value to cut off
 * @param {number} min One side limit
 * @param {number} max Other side limit
 *
 * @return {number} Clamped value
 */

module.exports = require('./wrap')(function(a, min, max){
	return max > min ? Math.max(Math.min(a,max),min) : Math.max(Math.min(a,min),max);
});
},{"./wrap":53}],49:[function(require,module,exports){
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
},{}],50:[function(require,module,exports){
/**
 * Base 10 logarithm
 *
 * @module mumath/lg
 */
module.exports = require('./wrap')(function (a) {
	return Math.log(a) / Math.log(10);
});
},{"./wrap":53}],51:[function(require,module,exports){
/**
 * @module mumath/order
 */
module.exports = require('./wrap')(function (n) {
	n = Math.abs(n);
	var order = Math.floor(Math.log(n) / Math.LN10 + 0.000000001);
	return Math.pow(10,order);
});
},{"./wrap":53}],52:[function(require,module,exports){
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
},{"./wrap":53}],53:[function(require,module,exports){
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
},{}],54:[function(require,module,exports){
/**
 * @module mutype/is-object
 */

//TODO: add st8 tests

//isPlainObject indeed
module.exports = function(o){
	// return obj === Object(obj);
	return !!o && typeof o === 'object' && o.constructor === Object;
};

},{}],55:[function(require,module,exports){
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

},{}],56:[function(require,module,exports){
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
},{"_process":7}],57:[function(require,module,exports){
/**
 * @module  plot-grid
 */

var extend = require('xtend');
var isBrowser = require('is-browser');
var lg = require('mumath/lg');
var Emitter = require('events').EventEmitter;
var inherits = require('inherits');
var sf = 0;
var className = ((require('insert-css')("._8bdd9f94 {\r\n\tposition: relative;\r\n}\r\n\r\n._8bdd9f94 .grid {\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\tbottom: 0;\r\n\tright: 0;\r\n\tfont-family: sans-serif;\r\n}\r\n\r\n._8bdd9f94 .grid-lines {\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\tbottom: 0;\r\n\tright: 0;\r\n\toverflow: hidden;\r\n}\r\n\r\n._8bdd9f94 .grid-line {\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\twidth: .5rem;\r\n\theight: .5rem;\r\n\topacity: .135;\r\n}\r\n._8bdd9f94 .grid-line[hidden] {\r\n\tdisplay: none;\r\n}\r\n._8bdd9f94 .grid-line:hover {\r\n\topacity: .27;\r\n}\r\n\r\n._8bdd9f94 .grid-line-x {\r\n\theight: 100%;\r\n\twidth: 0;\r\n\tborder-left: 1px dotted;\r\n\tmargin-left: -1px;\r\n}\r\n._8bdd9f94 .grid-line-x:after {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\twidth: .5rem;\r\n\ttop: 0;\r\n\tbottom: 0;\r\n\tleft: -.25rem;\r\n}\r\n._8bdd9f94 .grid-line-x.grid-line-min {\r\n\tmargin-left: 0px;\r\n}\r\n\r\n._8bdd9f94 .grid-line-y {\r\n\twidth: 100%;\r\n\theight: 0;\r\n\tmargin-top: -1px;\r\n\tborder-top: 1px dotted;\r\n}\r\n._8bdd9f94 .grid-line-y:after {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\theight: .5rem;\r\n\tleft: 0;\r\n\tright: 0;\r\n\ttop: -.25rem;\r\n}\r\n._8bdd9f94 .grid-line-y.grid-line-max {\r\n\tmargin-top: 0px;\r\n}\r\n\r\n._8bdd9f94 .grid-axis {\r\n\tposition: absolute;\r\n}\r\n._8bdd9f94 .grid-axis-x {\r\n\ttop: auto;\r\n\tbottom: 0;\r\n\tright: 0;\r\n\tleft: 0;\r\n\tborder-bottom: 2px solid;\r\n\tmargin-bottom: -.5rem;\r\n}\r\n._8bdd9f94 .grid-axis-y {\r\n\tborder-left: 2px solid;\r\n\tright: auto;\r\n\ttop: 0;\r\n\tbottom: 0;\r\n\tleft: -1px;\r\n    margin-left: -.5rem;\r\n}\r\n\r\n._8bdd9f94 .grid-label {\r\n\tposition: absolute;\r\n\ttop: auto;\r\n\tleft: auto;\r\n\tmin-height: 1rem;\r\n\tfont-size: .8rem;\r\n}\r\n._8bdd9f94 .grid-label-x {\r\n\tbottom: auto;\r\n\ttop: 100%;\r\n\tmargin-top: 1.5rem;\r\n\twidth: 2rem;\r\n\tmargin-left: -1rem;\r\n\ttext-align: center;\r\n}\r\n._8bdd9f94 .grid-label-x:before {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\theight: .5rem;\r\n\twidth: 0;\r\n\tborder-left: 2px solid;\r\n\ttop: -1rem;\r\n\tmargin-left: -1px;\r\n\tmargin-top: -2px;\r\n\tleft: 1rem;\r\n}\r\n\r\n._8bdd9f94 .grid-label-y {\r\n    right: 100%;\r\n    margin-right: 1.5rem;\r\n    margin-top: -.5rem;\r\n}\r\n._8bdd9f94 .grid-label-y:before {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\twidth: .5rem;\r\n\theight: 0;\r\n\tborder-top: 2px solid;\r\n\tright: -1rem;\r\n\ttop: .4rem;\r\n\tmargin-right: -1px;\r\n}\r\n") || true) && "_8bdd9f94");
var closestNumber = require('mumath/closest');
var mag = require('mumath/order');
var within = require('mumath/within');
var uid = require('get-uid');


module.exports = Grid;


function Grid (options) {
	var this$1 = this;

	if (!(this instanceof Grid)) return new Grid(options);

	extend(this, options);

	this.id = uid();

	if (!isBrowser) return;

	//obtian container
	this.container = options.container || document.body;
	this.container.classList.add(className);

	//display grid
	this.grid = document.createElement('div');
	this.grid.classList.add('grid');
	this.container.appendChild(this.grid);

	//ensure lines values
	this.lines = (options.lines || []).map(function (lines) { return lines && extend(this$1.defaultLines, lines); });
	this.axes = (options.axes || []).map(function (axis) { return axis && extend(this$1.defaultAxis, axis); });

	//create lines container
	this.linesContainer = document.createElement('div');
	this.linesContainer.classList.add('grid-lines');
	this.grid.appendChild(this.linesContainer);

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
	values: undefined,
	//copied from values
	titles: undefined
};

Grid.prototype.defaultAxis = {
	name: '',
	//detected from range
	values: undefined,
	//copied from values
	labels: undefined,
	//copied from labels
	titles: undefined
};

Grid.prototype.update = function (options) {
	options = options || {};

	var grid = this.grid;
	var linesContainer = this.linesContainer;
	var id = this.id;

	//set viewport
	if (options.viewport) this.viewport = options.viewport;
	var viewport = this.viewport;

	var w = this.container.offsetWidth;
	var h = this.container === document.body ? window.innerHeight : this.container.offsetHeight;

	if (viewport instanceof Function) {
		viewport = viewport(w, h);
	}

	if (!viewport) viewport = [0,0,w,h];

	grid.style.left = viewport[0] + (typeof viewport[0] === 'number' ? 'px' : '');
	grid.style.top = viewport[1] + (typeof viewport[1] === 'number' ? 'px' : '');
	grid.style.width = viewport[2] + (typeof viewport[2] === 'number' ? 'px' : '');
	grid.style.height = viewport[3] + (typeof viewport[3] === 'number' ? 'px' : '');

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
		var stats = {
			linesContainer: linesContainer,
			idx: idx,
			id: id
		};

		if (options.lines) lines = extend(this.lines[idx], options.lines[idx]);
		stats.lines = lines;

		var linesMin = Math.min(lines.max, lines.min);
		var linesMax = Math.max(lines.min, lines.max);
		stats.min = linesMin;
		stats.max = linesMax;

		//detect steps, if not defined, as one per each 50px
		var values = [];
		var intersteps = (lines.orientation === 'x' ? (typeof viewport[2] === 'number' ? viewport[2] : linesContainer.clientWidth) : (typeof viewport[3] === 'number' ? viewport[3] : linesContainer.clientHeight)) / 50;
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
			lines.titles === undefined ? values.slice().map(function (value) {
			return value.toLocaleString();
		}) : lines.titles;
		stats.titles = titles;

		//draw lines
		var offsets = values.map(function (value, i) {
			var line = linesContainer.querySelector(("#grid-line-" + (lines.orientation) + "-" + (value|0) + "-" + idx + "-" + id));
			var ratio;
			if (!line) {
				line = document.createElement('span');
				line.id = "grid-line-" + (lines.orientation) + "-" + (value|0) + "-" + idx + "-" + id;
				line.classList.add('grid-line');
				line.classList.add(("grid-line-" + (lines.orientation)));
				if (value === linesMin) line.classList.add('grid-line-min');
				if (value === linesMax) line.classList.add('grid-line-max');
				line.setAttribute('data-value', value);
				titles && line.setAttribute('title', titles[i]);
				linesContainer.appendChild(line);
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
		var axisTitles = axis.titles instanceof Function ? axisValues.map(function (v, i) { return axis.titles(v, i, stats); }, this) : axis.titles ? axis.titles : axisValues === values ? titles : axis.titles === undefined ? axisValues.slice().map(function (value) {
			return value.toLocaleString();
		}) : axis.titles;
		stats.axisTitles = axisTitles;

		//define labels
		var labels = axis.labels instanceof Function ? axisValues.map(function (v, i) { return axis.labels(v, i, stats); }, this) : axis.labels || axisTitles;
		stats.labels = labels;


		//put axis properly
		var axisEl = grid.querySelector(("#grid-axis-" + (lines.orientation) + "-" + idx + "-" + id));
		if (!axisEl) {
			axisEl = document.createElement('span');
			axisEl.id = "grid-axis-" + (lines.orientation) + "-" + idx + "-" + id;
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

			var label = grid.querySelector(("#grid-label-" + (lines.orientation) + "-" + (value|0) + "-" + idx + "-" + id));
			if (!label) {
				label = document.createElement('label');
				label.id = "grid-label-" + (lines.orientation) + "-" + (value|0) + "-" + idx + "-" + id;
				label.classList.add('grid-label');
				label.classList.add(("grid-label-" + (lines.orientation)));
				label.setAttribute('data-value', value);
				label.setAttribute('for', ("grid-line-" + (lines.orientation)));
				axisTitles && label.setAttribute('title', axisTitles[i]);
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
},{"events":5,"get-uid":39,"inherits":43,"insert-css":44,"is-browser":45,"mumath/closest":49,"mumath/lg":50,"mumath/order":51,"mumath/within":52,"xtend":74}],58:[function(require,module,exports){
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
},{"events":5,"inherits":43,"raf":59,"right-now":61}],59:[function(require,module,exports){
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
},{"performance-now":56}],60:[function(require,module,exports){
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
},{"_process":7,"exit-hook":35,"onetime":55}],61:[function(require,module,exports){
(function (global){
module.exports =
  global.performance &&
  global.performance.now ? function now() {
    return performance.now()
  } : Date.now || function now() {
    return +new Date
  }

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],62:[function(require,module,exports){
'use strict'

function blackmanHarris (i,N) {
  var a0 = 0.35875,
      a1 = 0.48829,
      a2 = 0.14128,
      a3 = 0.01168,
      f = 6.283185307179586*i/(N-1)

  return a0 - a1*Math.cos(f) +a2*Math.cos(2*f) - a3*Math.cos(3*f)
}

module.exports = blackmanHarris

},{}],63:[function(require,module,exports){
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

},{"fs":1,"google-fonts":41,"insert-css":64,"minstache":47,"soundcloud-resolve":65}],64:[function(require,module,exports){
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

},{}],65:[function(require,module,exports){
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

},{"querystring":10,"xhr":71}],66:[function(require,module,exports){
// stats.js - http://github.com/mrdoob/stats.js
var Stats=function(){function h(a){c.appendChild(a.dom);return a}function k(a){for(var d=0;d<c.children.length;d++)c.children[d].style.display=d===a?"block":"none";l=a}var l=0,c=document.createElement("div");c.style.cssText="position:fixed;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000";c.addEventListener("click",function(a){a.preventDefault();k(++l%c.children.length)},!1);var g=(performance||Date).now(),e=g,a=0,r=h(new Stats.Panel("FPS","#0ff","#002")),f=h(new Stats.Panel("MS","#0f0","#020"));
if(self.performance&&self.performance.memory)var t=h(new Stats.Panel("MB","#f08","#201"));k(0);return{REVISION:16,dom:c,addPanel:h,showPanel:k,begin:function(){g=(performance||Date).now()},end:function(){a++;var c=(performance||Date).now();f.update(c-g,200);if(c>e+1E3&&(r.update(1E3*a/(c-e),100),e=c,a=0,t)){var d=performance.memory;t.update(d.usedJSHeapSize/1048576,d.jsHeapSizeLimit/1048576)}return c},update:function(){g=this.end()},domElement:c,setMode:k}};
Stats.Panel=function(h,k,l){var c=Infinity,g=0,e=Math.round,a=e(window.devicePixelRatio||1),r=80*a,f=48*a,t=3*a,u=2*a,d=3*a,m=15*a,n=74*a,p=30*a,q=document.createElement("canvas");q.width=r;q.height=f;q.style.cssText="width:80px;height:48px";var b=q.getContext("2d");b.font="bold "+9*a+"px Helvetica,Arial,sans-serif";b.textBaseline="top";b.fillStyle=l;b.fillRect(0,0,r,f);b.fillStyle=k;b.fillText(h,t,u);b.fillRect(d,m,n,p);b.fillStyle=l;b.globalAlpha=.9;b.fillRect(d,m,n,p);return{dom:q,update:function(f,
v){c=Math.min(c,f);g=Math.max(g,f);b.fillStyle=l;b.globalAlpha=1;b.fillRect(0,0,r,m);b.fillStyle=k;b.fillText(e(f)+" "+h+" ("+e(c)+"-"+e(g)+")",t,u);b.drawImage(q,d+a,m,n-a,p,d,m,n-a,p);b.fillRect(d+n-a,m,a,p);b.fillStyle=l;b.globalAlpha=.9;b.fillRect(d+n-a,m,a,e((1-f/v)*p))}}};"object"===typeof module&&(module.exports=Stats);

},{}],67:[function(require,module,exports){
'use strict';
var ansiRegex = require('ansi-regex')();

module.exports = function (str) {
	return typeof str === 'string' ? str.replace(ansiRegex, '') : str;
};

},{"ansi-regex":20}],68:[function(require,module,exports){
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
},{"_process":7}],69:[function(require,module,exports){
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
},{"_process":7,"ansi-escapes":19,"chalk":24,"elegant-spinner":32,"events":5,"inherits":43,"is-browser":45,"log-update":46,"performance-now":56,"xtend/mutable":75}],70:[function(require,module,exports){
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

},{}],71:[function(require,module,exports){
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

},{"global/window":72,"once":73}],72:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window
} else if (typeof global !== "undefined") {
    module.exports = global
} else {
    module.exports = {}
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],73:[function(require,module,exports){
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

},{}],74:[function(require,module,exports){
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

},{}],75:[function(require,module,exports){
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

},{}],76:[function(require,module,exports){
var test = require('tst');
var Spectrum = require('./');
// var Formant = require('audio-formant');
// var Speaker = require('audio-speaker');
// var Sink = require('audio-sink');
// var Slice = require('audio-slice');
var ft = require('fourier-transform');
var blackman = require('scijs-window-functions/blackman-harris');
var isBrowser = require('is-browser');
var SCBadge = require('soundcloud-badge');
var Analyser = require('web-audio-analyser');
var Stats = require('stats.js');
var db = require('decibels');


var stats = new Stats();
stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild( stats.dom );
stats.begin();
stats.dom.style.left = 'auto';
stats.dom.style.right = '1rem';
stats.dom.style.top = '1rem';


//stream soundcloud
var audio = new Audio;

var badge = SCBadge({
	client_id: '6b7ae5b9df6a0eb3fcca34cc3bb0ef14',
	song: 'https://soundcloud.com/wooded-events/wooded-podcast-cinthie',
	// song: 'https://soundcloud.com/einmusik/einmusik-live-watergate-4th-may-2016',
	// song: 'https://soundcloud.com/when-we-dip/atish-mark-slee-manjumasi-mix-when-we-dip-062',
	// song: 'https://soundcloud.com/dark-textures/dt-darkambients-4',
	// song: 'https://soundcloud.com/deep-house-amsterdam/diynamic-festival-podcast-by-kollektiv-turmstrasse',
	dark: false,
	getFonts: false
}, function(err, src, data, div) {
	if (err) throw err;

	//TODO: read url from href here
	audio.src = src;
	audio.crossOrigin = 'Anonymous';
	audio.addEventListener('canplay', function() {
		audio.play();
	}, false);
});


var analyser = Analyser(audio, { audible: true, stereo: false })


//generate input sine
var N = 2048;
var sine = new Float32Array(N);
var saw = new Float32Array(N);
var noise = new Float32Array(N);
var rate = 44100;

for (var i = 0; i < N; i++) {
	sine[i] = Math.sin(1000 * Math.PI * 2 * (i / rate));
	saw[i] = 2 * ((1000 * i / rate) % 1) - 1;
	noise[i] = Math.random() * 2 - 1;
}

//normalize browser style
if (isBrowser) {
	document.body.style.margin = '0';
	document.body.style.boxSizing = 'border-box';
	document.body.style.fontFamily = 'sans-serif';
}


test('line webgl', function () {
	// var frequencies = ft(sine);
	// var frequencies = new Float32Array(1024).fill(0.5);
	var frequencies = new Float32Array(analyser.analyser.frequencyBinCount);

	// var frequencies = ft(noise);
	// frequencies = frequencies.map((v, i) => v*blackman(i, noise.length)).map((v) => db.fromGain(v));

	var spectrum = new Spectrum({
		frequencies: frequencies,
		fill: 'yignbu',
		grid: true,
		minFrequency: 40,
		maxFrequency: 20000,
		logarithmic: true,
		smoothing: .5,
		maxDecibels: 0,
		// mask: null,
		align: 0.5,
		// viewport: function (w, h) {
		// 	return [50,20,w-70,h-60];
		// }
	}).on('render', function () {
		stats.end();
		stats.begin();

		// analyser.analyser.getFloatTimeDomainData(waveform);
		// frequencies = ft(waveform.map((v, i) => v*blackman(i, waveform.length)));
		// frequencies = frequencies.map((f, i) => db.fromGain(f));

		analyser.analyser.getFloatFrequencyData(frequencies);

		spectrum.setFrequencies(frequencies);
	});

	createColormapSelector(spectrum);
});

test.skip('bars 2d', function () {
	var frequencies = ft(sine);
	// var frequencies = new Float32Array(1024).fill(0.5);
	var frequencies = new Float32Array(analyser.analyser.frequencyBinCount);

	// var frequencies = ft(noise);
	// frequencies = frequencies.map((v, i) => v*blackman(i, noise.length)).map((v) => db.fromGain(v));

	var spectrum = new Spectrum({
		mask: createMask(10, 10),
		// mask: null,
		frequencies: frequencies,
		maxDecibels: 0,
		maxFrequency: 20000,
		grid: false,
		align: 0.5,
		// background: [1,0,0,1],
		// fill: [1,1,1,1],
		logarithmic: true
	}).on('render', function () {
		stats.end();
		stats.begin();
		analyser.analyser.getFloatFrequencyData(frequencies);
		spectrum.setFrequencies(frequencies);
	});

	createColormapSelector(spectrum);
});

test.skip('node', function () {});


test.skip('viewport', function () {});

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




function createColormapSelector (spectrum) {
	var container = document.createElement('div');
	container.style.position = 'fixed';
	container.style.bottom = '0';
	container.style.left = '0';
	container.style.right = '0';
	container.style.padding = '.5rem';
	container.style.border = '0';
	container.style.zIndex = 999;
	document.body.appendChild(container);

	//append style switcher
	var switcher = document.createElement('select');
	switcher.classList.add('colormap');
	switcher.style.width = '4rem';
	switcher.style.color = 'inherit';
	switcher.style.fontSize = '.8rem';
	switcher.style.border = '0';
	switcher.style.background = 'none';
	switcher.title = 'Colormap';
	switcher.innerHTML = "\n\t\t<option value=\"jet\">jet</option>\n\t\t<option value=\"hsv\">hsv</option>\n\t\t<option value=\"hot\">hot</option>\n\t\t<option value=\"cool\">cool</option>\n\t\t<option value=\"spring\">spring</option>\n\t\t<option value=\"summer\">summer</option>\n\t\t<option value=\"autumn\">autumn</option>\n\t\t<option value=\"winter\">winter</option>\n\t\t<option value=\"bone\">bone</option>\n\t\t<option value=\"copper\">copper</option>\n\t\t<option value=\"greys\">greys</option>\n\t\t<option value=\"yignbu\" selected>yignbu</option>\n\t\t<option value=\"greens\">greens</option>\n\t\t<option value=\"yiorrd\">yiorrd</option>\n\t\t<option value=\"bluered\">bluered</option>\n\t\t<option value=\"rdbu\">rdbu</option>\n\t\t<option value=\"picnic\">picnic</option>\n\t\t<option value=\"rainbow\">rainbow</option>\n\t\t<option value=\"portland\">portland</option>\n\t\t<option value=\"blackbody\">blackbody</option>\n\t\t<option value=\"earth\">earth</option>\n\t\t<option value=\"electric\">electric</option>\n\t\t<!--<option value=\"alpha\">alpha</option>-->\n\t";
	switcher.addEventListener('input', function () {
		spectrum.setFill(switcher.value, inverseCheckbox.checked);
		updateView();
	});
	container.appendChild(switcher);


	//inversed colormap checkbox
	var inverseSwitch = createSwitch('inversed', function () {
		spectrum.setFill(switcher.value, this.checked);
		updateView();
	});
	var inverseCheckbox = inverseSwitch.querySelector('input');
	container.appendChild(inverseSwitch);


	//weighting switcher
	var weightingEl = document.createElement('select');
	weightingEl.classList.add('weighting');
	weightingEl.style.width = '4rem';
	weightingEl.style.border = '0';
	weightingEl.style.color = 'inherit';
	weightingEl.style.marginLeft = '1rem';
	weightingEl.style.background = 'none';
	weightingEl.title = 'Noise weighting';
	weightingEl.innerHTML = "\n\t\t<option value=\"a\">A</option>\n\t\t<option value=\"b\">B</option>\n\t\t<option value=\"c\">C</option>\n\t\t<option value=\"d\">D</option>\n\t\t<option value=\"itu\" selected>ITU</option>\n\t\t<option value=\"z\">Z (none)</option>\n\t";
	weightingEl.addEventListener('input', function () {
		spectrum.weighting = weightingEl.value;

		updateView();
	});
	container.appendChild(weightingEl);


	//align slider
	var alignEl = document.createElement('input');
	alignEl.type = 'range';
	alignEl.min = 0;
	alignEl.max = 1;
	alignEl.step = .01;
	alignEl.classList.add('align');
	alignEl.style.width = '5rem';
	alignEl.style.height = '1rem';
	alignEl.style.border = '0';
	alignEl.style.color = 'inherit';
	alignEl.style.margin = '0 0 0 1rem';
	alignEl.style.verticalAlign = 'middle';
	alignEl.style.background = 'none';
	alignEl.title = 'Align: 0.5';
	alignEl.addEventListener('input', function () {
		spectrum.align = parseFloat(alignEl.value);
		alignEl.title = 'Align: ' + alignEl.value;
		updateView();
	});
	container.appendChild(alignEl);


	//grid colormap checkbox
	var gridSwitch = createSwitch('grid', function () {
		spectrum.grid = this.checked;
		updateView();
	});
	var gridCheckbox = gridSwitch.querySelector('input');
	gridCheckbox.checked = spectrum.grid;
	container.appendChild(gridSwitch);

	//bars checkbox
	container.appendChild(
		createSwitch('bars', function () {
			spectrum.setMask(this.checked ? createMask(10, 10) : null);
			updateView();
		})
	);


	updateView();

	function updateView () {
		spectrum.update();
		container.style.color = 'rgb(' + spectrum.fill.slice(-4, -1).map(function (v) { return v*255; }).join(', ') + ')';
	}
}


function createSwitch (name, cb) {
	var switcher = document.createElement('label');
	switcher.innerHTML = "\n\t\t<input type=\"checkbox\" id=\"" + name + "\"/>\n\t\t" + name + "\n\t";
	checkbox = switcher.querySelector('input');
	checkbox.setAttribute('type', 'checkbox');
	checkbox.style.width = '1rem';
	checkbox.style.height = '1rem';
	checkbox.style.verticalAlign = 'middle';

	switcher.style.fontSize = '.8rem';
	switcher.style.verticalAlign = 'middle';
	switcher.style.height = '1rem';
	switcher.classList.add(name + '-switcher');
	switcher.style.margin = '0 0 0 .5rem';
	switcher.style.border = '0';
	switcher.style.background = 'none';
	switcher.style.color = 'inherit';
	switcher.title = name;
	checkbox.addEventListener('click', cb);

	return switcher;
}



//create mask
function createMask (w, h) {
	w = w || 10;
	h = h || 10;
	var rect = [w, h];
	var radius = w/2;
	var canvas = document.createElement('canvas');
	canvas.width = rect[0] + 2;
	canvas.height = rect[1] + 2;
	var ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, rect[0] + 2, rect[1] + 2);
	ctx.fillStyle = 'rgb(0,0,0)';
	ctx.fillRect(0, 0, rect[0] + 2, rect[1] + 2);
	ctx.strokeStyle = 'rgb(255,255,255)';
	ctx.fillStyle = 'rgb(255,255,255)';
	ctx.lineJoin = 'round';
	ctx.lineWidth = radius;
	ctx.strokeRect(1 + (radius/2), 1 + (radius/2), rect[0]-radius - 1, rect[1]-radius - 1);
	ctx.fillRect(1 + (radius/2), 1 + (radius/2), rect[0]-radius - 1, rect[1]-radius - 1);

	// document.body.appendChild(canvas);
	// canvas.style.zIndex = 999;
	// canvas.style.position = 'absolute';
	// canvas.style.top = '0px';
	// canvas.style.left = '0px';

	return canvas;
}
},{"./":11,"decibels":30,"fourier-transform":37,"is-browser":45,"scijs-window-functions/blackman-harris":62,"soundcloud-badge":63,"stats.js":66,"tst":69,"web-audio-analyser":70}]},{},[76]);
