(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
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
},{"base64-js":1,"ieee754":5,"isarray":3}],3:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

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

},{}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
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
	var this$1 = this;

	if (!(this instanceof Spectrum)) return new Spectrum(options);

	var that = this;

	options = options || {};

	Component.call(this, options);

	if (isBrowser) {
		this.container.classList.add('gl-spectrum');
	}

	if (!this.is2d) {
		var gl = this.gl;

		var gl = this.gl;
		var float = gl.getExtension('OES_texture_float');
		if (!float) {
			var float = gl.getExtension('OES_texture_half_float');
			if (!float) {
				throw Error('WebGL does not support floats.');
			}
			var floatLinear = gl.getExtension('OES_texture_half_float_linear');
		}
		else {
			var floatLinear = gl.getExtension('OES_texture_float_linear');

		}
		if (!floatLinear) throw Error('WebGL does not support floats.');

		//setup alpha
		gl.enable( gl.BLEND );
		gl.blendEquation( gl.FUNC_ADD );
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		this.maskSizeLocation = gl.getUniformLocation(this.program, 'maskSize');
		this.alignLocation = gl.getUniformLocation(this.program, 'align');
		this.minFrequencyLocation = gl.getUniformLocation(this.program, 'minFrequency');
		this.maxFrequencyLocation = gl.getUniformLocation(this.program, 'maxFrequency');
		this.logarithmicLocation = gl.getUniformLocation(this.program, 'logarithmic');
		this.sampleRateLocation = gl.getUniformLocation(this.program, 'sampleRate');
		this.groupLocation = gl.getUniformLocation(this.program, 'group');
		this.trailLocation = gl.getUniformLocation(this.program, 'trail');
		this.balanceLocation = gl.getUniformLocation(this.program, 'balance');
		this.peakLocation = gl.getUniformLocation(this.program, 'peak');
	}

	this.freqBuffer = [];

	this.on('resize', function () {
		this$1.recalc();
	});

	this.update();
}

inherits(Spectrum, Component);


Spectrum.prototype.antialias = false;
Spectrum.prototype.premultipliedAlpha = true;
Spectrum.prototype.alpha = true;


Spectrum.prototype.maxDecibels = -30;
Spectrum.prototype.minDecibels = -100;

Spectrum.prototype.maxFrequency = 20000;
Spectrum.prototype.minFrequency = 20;

Spectrum.prototype.smoothing = 0.75;
Spectrum.prototype.details = 1;

Spectrum.prototype.snap = null;

Spectrum.prototype.grid = true;
Spectrum.prototype.axes = false;

Spectrum.prototype.logarithmic = true;

Spectrum.prototype.weighting = 'itu';

//evenly distributed within indicated diapasone
Spectrum.prototype.frequencies = new Float32Array(512);
for (var i = 0; i < 512; i++) {Spectrum.prototype.frequencies[i] = Spectrum.prototype.minDecibels;};

//required to detect frequency resolution
Spectrum.prototype.sampleRate = 44100;

//colors to map spectrum against
Spectrum.prototype.fill = 'greys';
Spectrum.prototype.balance = .65;
Spectrum.prototype.background = undefined;

//amount of alignment
Spectrum.prototype.align = .0;

//shadow frequencies, like averaged/max values
Spectrum.prototype.trail = 1;

//mask defines style of bars, dots or line
Spectrum.prototype.mask = null;

//group freq range by subbands
Spectrum.prototype.group = false;

//scale verteces to frequencies values and apply alignment
Spectrum.prototype.vert = "\n\tprecision highp float;\n\n\tattribute vec2 position;\n\n\tuniform sampler2D frequencies;\n\tuniform sampler2D mask;\n\tuniform vec2 maskSize;\n\tuniform float align;\n\tuniform float minFrequency;\n\tuniform float maxFrequency;\n\tuniform float logarithmic;\n\tuniform float sampleRate;\n\tuniform vec4 viewport;\n\tuniform float group;\n\tuniform float peak;\n\n\tvarying float vDist;\n\tvarying float vMag;\n\tvarying float vLeft;\n\tvarying float vRight;\n\n\tconst float log10 = " + (Math.log(10)) + ";\n\n\tfloat lg (float x) {\n\t\treturn log(x) / log10;\n\t}\n\n\t//return a or b based on weight\n\tfloat decide (float a, float b, float w) {\n\t\treturn step(0.5, w) * b + step(w, 0.5) * a;\n\t}\n\n\t//get mapped frequency\n\tfloat f (float ratio) {\n\t\tfloat halfRate = sampleRate * .5;\n\n\t\tfloat logF = pow(10., lg(minFrequency) + ratio * (lg(maxFrequency) - lg(minFrequency)) );\n\n\t\tratio = decide(ratio, (logF - minFrequency) / (maxFrequency - minFrequency), logarithmic);\n\n\t\tfloat leftF = minFrequency / halfRate;\n\t\tfloat rightF = maxFrequency / halfRate;\n\n\t\tratio = leftF + ratio * (rightF - leftF);\n\n\t\treturn ratio;\n\t}\n\n\tvoid main () {\n\t\tvec2 coord = position;\n\t\tfloat _group = max(group, .5);\n\t\tfloat groupRatio = _group / viewport.z;\n\n\t\t//round x-coord to the step, @c is a precision fix constant\n\t\tfloat c = 1./viewport.z;\n\t\tfloat leftX = floor((coord.x * viewport.z + c ) / _group) * _group / viewport.z;\n\t\tfloat rightX = ceil((coord.x * viewport.z + c ) / _group) * _group / viewport.z;\n\t\tcoord.x = decide(leftX, rightX, step(coord.x - leftX + c*.5, groupRatio * .5));\n\n\t\tfloat mag = texture2D(frequencies, vec2(f(leftX), 0.5)).w;\n\t\tmag = clamp(mag, 0., 1.);\n\n\t\tvMag = mag;\n\t\tvLeft = leftX;\n\t\tvRight = rightX;\n\n\t\t//ensure mask borders are set\n\t\tmag += maskSize.y / viewport.w;\n\n\t\t//map y-coord to alignment\n\t\tcoord.y = coord.y * mag - mag * align + align;\n\n\t\t//save distance from the align\n\t\tvDist = (coord.y - align) * (1. / max(align, 1. - align));\n\n\t\tgl_Position = vec4(coord*2. - 1., 0, 1);\n\t}\n";

Spectrum.prototype.frag = "\n\tprecision highp float;\n\n\tuniform sampler2D fill;\n\tuniform sampler2D mask;\n\tuniform vec2 maskSize;\n\tuniform vec4 viewport;\n\tuniform float align;\n\tuniform float group;\n\tuniform float trail;\n\tuniform float peak;\n\tuniform float balance;\n\n\tvarying float vDist;\n\tvarying float vMag;\n\tvarying float vLeft;\n\tvarying float vRight;\n\n\tvec2 coord;\n\n\tfloat decide (float a, float b, float w) {\n\t\treturn step(0.5, w) * b + step(w, 0.5) * a;\n\t}\n\n\tvoid main () {\n\t\tcoord = (gl_FragCoord.xy - viewport.xy) / (viewport.zw);\n\t\tfloat groupRatio = group / viewport.z;\n\t\tfloat maskRatio = maskSize.x / viewport.z;\n\n\t\t//calc mask\n\t\tfloat halfX = min(group * .5 / maskSize.x, .5);\n\t\tfloat leftX = ((coord.x - vLeft) * viewport.z) / maskSize.x;\n\t\tfloat leftPart = step(leftX, halfX) * step(0., leftX);\n\t\tfloat rightX = 1. - max(((vRight - coord.x) * viewport.z),0.) / maskSize.x;\n\t\tfloat rightPart = step(rightX, 1.) * step(1. - halfX, rightX);\n\t\t// rightPart -= rightPart * leftPart;\n\t\tfloat centralPart = 1. - leftPart - rightPart;\n\n\t\tfloat maskX = decide(.5, centralPart * .5 + leftPart * leftX + rightPart * rightX, step(4., group));\n\n\t\t//find mask’s offset frequency\n\t\tfloat mag = vMag;\n\n\t\t//calc dist\n\t\tfloat dist = abs(vDist);\n\n\t\t//calc intensity\n\t\tfloat intensity = pow(dist, .85) * balance + pow(mag/peak, 1.25) * (1. - balance);\n\t\tintensity /= (peak * .48 + .5);\n\t\tintensity = intensity * .85 + .15;\n\n\t\t//apply mask\n\t\tfloat top = coord.y - mag + align*mag - align + .5*maskSize.y/viewport.w;\n\t\tfloat bottom = -coord.y - align*mag + align + .5*maskSize.y/viewport.w;\n\t\tfloat maskY = max(\n\t\t\tmax(top * viewport.w / maskSize.y, .5),\n\t\t\tmax(bottom * viewport.w / maskSize.y, .5)\n\t\t);\n\t\tvec2 maskCoord = vec2(maskX, maskY);\n\t\tfloat maskLevel = texture2D(mask, maskCoord).x;\n\n\t\tgl_FragColor = vec4(vec3(1), 1);\n\t\tvec4 fillColor = texture2D(fill, vec2(coord.x, max(0., intensity) + trail * (mag * .5 / peak + .15 )));\n\t\tfillColor.a *= maskLevel;\n\t\tfillColor.a += trail * texture2D(mask, vec2(maskX, .5)).x;\n\t\tgl_FragColor = fillColor;\n\t}\n";


/**
 * Set frequencies taking into account smoothing, logarithmic and grouping params
 */
Spectrum.prototype.setFrequencies = function (frequencies) {
	var this$1 = this;

	if (!frequencies) return this;

	this.gl.useProgram(this.program);

	var gl = this.gl;
	var minF = this.minFrequency, maxF = this.maxFrequency;
	var minDb = this.minDecibels, maxDb = this.maxDecibels;
	var halfRate = this.sampleRate * 0.5;
	var l = halfRate / this.frequencies.length;

	//choose bigger data
	var bigger = this.frequencies.length >= frequencies.length ? this.frequencies : frequencies;
	var shorter = (bigger === frequencies ? this.frequencies : frequencies);
	bigger = [].slice.call(bigger);

	var smoothing = (bigger === this.frequencies ? 1 - this.smoothing : this.smoothing);

	for (var i = 0; i < bigger.length; i++) {
		bigger[i] = clamp(bigger[i], -100, 0) * smoothing + clamp(shorter[Math.floor(shorter.length * (i / bigger.length))], -100, 0) * (1 - smoothing);
	}

	//save actual frequencies
	this.frequencies = bigger;

	//prepare f’s for rendering
	magnitudes = bigger.slice();

	//apply a-weighting
	if (weighting[this.weighting]) {
		var w = weighting[this.weighting];
		magnitudes = magnitudes.map(function (mag, i, data) { return clamp(mag + 20 * Math.log(w(i * l)) / Math.log(10), -200, 0); });
	}

	//snap magnitudes
	if (this.snap) {
		magnitudes = magnitudes.map(function (value) { return Math.round(value * this$1.snap) / this$1.snap; });
	}

	//convert mags to 0..1 range limiting by db subrange
	magnitudes = magnitudes.map(function (value) { return (value - minDb) / (maxDb - minDb); });

	//find peak
	var peak = magnitudes.reduce(function (prev, curr) { return Math.max(curr, prev); }, 0);
	this.gl.uniform1f(this.peakLocation, peak);

	//calc trail
	if (this.trail) {
		this.freqBuffer.unshift(magnitudes);
		this.freqBuffer = this.freqBuffer.slice(0, this.trail);
		var trail = magnitudes.slice();
		for (var k = 1; k < this$1.freqBuffer.length; k++) {
			for (var i = 0; i < Math.min(trail.length, this$1.freqBuffer[k].length); i++) {
				trail[i] = Math.max(this$1.freqBuffer[k][i], trail[i]);
			}
		}
		this.trailFrequencies = trail;
	}

	return this.setTexture('frequencies', {
		data: magnitudes,
		format: gl.ALPHA,
		magFilter: this.gl.LINEAR,
		minFilter: this.gl.LINEAR,
		wrap: this.gl.CLAMP_TO_EDGE
	});
};


/**
 * Recalculate number of verteces
 */
Spectrum.prototype.recalc = function () {
	var data = [], w = this.viewport[2] * this.details;

	//no-grouping is simply connected points
	if (!this.group || this.group <= .5) {
		for (var i = 0; i < w; i++) {
			var curr = i/w;
			var next = (i+1)/w;
			data.push(curr);
			data.push(1);
			data.push(next);
			data.push(1);
			data.push(curr);
			data.push(0);
			data.push(next);
			data.push(0);
		}
	}
	//grouping renders bars
	else {
		var size = this.group === true ? 1 : this.group;
		var w = w / size;
		for (var i = 0; i < w; i++) {
			var curr = i/(w);
			var next = (i+.5)/(w);
			data.push(curr);
			data.push(1);
			data.push(curr);
			data.push(1);
			data.push(curr);
			data.push(1);
			data.push(next);
			data.push(1);
			data.push(curr);
			data.push(0);
			data.push(next);
			data.push(0);
			data.push(next);
			data.push(0);
			data.push(next);
			data.push(0);
		}
	}

	this.setAttribute('position', data);

	return this;
};


/**
 * Reset colormap
 */
Spectrum.prototype.setFill = function (cm, inverse) {
	//named colormap
	var this$1 = this;

	if (typeof cm === 'string' && !/\\|\//.test(cm)) {
		this.fill = (flatten(colormap({
			colormap: cm,
			nshades: 128,
			format: 'rgba',
			alpha: 1
		})).map(function (v,i) { return !((i + 1) % 4) ? v : v/255; }));
	}
	else if (!cm) {
		this.fill = null;
		if (!this.background) this.setBackground([1,1,1,1]);
		return this;
	}
	//image, canvas etc
	else if (!Array.isArray(cm)) {
		this.fill = cm;

		this.setTexture('fill', {
			data: this.fill,
			magFilter: this.gl.LINEAR,
			minFilter: this.gl.LINEAR,
			wrap: this.gl.CLAMP_TO_EDGE
		});

		return this;
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
	if (this.freqGridComponent) {
		var gridColor = this.fill.slice(-4).map(function (v) { return v*255; });
		this.freqGridComponent.linesContainer.style.color = "rgba(" + gridColor + ")";
		this.topGridComponent.linesContainer.style.color = "rgba(" + gridColor + ")";
		this.bottomGridComponent.linesContainer.style.color = "rgba(" + gridColor + ")";
	}

	return this;
};


/** Set background */
Spectrum.prototype.setBackground = function (bg) {
	if (this.background !== null) {
		var bgStyle = null;
		if (typeof bg === 'string') {
			bgStyle = bg;
		}
		else if (Array.isArray(bg)) {
			//map 0..1 range to 0..255
			if (bg[0] && bg[0] <= 1 && bg[1] && bg[1] <= 1 && bg[2] && bg[2] <= 1) {
				bg = [
					bg[0] * 255, bg[1] * 255, bg[2] * 255, bg[3] || 1
				];
			}

			bgStyle = "rgba(" + (bg.slice(0,3).map(function ( v ) { return Math.round(v); }).join(', ')) + ", " + (bg[3]) + ")";
		}
		this.canvas.style.background = bgStyle;
	}

	return this;
};


/**
 * Set named or array mask
 */
Spectrum.prototype.setMask = function (mask) {
	this.mask = mask || [1,1,1,1];

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
		if (!this.freqGridComponent) {
			this.freqGridComponent = createGrid({
				container: this.container,
				viewport: function () { return this$1.viewport; },
				lines: Array.isArray(this.grid.lines) ? this.grid.lines : (this.grid.lines === undefined || this.grid.lines === true) && [{
					min: this.minFrequency,
					max: this.maxFrequency,
					orientation: 'x',
					logarithmic: this.logarithmic,
					titles: function (value) {
						return (value >= 1000 ? ((value / 1000).toLocaleString() + 'k') : value.toLocaleString()) + 'Hz';
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
						opacity: '0.08',
						display: this.logarithmic ? null :'none'
					}
				} : null],
				axes: Array.isArray(this.grid.axes) ? this.grid.axes : (this.grid.axes || this.axes) && [{
					name: 'Frequency',
					labels: function (value, i, opt) {
						var str = value.toString();
						if (str[0] !== '2' && str[0] !== '1' && str[0] !== '5') return null;
						return opt.titles[i];
					}
				}]
			});

			this.topGridComponent = createGrid({
				container: this.container,
				viewport: function () { return [
					this$1.viewport[0],
					this$1.viewport[1],
					this$1.viewport[2],
					this$1.viewport[3] * (1 - this$1.align)
				]; },
				lines: [{
					min: this.minDecibels,
					max: this.maxDecibels,
					orientation: 'y',
					titles: function (value) {
						return value.toLocaleString() + 'dB';
					}
				}],
				axes: Array.isArray(this.grid.axes) ? this.grid.axes : (this.grid.axes || this.axes) && [{
					name: 'Magnitude'
				}]
			});

			//alignment requires additional grid
			this.bottomGridComponent = createGrid({
				container: this.container,
				viewport: function () { return [
					this$1.viewport[0],
					this$1.viewport[1] + this$1.viewport[3] * (1 - this$1.align),
					this$1.viewport[2],
					this$1.viewport[3] * this$1.align
				]; },
				lines: [{
					min: this.maxDecibels,
					max: this.minDecibels,
					orientation: 'y',
					titles: function (value) {
						return value.toLocaleString() + 'dB';
					}
				}],
				axes: Array.isArray(this.grid.axes) ? this.grid.axes : (this.grid.axes || this.axes) && [{
					name: 'Magnitude'
				}]
			});

			this.on('resize', function () {
				if (this$1.isPlannedGridUpdate) return;
				this$1.isPlannedGridUpdate = true;
				this$1.once('render', function () {
					this$1.isPlannedGridUpdate = false;
					this$1.topGridComponent.update();
					this$1.bottomGridComponent.update();
					this$1.freqGridComponent.update();
				});
			});
		} else {
			this.freqGridComponent.linesContainer.style.display = 'block';
			this.topGridComponent.linesContainer.style.display = 'block';
			this.bottomGridComponent.linesContainer.style.display = 'block';

			this.topGridComponent.update();
			this.bottomGridComponent.update();

			this.freqGridComponent.update({
				lines: [{
						logarithmic: this.logarithmic
					}, {
						logarithmic: this.logarithmic,
						style: {
							display: this.logarithmic ? null : 'none'
						}
					}
				]
			});
		}

	}
	else if (this.freqGridComponent) {
		this.freqGridComponent.linesContainer.style.display = 'none';
		this.topGridComponent.linesContainer.style.display = 'none';
		this.bottomGridComponent.linesContainer.style.display = 'none';
	}

	//preset trail buffer
	if (this.trail === true) this.trail = Spectrum.prototype.trail;

	//update verteces
	this.recalc();

	//update textures
	this.setBackground(this.background);
	this.setFrequencies(this.frequencies);
	this.setFill(this.fill);
	this.setMask(this.mask);

	this.gl.uniform1f(this.alignLocation, this.align);
	this.gl.uniform1f(this.minFrequencyLocation, this.minFrequency);
	this.gl.uniform1f(this.maxFrequencyLocation, this.maxFrequency);
	this.gl.uniform1f(this.logarithmicLocation, this.logarithmic ? 1 : 0);
	this.gl.uniform1f(this.sampleRateLocation, this.sampleRate);
	this.gl.uniform1f(this.groupLocation, this.group || 0);
	this.gl.uniform1f(this.balanceLocation, this.balance || 0);

	return this;
};


/**
 * Render main loop
 */
Spectrum.prototype.draw = function () {
	var gl = this.gl;

	gl.useProgram(this.program);

	var count = this.attributes.position.data.length / 2;

	if (this.fill) {
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.attributes.position.data.length / 2);
	}

	if (this.trail) {
		//TODO: fix this - do not update freqs each draw call
		gl.uniform1f(this.trailLocation, 1);
		this.setTexture('frequencies', this.trailFrequencies);
		gl.drawArrays(gl.LINES, 0, this.attributes.position.data.length / 2);
		gl.uniform1f(this.trailLocation, 0);
	}

	return this;
};

},{"a-weighting":12,"colormap":24,"flatten":29,"gl-component":34,"inherits":36,"is-browser":38,"mumath/clamp":43,"mumath/lg":45,"plot-grid":52,"xtend/mutable":63}],8:[function(require,module,exports){
module.exports = function a (f) {
	var f2 = f*f;
	return 1.2588966 * 148840000 * f2*f2 /
	((f2 + 424.36) * Math.sqrt((f2 + 11599.29) * (f2 + 544496.41)) * (f2 + 148840000));
};

},{}],9:[function(require,module,exports){
module.exports = function b (f) {
	var f2 = f*f;
	return 1.019764760044717 * 148840000 * f*f2 /
	((f2 + 424.36) * Math.sqrt(f2 + 25122.25) * (f2 + 148840000));
};

},{}],10:[function(require,module,exports){
module.exports = function c (f) {
	var f2 = f*f;
	return 1.0069316688518042 * 148840000 * f2 /
	((f2 + 424.36) * (f2 + 148840000));
};

},{}],11:[function(require,module,exports){
module.exports = function d (f) {
	var f2 = f*f;
	return (f / 6.8966888496476e-5) * Math.sqrt(
		(
			((1037918.48 - f2)*(1037918.48 - f2) + 1080768.16*f2) /
			((9837328 - f2)*(9837328 - f2) + 11723776*f2)
		) /	((f2 + 79919.29) * (f2 + 1345600))
	);
};

},{}],12:[function(require,module,exports){
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
},{"./a":8,"./b":9,"./c":10,"./d":11,"./itu":13,"./z":14}],13:[function(require,module,exports){
module.exports = function itu (f) {
	var f2 = f*f;

	var h1 = -4.737338981378384e-24*f2*f2*f2 + 2.043828333606125e-15*f2*f2 - 1.363894795463638e-7*f2 + 1;
	var h2 = 1.306612257412824e-19*f2*f2*f - 2.118150887518656e-11*f2*f + 5.559488023498642e-4*f;

	return 8.128305161640991 * 1.246332637532143e-4 * f / Math.sqrt(h1*h1 + h2*h2);
};

},{}],14:[function(require,module,exports){
module.exports = function (f) {
	return 1;
};

},{}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
var window = require('global/window');

var Context = window.AudioContext || window.webkitAudioContext;
if (Context) module.exports = new Context;

},{"global/window":35}],17:[function(require,module,exports){
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

},{"element-size":28}],18:[function(require,module,exports){
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
},{"buffer":2}],19:[function(require,module,exports){
module.exports = {
	"aliceblue": [240, 248, 255],
	"antiquewhite": [250, 235, 215],
	"aqua": [0, 255, 255],
	"aquamarine": [127, 255, 212],
	"azure": [240, 255, 255],
	"beige": [245, 245, 220],
	"bisque": [255, 228, 196],
	"black": [0, 0, 0],
	"blanchedalmond": [255, 235, 205],
	"blue": [0, 0, 255],
	"blueviolet": [138, 43, 226],
	"brown": [165, 42, 42],
	"burlywood": [222, 184, 135],
	"cadetblue": [95, 158, 160],
	"chartreuse": [127, 255, 0],
	"chocolate": [210, 105, 30],
	"coral": [255, 127, 80],
	"cornflowerblue": [100, 149, 237],
	"cornsilk": [255, 248, 220],
	"crimson": [220, 20, 60],
	"cyan": [0, 255, 255],
	"darkblue": [0, 0, 139],
	"darkcyan": [0, 139, 139],
	"darkgoldenrod": [184, 134, 11],
	"darkgray": [169, 169, 169],
	"darkgreen": [0, 100, 0],
	"darkgrey": [169, 169, 169],
	"darkkhaki": [189, 183, 107],
	"darkmagenta": [139, 0, 139],
	"darkolivegreen": [85, 107, 47],
	"darkorange": [255, 140, 0],
	"darkorchid": [153, 50, 204],
	"darkred": [139, 0, 0],
	"darksalmon": [233, 150, 122],
	"darkseagreen": [143, 188, 143],
	"darkslateblue": [72, 61, 139],
	"darkslategray": [47, 79, 79],
	"darkslategrey": [47, 79, 79],
	"darkturquoise": [0, 206, 209],
	"darkviolet": [148, 0, 211],
	"deeppink": [255, 20, 147],
	"deepskyblue": [0, 191, 255],
	"dimgray": [105, 105, 105],
	"dimgrey": [105, 105, 105],
	"dodgerblue": [30, 144, 255],
	"firebrick": [178, 34, 34],
	"floralwhite": [255, 250, 240],
	"forestgreen": [34, 139, 34],
	"fuchsia": [255, 0, 255],
	"gainsboro": [220, 220, 220],
	"ghostwhite": [248, 248, 255],
	"gold": [255, 215, 0],
	"goldenrod": [218, 165, 32],
	"gray": [128, 128, 128],
	"green": [0, 128, 0],
	"greenyellow": [173, 255, 47],
	"grey": [128, 128, 128],
	"honeydew": [240, 255, 240],
	"hotpink": [255, 105, 180],
	"indianred": [205, 92, 92],
	"indigo": [75, 0, 130],
	"ivory": [255, 255, 240],
	"khaki": [240, 230, 140],
	"lavender": [230, 230, 250],
	"lavenderblush": [255, 240, 245],
	"lawngreen": [124, 252, 0],
	"lemonchiffon": [255, 250, 205],
	"lightblue": [173, 216, 230],
	"lightcoral": [240, 128, 128],
	"lightcyan": [224, 255, 255],
	"lightgoldenrodyellow": [250, 250, 210],
	"lightgray": [211, 211, 211],
	"lightgreen": [144, 238, 144],
	"lightgrey": [211, 211, 211],
	"lightpink": [255, 182, 193],
	"lightsalmon": [255, 160, 122],
	"lightseagreen": [32, 178, 170],
	"lightskyblue": [135, 206, 250],
	"lightslategray": [119, 136, 153],
	"lightslategrey": [119, 136, 153],
	"lightsteelblue": [176, 196, 222],
	"lightyellow": [255, 255, 224],
	"lime": [0, 255, 0],
	"limegreen": [50, 205, 50],
	"linen": [250, 240, 230],
	"magenta": [255, 0, 255],
	"maroon": [128, 0, 0],
	"mediumaquamarine": [102, 205, 170],
	"mediumblue": [0, 0, 205],
	"mediumorchid": [186, 85, 211],
	"mediumpurple": [147, 112, 219],
	"mediumseagreen": [60, 179, 113],
	"mediumslateblue": [123, 104, 238],
	"mediumspringgreen": [0, 250, 154],
	"mediumturquoise": [72, 209, 204],
	"mediumvioletred": [199, 21, 133],
	"midnightblue": [25, 25, 112],
	"mintcream": [245, 255, 250],
	"mistyrose": [255, 228, 225],
	"moccasin": [255, 228, 181],
	"navajowhite": [255, 222, 173],
	"navy": [0, 0, 128],
	"oldlace": [253, 245, 230],
	"olive": [128, 128, 0],
	"olivedrab": [107, 142, 35],
	"orange": [255, 165, 0],
	"orangered": [255, 69, 0],
	"orchid": [218, 112, 214],
	"palegoldenrod": [238, 232, 170],
	"palegreen": [152, 251, 152],
	"paleturquoise": [175, 238, 238],
	"palevioletred": [219, 112, 147],
	"papayawhip": [255, 239, 213],
	"peachpuff": [255, 218, 185],
	"peru": [205, 133, 63],
	"pink": [255, 192, 203],
	"plum": [221, 160, 221],
	"powderblue": [176, 224, 230],
	"purple": [128, 0, 128],
	"rebeccapurple": [102, 51, 153],
	"red": [255, 0, 0],
	"rosybrown": [188, 143, 143],
	"royalblue": [65, 105, 225],
	"saddlebrown": [139, 69, 19],
	"salmon": [250, 128, 114],
	"sandybrown": [244, 164, 96],
	"seagreen": [46, 139, 87],
	"seashell": [255, 245, 238],
	"sienna": [160, 82, 45],
	"silver": [192, 192, 192],
	"skyblue": [135, 206, 235],
	"slateblue": [106, 90, 205],
	"slategray": [112, 128, 144],
	"slategrey": [112, 128, 144],
	"snow": [255, 250, 250],
	"springgreen": [0, 255, 127],
	"steelblue": [70, 130, 180],
	"tan": [210, 180, 140],
	"teal": [0, 128, 128],
	"thistle": [216, 191, 216],
	"tomato": [255, 99, 71],
	"turquoise": [64, 224, 208],
	"violet": [238, 130, 238],
	"wheat": [245, 222, 179],
	"white": [255, 255, 255],
	"whitesmoke": [245, 245, 245],
	"yellow": [255, 255, 0],
	"yellowgreen": [154, 205, 50]
};
},{}],20:[function(require,module,exports){
/**
 * @module color-parse
 */

module.exports = parse;


var names = require('color-name');


/**
 * Base hues
 * http://dev.w3.org/csswg/css-color/#typedef-named-hue
 */
//FIXME: use external hue detector
var baseHues = {
	red: 0,
	orange: 60,
	yellow: 120,
	green: 180,
	blue: 240,
	purple: 300
};


/**
 * Parse color from the string passed
 *
 * @return {Object} A space indicator `space`, an array `values` and `alpha`
 */
function parse (cstr) {
	var m, parts = [0,0,0], alpha = 1, space = 'rgb';

	//keyword
	if (names[cstr]) {
		parts = names[cstr].slice();
	}

	//reserved words
	else if (cstr === 'transparent') alpha = 0;

	//color space
	else if (m = /^((?:rgb|hs[lvb]|hwb|cmyk?|xy[zy]|gray|lab|lchu?v?|[ly]uv|lms)a?)\s*\(([^\)]*)\)/.exec(cstr)) {
		var name = m[1];
		var base = name.replace(/a$/, '');
		space = base;
		var size = base === 'cmyk' ? 4 : base === 'gray' ? 1 : 3;
		parts = m[2].trim()
			.split(/\s*,\s*/)
			.map(function (x, i) {
				//<percentage>
				if (/%$/.test(x)) {
					//alpha
					if (i === size)	return parseFloat(x) / 100;
					//rgb
					if (base === 'rgb') return parseFloat(x) * 255 / 100;
					return parseFloat(x);
				}
				//hue
				else if (base[i] === 'h') {
					//<deg>
					if (/deg$/.test(x)) {
						return parseFloat(x);
					}
					//<base-hue>
					else if (baseHues[x] !== undefined) {
						return baseHues[x];
					}
				}
				return parseFloat(x);
			});

		if (name === base) parts.push(1);
		alpha = parts[size] === undefined ? 1 : parts[size];
		parts = parts.slice(0, size);
	}

	//hex
	else if (/^#[A-Fa-f0-9]+$/.test(cstr)) {
		var base = cstr.replace(/^#/,'');
		var size = base.length;
		var isShort = size <= 4;

		parts = base.split(isShort ? /(.)/ : /(..)/);
		parts = parts.filter(Boolean)
			.map(function (x) {
				if (isShort) {
					return parseInt(x + x, 16);
				}
				else {
					return parseInt(x, 16);
				}
			});

		if (parts.length === 4) {
			alpha = parts[3] / 255;
			parts = parts.slice(0,3);
		}
		if (!parts[0]) parts[0] = 0;
		if (!parts[1]) parts[1] = 0;
		if (!parts[2]) parts[2] = 0;
	}

	//named channels case
	else if (cstr.length > 10 && /[0-9](?:\s|\/)/.test(cstr)) {
		parts = cstr.match(/([0-9]+)/g).map(function (value) {
			return parseFloat(value);
		});

		space = cstr.match(/([a-z])/ig).join('').toLowerCase();
	}

	else {
		throw Error('Unable to parse ' + cstr);
	}

	return {
		space: space,
		values: parts,
		alpha: alpha
	};
}
},{"color-name":19}],21:[function(require,module,exports){
/**
 * @module color-space/hsl
 */

var rgb = require('./rgb');

module.exports = {
	name: 'hsl',
	min: [0,0,0],
	max: [360,100,100],
	channel: ['hue', 'saturation', 'lightness'],
	alias: ['HSL'],

	rgb: function(hsl) {
		var h = hsl[0] / 360,
				s = hsl[1] / 100,
				l = hsl[2] / 100,
				t1, t2, t3, rgb, val;

		if (s === 0) {
			val = l * 255;
			return [val, val, val];
		}

		if (l < 0.5) {
			t2 = l * (1 + s);
		}
		else {
			t2 = l + s - l * s;
		}
		t1 = 2 * l - t2;

		rgb = [0, 0, 0];
		for (var i = 0; i < 3; i++) {
			t3 = h + 1 / 3 * - (i - 1);
			if (t3 < 0) {
				t3++;
			}
			else if (t3 > 1) {
				t3--;
			}

			if (6 * t3 < 1) {
				val = t1 + (t2 - t1) * 6 * t3;
			}
			else if (2 * t3 < 1) {
				val = t2;
			}
			else if (3 * t3 < 2) {
				val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
			}
			else {
				val = t1;
			}

			rgb[i] = val * 255;
		}

		return rgb;
	}
};


//extend rgb
rgb.hsl = function(rgb) {
	var r = rgb[0]/255,
			g = rgb[1]/255,
			b = rgb[2]/255,
			min = Math.min(r, g, b),
			max = Math.max(r, g, b),
			delta = max - min,
			h, s, l;

	if (max === min) {
		h = 0;
	}
	else if (r === max) {
		h = (g - b) / delta;
	}
	else if (g === max) {
		h = 2 + (b - r) / delta;
	}
	else if (b === max) {
		h = 4 + (r - g)/ delta;
	}

	h = Math.min(h * 60, 360);

	if (h < 0) {
		h += 360;
	}

	l = (min + max) / 2;

	if (max === min) {
		s = 0;
	}
	else if (l <= 0.5) {
		s = delta / (max + min);
	}
	else {
		s = delta / (2 - max - min);
	}

	return [h, s * 100, l * 100];
};
},{"./rgb":22}],22:[function(require,module,exports){
/**
 * RGB space.
 *
 * @module  color-space/rgb
 */

module.exports = {
	name: 'rgb',
	min: [0,0,0],
	max: [255,255,255],
	channel: ['red', 'green', 'blue'],
	alias: ['RGB']
};
},{}],23:[function(require,module,exports){
module.exports={
	"jet":[{"index":0,"rgb":[0,0,131]},{"index":0.125,"rgb":[0,60,170]},{"index":0.375,"rgb":[5,255,255]},{"index":0.625,"rgb":[255,255,0]},{"index":0.875,"rgb":[250,0,0]},{"index":1,"rgb":[128,0,0]}],

	"hsv":[{"index":0,"rgb":[255,0,0]},{"index":0.169,"rgb":[253,255,2]},{"index":0.173,"rgb":[247,255,2]},{"index":0.337,"rgb":[0,252,4]},{"index":0.341,"rgb":[0,252,10]},{"index":0.506,"rgb":[1,249,255]},{"index":0.671,"rgb":[2,0,253]},{"index":0.675,"rgb":[8,0,253]},{"index":0.839,"rgb":[255,0,251]},{"index":0.843,"rgb":[255,0,245]},{"index":1,"rgb":[255,0,6]}],

	"hot":[{"index":0,"rgb":[0,0,0]},{"index":0.3,"rgb":[230,0,0]},{"index":0.6,"rgb":[255,210,0]},{"index":1,"rgb":[255,255,255]}],

	"cool":[{"index":0,"rgb":[0,255,255]},{"index":1,"rgb":[255,0,255]}],

	"spring":[{"index":0,"rgb":[255,0,255]},{"index":1,"rgb":[255,255,0]}],

	"summer":[{"index":0,"rgb":[0,128,102]},{"index":1,"rgb":[255,255,102]}],

	"autumn":[{"index":0,"rgb":[255,0,0]},{"index":1,"rgb":[255,255,0]}],

	"winter":[{"index":0,"rgb":[0,0,255]},{"index":1,"rgb":[0,255,128]}],

	"bone":[{"index":0,"rgb":[0,0,0]},{"index":0.376,"rgb":[84,84,116]},{"index":0.753,"rgb":[169,200,200]},{"index":1,"rgb":[255,255,255]}],

	"copper":[{"index":0,"rgb":[0,0,0]},{"index":0.804,"rgb":[255,160,102]},{"index":1,"rgb":[255,199,127]}],

	"greys":[{"index":0,"rgb":[0,0,0]},{"index":1,"rgb":[255,255,255]}],

	"yignbu":[{"index":0,"rgb":[8,29,88]},{"index":0.125,"rgb":[37,52,148]},{"index":0.25,"rgb":[34,94,168]},{"index":0.375,"rgb":[29,145,192]},{"index":0.5,"rgb":[65,182,196]},{"index":0.625,"rgb":[127,205,187]},{"index":0.75,"rgb":[199,233,180]},{"index":0.875,"rgb":[237,248,217]},{"index":1,"rgb":[255,255,217]}],

	"greens":[{"index":0,"rgb":[0,68,27]},{"index":0.125,"rgb":[0,109,44]},{"index":0.25,"rgb":[35,139,69]},{"index":0.375,"rgb":[65,171,93]},{"index":0.5,"rgb":[116,196,118]},{"index":0.625,"rgb":[161,217,155]},{"index":0.75,"rgb":[199,233,192]},{"index":0.875,"rgb":[229,245,224]},{"index":1,"rgb":[247,252,245]}],

	"yiorrd":[{"index":0,"rgb":[128,0,38]},{"index":0.125,"rgb":[189,0,38]},{"index":0.25,"rgb":[227,26,28]},{"index":0.375,"rgb":[252,78,42]},{"index":0.5,"rgb":[253,141,60]},{"index":0.625,"rgb":[254,178,76]},{"index":0.75,"rgb":[254,217,118]},{"index":0.875,"rgb":[255,237,160]},{"index":1,"rgb":[255,255,204]}],

	"bluered":[{"index":0,"rgb":[0,0,255]},{"index":1,"rgb":[255,0,0]}],

	"rdbu":[{"index":0,"rgb":[5,10,172]},{"index":0.35,"rgb":[106,137,247]},{"index":0.5,"rgb":[190,190,190]},{"index":0.6,"rgb":[220,170,132]},{"index":0.7,"rgb":[230,145,90]},{"index":1,"rgb":[178,10,28]}],

	"picnic":[{"index":0,"rgb":[0,0,255]},{"index":0.1,"rgb":[51,153,255]},{"index":0.2,"rgb":[102,204,255]},{"index":0.3,"rgb":[153,204,255]},{"index":0.4,"rgb":[204,204,255]},{"index":0.5,"rgb":[255,255,255]},{"index":0.6,"rgb":[255,204,255]},{"index":0.7,"rgb":[255,153,255]},{"index":0.8,"rgb":[255,102,204]},{"index":0.9,"rgb":[255,102,102]},{"index":1,"rgb":[255,0,0]}],

	"rainbow":[{"index":0,"rgb":[150,0,90]},{"index":0.125,"rgb":[0,0,200]},{"index":0.25,"rgb":[0,25,255]},{"index":0.375,"rgb":[0,152,255]},{"index":0.5,"rgb":[44,255,150]},{"index":0.625,"rgb":[151,255,0]},{"index":0.75,"rgb":[255,234,0]},{"index":0.875,"rgb":[255,111,0]},{"index":1,"rgb":[255,0,0]}],

	"portland":[{"index":0,"rgb":[12,51,131]},{"index":0.25,"rgb":[10,136,186]},{"index":0.5,"rgb":[242,211,56]},{"index":0.75,"rgb":[242,143,56]},{"index":1,"rgb":[217,30,30]}],

	"blackbody":[{"index":0,"rgb":[0,0,0]},{"index":0.2,"rgb":[230,0,0]},{"index":0.4,"rgb":[230,210,0]},{"index":0.7,"rgb":[255,255,255]},{"index":1,"rgb":[160,200,255]}],

	"earth":[{"index":0,"rgb":[0,0,130]},{"index":0.1,"rgb":[0,180,180]},{"index":0.2,"rgb":[40,210,40]},{"index":0.4,"rgb":[230,230,50]},{"index":0.6,"rgb":[120,70,20]},{"index":1,"rgb":[255,255,255]}],

	"electric":[{"index":0,"rgb":[0,0,0]},{"index":0.15,"rgb":[30,0,100]},{"index":0.4,"rgb":[120,0,100]},{"index":0.6,"rgb":[160,90,0]},{"index":0.8,"rgb":[230,200,0]},{"index":1,"rgb":[255,250,220]}],

	"alpha": [{"index":0, "rgb": [255,255,255,0]},{"index":0, "rgb": [255,255,255,1]}],

	"viridis": [{"index":0,"rgb":[68,1,84]},{"index":0.13,"rgb":[71,44,122]},{"index":0.25,"rgb":[59,81,139]},{"index":0.38,"rgb":[44,113,142]},{"index":0.5,"rgb":[33,144,141]},{"index":0.63,"rgb":[39,173,129]},{"index":0.75,"rgb":[92,200,99]},{"index":0.88,"rgb":[170,220,50]},{"index":1,"rgb":[253,231,37]}],

	"inferno": [{"index":0,"rgb":[0,0,4]},{"index":0.13,"rgb":[31,12,72]},{"index":0.25,"rgb":[85,15,109]},{"index":0.38,"rgb":[136,34,106]},{"index":0.5,"rgb":[186,54,85]},{"index":0.63,"rgb":[227,89,51]},{"index":0.75,"rgb":[249,140,10]},{"index":0.88,"rgb":[249,201,50]},{"index":1,"rgb":[252,255,164]}],

	"magma": [{"index":0,"rgb":[0,0,4]},{"index":0.13,"rgb":[28,16,68]},{"index":0.25,"rgb":[79,18,123]},{"index":0.38,"rgb":[129,37,129]},{"index":0.5,"rgb":[181,54,122]},{"index":0.63,"rgb":[229,80,100]},{"index":0.75,"rgb":[251,135,97]},{"index":0.88,"rgb":[254,194,135]},{"index":1,"rgb":[252,253,191]}],

	"plasma": [{"index":0,"rgb":[13,8,135]},{"index":0.13,"rgb":[75,3,161]},{"index":0.25,"rgb":[125,3,168]},{"index":0.38,"rgb":[168,34,150]},{"index":0.5,"rgb":[203,70,121]},{"index":0.63,"rgb":[229,107,93]},{"index":0.75,"rgb":[248,148,65]},{"index":0.88,"rgb":[253,195,40]},{"index":1,"rgb":[240,249,33]}],

	"warm": [{"index":0,"rgb":[125,0,179]},{"index":0.13,"rgb":[172,0,187]},{"index":0.25,"rgb":[219,0,170]},{"index":0.38,"rgb":[255,0,130]},{"index":0.5,"rgb":[255,63,74]},{"index":0.63,"rgb":[255,123,0]},{"index":0.75,"rgb":[234,176,0]},{"index":0.88,"rgb":[190,228,0]},{"index":1,"rgb":[147,255,0]}],

	"cool": [{"index":0,"rgb":[125,0,179]},{"index":0.13,"rgb":[116,0,218]},{"index":0.25,"rgb":[98,74,237]},{"index":0.38,"rgb":[68,146,231]},{"index":0.5,"rgb":[0,204,197]},{"index":0.63,"rgb":[0,247,146]},{"index":0.75,"rgb":[0,255,88]},{"index":0.88,"rgb":[40,255,8]},{"index":1,"rgb":[147,255,0]}],

	"rainbow-soft": [{"index":0,"rgb":[125,0,179]},{"index":0.1,"rgb":[199,0,180]},{"index":0.2,"rgb":[255,0,121]},{"index":0.3,"rgb":[255,108,0]},{"index":0.4,"rgb":[222,194,0]},{"index":0.5,"rgb":[150,255,0]},{"index":0.6,"rgb":[0,255,55]},{"index":0.7,"rgb":[0,246,150]},{"index":0.8,"rgb":[50,167,222]},{"index":0.9,"rgb":[103,51,235]},{"index":1,"rgb":[124,0,186]}],

	"bathymetry": [{"index":0,"rgb":[40,26,44]},{"index":0.13,"rgb":[59,49,90]},{"index":0.25,"rgb":[64,76,139]},{"index":0.38,"rgb":[63,110,151]},{"index":0.5,"rgb":[72,142,158]},{"index":0.63,"rgb":[85,174,163]},{"index":0.75,"rgb":[120,206,163]},{"index":0.88,"rgb":[187,230,172]},{"index":1,"rgb":[253,254,204]}],

	"cdom": [{"index":0,"rgb":[47,15,62]},{"index":0.13,"rgb":[87,23,86]},{"index":0.25,"rgb":[130,28,99]},{"index":0.38,"rgb":[171,41,96]},{"index":0.5,"rgb":[206,67,86]},{"index":0.63,"rgb":[230,106,84]},{"index":0.75,"rgb":[242,149,103]},{"index":0.88,"rgb":[249,193,135]},{"index":1,"rgb":[254,237,176]}],

	"chlorophyll": [{"index":0,"rgb":[18,36,20]},{"index":0.13,"rgb":[25,63,41]},{"index":0.25,"rgb":[24,91,59]},{"index":0.38,"rgb":[13,119,72]},{"index":0.5,"rgb":[18,148,80]},{"index":0.63,"rgb":[80,173,89]},{"index":0.75,"rgb":[132,196,122]},{"index":0.88,"rgb":[175,221,162]},{"index":1,"rgb":[215,249,208]}],

	"density": [{"index":0,"rgb":[54,14,36]},{"index":0.13,"rgb":[89,23,80]},{"index":0.25,"rgb":[110,45,132]},{"index":0.38,"rgb":[120,77,178]},{"index":0.5,"rgb":[120,113,213]},{"index":0.63,"rgb":[115,151,228]},{"index":0.75,"rgb":[134,185,227]},{"index":0.88,"rgb":[177,214,227]},{"index":1,"rgb":[230,241,241]}],

	"freesurface-blue": [{"index":0,"rgb":[30,4,110]},{"index":0.13,"rgb":[47,14,176]},{"index":0.25,"rgb":[41,45,236]},{"index":0.38,"rgb":[25,99,212]},{"index":0.5,"rgb":[68,131,200]},{"index":0.63,"rgb":[114,156,197]},{"index":0.75,"rgb":[157,181,203]},{"index":0.88,"rgb":[200,208,216]},{"index":1,"rgb":[241,237,236]}],

	"freesurface-red": [{"index":0,"rgb":[60,9,18]},{"index":0.13,"rgb":[100,17,27]},{"index":0.25,"rgb":[142,20,29]},{"index":0.38,"rgb":[177,43,27]},{"index":0.5,"rgb":[192,87,63]},{"index":0.63,"rgb":[205,125,105]},{"index":0.75,"rgb":[216,162,148]},{"index":0.88,"rgb":[227,199,193]},{"index":1,"rgb":[241,237,236]}],

	"oxygen": [{"index":0,"rgb":[64,5,5]},{"index":0.13,"rgb":[106,6,15]},{"index":0.25,"rgb":[144,26,7]},{"index":0.38,"rgb":[168,64,3]},{"index":0.5,"rgb":[188,100,4]},{"index":0.63,"rgb":[206,136,11]},{"index":0.75,"rgb":[220,174,25]},{"index":0.88,"rgb":[231,215,44]},{"index":1,"rgb":[248,254,105]}],

	"par": [{"index":0,"rgb":[51,20,24]},{"index":0.13,"rgb":[90,32,35]},{"index":0.25,"rgb":[129,44,34]},{"index":0.38,"rgb":[159,68,25]},{"index":0.5,"rgb":[182,99,19]},{"index":0.63,"rgb":[199,134,22]},{"index":0.75,"rgb":[212,171,35]},{"index":0.88,"rgb":[221,210,54]},{"index":1,"rgb":[225,253,75]}],

	"phase": [{"index":0,"rgb":[145,105,18]},{"index":0.13,"rgb":[184,71,38]},{"index":0.25,"rgb":[186,58,115]},{"index":0.38,"rgb":[160,71,185]},{"index":0.5,"rgb":[110,97,218]},{"index":0.63,"rgb":[50,123,164]},{"index":0.75,"rgb":[31,131,110]},{"index":0.88,"rgb":[77,129,34]},{"index":1,"rgb":[145,105,18]}],

	"salinity": [{"index":0,"rgb":[42,24,108]},{"index":0.13,"rgb":[33,50,162]},{"index":0.25,"rgb":[15,90,145]},{"index":0.38,"rgb":[40,118,137]},{"index":0.5,"rgb":[59,146,135]},{"index":0.63,"rgb":[79,175,126]},{"index":0.75,"rgb":[120,203,104]},{"index":0.88,"rgb":[193,221,100]},{"index":1,"rgb":[253,239,154]}],

	"temperature": [{"index":0,"rgb":[4,35,51]},{"index":0.13,"rgb":[23,51,122]},{"index":0.25,"rgb":[85,59,157]},{"index":0.38,"rgb":[129,79,143]},{"index":0.5,"rgb":[175,95,130]},{"index":0.63,"rgb":[222,112,101]},{"index":0.75,"rgb":[249,146,66]},{"index":0.88,"rgb":[249,196,65]},{"index":1,"rgb":[232,250,91]}],

	"turbidity": [{"index":0,"rgb":[34,31,27]},{"index":0.13,"rgb":[65,50,41]},{"index":0.25,"rgb":[98,69,52]},{"index":0.38,"rgb":[131,89,57]},{"index":0.5,"rgb":[161,112,59]},{"index":0.63,"rgb":[185,140,66]},{"index":0.75,"rgb":[202,174,88]},{"index":0.88,"rgb":[216,209,126]},{"index":1,"rgb":[233,246,171]}],

	"velocity-blue": [{"index":0,"rgb":[17,32,64]},{"index":0.13,"rgb":[35,52,116]},{"index":0.25,"rgb":[29,81,156]},{"index":0.38,"rgb":[31,113,162]},{"index":0.5,"rgb":[50,144,169]},{"index":0.63,"rgb":[87,173,176]},{"index":0.75,"rgb":[149,196,189]},{"index":0.88,"rgb":[203,221,211]},{"index":1,"rgb":[254,251,230]}],

	"velocity-green": [{"index":0,"rgb":[23,35,19]},{"index":0.13,"rgb":[24,64,38]},{"index":0.25,"rgb":[11,95,45]},{"index":0.38,"rgb":[39,123,35]},{"index":0.5,"rgb":[95,146,12]},{"index":0.63,"rgb":[152,165,18]},{"index":0.75,"rgb":[201,186,69]},{"index":0.88,"rgb":[233,216,137]},{"index":1,"rgb":[255,253,205]}],

	"cubehelix": [{"index":0,"rgb":[0,0,0]},{"index":0.07,"rgb":[22,5,59]},{"index":0.13,"rgb":[60,4,105]},{"index":0.2,"rgb":[109,1,135]},{"index":0.27,"rgb":[161,0,147]},{"index":0.33,"rgb":[210,2,142]},{"index":0.4,"rgb":[251,11,123]},{"index":0.47,"rgb":[255,29,97]},{"index":0.53,"rgb":[255,54,69]},{"index":0.6,"rgb":[255,85,46]},{"index":0.67,"rgb":[255,120,34]},{"index":0.73,"rgb":[255,157,37]},{"index":0.8,"rgb":[241,191,57]},{"index":0.87,"rgb":[224,220,93]},{"index":0.93,"rgb":[218,241,142]},{"index":1,"rgb":[227,253,198]}]
};

},{}],24:[function(require,module,exports){
/*
 * Ben Postlethwaite
 * January 2013
 * License MIT
 */
'use strict';

var at = require('arraytools');
var clone = require('clone');
var colorScale = require('./colorScales');

module.exports = createColormap;

function createColormap (spec) {
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

},{"./colorScales":23,"arraytools":15,"clone":18}],25:[function(require,module,exports){
module.exports = function gainToDecibels(value) {
  if (value == null) return 0
  return Math.round(Math.round(20 * (0.43429 * Math.log(value)) * 100) / 100 * 10) / 10
}
},{}],26:[function(require,module,exports){
module.exports = {
  fromGain: require('./from-gain'),
  toGain: require('./to-gain')
}
},{"./from-gain":25,"./to-gain":27}],27:[function(require,module,exports){
module.exports = function decibelsToGain(value){
  if (value <= -40){
    return 0
  }
  return Math.round(Math.exp(value / 8.6858) * 10000) / 10000
}
},{}],28:[function(require,module,exports){
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

},{}],29:[function(require,module,exports){
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

},{}],30:[function(require,module,exports){
var isFunction = require('is-function')

module.exports = forEach

var toString = Object.prototype.toString
var hasOwnProperty = Object.prototype.hasOwnProperty

function forEach(list, iterator, context) {
    if (!isFunction(iterator)) {
        throw new TypeError('iterator must be a function')
    }

    if (arguments.length < 3) {
        context = this
    }
    
    if (toString.call(list) === '[object Array]')
        forEachArray(list, iterator, context)
    else if (typeof list === 'string')
        forEachString(list, iterator, context)
    else
        forEachObject(list, iterator, context)
}

function forEachArray(array, iterator, context) {
    for (var i = 0, len = array.length; i < len; i++) {
        if (hasOwnProperty.call(array, i)) {
            iterator.call(context, array[i], i, array)
        }
    }
}

function forEachString(string, iterator, context) {
    for (var i = 0, len = string.length; i < len; i++) {
        // no such thing as a sparse string.
        iterator.call(context, string.charAt(i), i, string)
    }
}

function forEachObject(object, iterator, context) {
    for (var k in object) {
        if (hasOwnProperty.call(object, k)) {
            iterator.call(context, object[k], k, object)
        }
    }
}

},{"is-function":39}],31:[function(require,module,exports){
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
},{}],32:[function(require,module,exports){
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

},{}],33:[function(require,module,exports){
/** generate unique id for selector */
var counter = Date.now() % 1e9;

module.exports = function getUid(){
	return (Math.random() * 1e9 >>> 0) + (counter++);
};
},{}],34:[function(require,module,exports){
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


//per-context cache of texture/attributes
var texturesCache = new WeakMap();
var attributesCache = new WeakMap();


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
	this.initialViewport = this.viewport;

	//if no canvas defined - create new fullscreen canvas
	if (!this.canvas) {
		if (this.context && this.context.canvas) {
			this.canvas = this.context.canvas;
		}
		else if (isBrowser) {
			this.canvas = document.createElement('canvas');
		} else {
			this.canvas = {};
		}
	}

	if (typeof this.context === 'string') {
		this.context = getContext(this.context, {
			canvas: this.canvas,
			premultipliedAlpha: !!this.premultipliedAlpha,
			antialias: !!this.antialias,
			alpha: !!this.alpha
		});
	}

	//null-container means background renderer, so only undefined is recognized as default
	if (this.container === undefined) {
		this.container = this.canvas.parentNode || (isBrowser ? document.body : {});
		this.container.appendChild(this.canvas);
	}

	this.is2d = !this.context.drawingBufferHeight;

	var gl = this.gl = this.context;

	//cache of textures/attributes
	this.textures = extend({}, this.textures);
	this.attributes = extend({position: [-1,-1, -1,4, 4,-1]}, this.attributes);

	//setup webgl context
	if (!this.is2d) {
		if (this.float) {
			var float = gl.getExtension('OES_texture_float');
			if (!float) throw Error('WebGL does not support floats.');
			var floatLinear = gl.getExtension('OES_texture_float_linear');
			if (!floatLinear) throw Error('WebGL does not support floats.');
		}

		this.program = this.createProgram(this.vert, this.frag);

		//preset passed attributes
		this.setAttribute(this.attributes);

		gl.linkProgram(this.program);

		//stub textures with empty data (to avoid errors)
		var numUniforms = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
		for(var i=0; i<numUniforms; ++i) {
			var info = gl.getActiveUniform(this$1.program, i);
			if (info && info.type === gl.SAMPLER_2D) {
				if (!this$1.textures[info.name]) {
					this$1.textures[info.name] = null
				}
			}
		}
		//preset textures
		this.setTexture(this.textures);

		gl.useProgram(this.program);

		this.viewportLocation = gl.getUniformLocation(this.program, 'viewport');
	}

	//set canvas fit container size
	if (isBrowser) {
		this.fit = fit(this.canvas, this.container);
		this.resize = this.resize.bind(this);

		this.resize();
		window.addEventListener('resize', this.resize, false);
	}


	//create raf loop
	this.engine = loop(function (dt) { return this$1.render(); });
	this.autostart && this.start();
}


inherits(Component, Emitter);


/**
 * Create and use webgl or 2d context
 */
Component.prototype.context = 'webgl';

Component.prototype.autostart = true;

Component.prototype.antialias = true;
Component.prototype.alpha = true;
Component.prototype.premultipliedAlpha = true;


Component.prototype.vert = "\n\tattribute vec2 position;\n\tvoid main () {\n\t\tgl_Position = vec4(position, 0, 1);\n\t}\n";


Component.prototype.frag = "\n\tprecision mediump float;\n\tuniform vec4 viewport;\n\tvoid main () {\n\t\tgl_FragColor = vec4(gl_FragCoord.xy / viewport.zw, 1, 1);\n\t}\n";


//enable floating-point textures
Component.prototype.float = true;


/**
 * Set texture
 */
Component.prototype.setTexture = function (a, b) {
	var this$1 = this;

	if (this.is2d) return this;

	if (arguments.length === 2 || typeof a === 'string') {
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
		if (obj && !isPlainObject(obj)) {
			obj = this.textures[name] = {name: name, data: obj};
		}
		else if (obj && obj.data === opts[name]) {
			continue;
		}

		//check if passed some data/image-like object for the texture or settings object
		var opt = isPlainObject(opts[name]) ? opts[name] : {data: opts[name]};

		//if no object - create and bind texture
		if (!obj) {
			obj = this.textures[name] = {name: name};
		}

		if (!obj.name) obj.name = name;

		if (!obj.texture) {
			obj.texture = gl.createTexture();
		}

		if (!obj.location) {
			obj.location = gl.getUniformLocation(this.program, name);
		}

		if (obj.unit == null || opt.unit != null) {
			var textureCount = texturesCache.get(this.context) || 0;
			obj.unit = opt.unit != null ? opt.unit : textureCount++;
			textureCount = Math.max(textureCount, obj.unit);
			texturesCache.set(this.context, textureCount);
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
		if (isBrowser) {
			if (typeof data === 'string') {
				if (data === (obj.data && obj.data._src) || data === (obj.data && obj.data.src)) {
					return this;
				}
				var image = new Image;
				image.src = data;
				image._src = data;
			}
			else if (data instanceof Image && !data.complete) {
				var image = data;
			}

			if (image) {
				if (image.complete && image === obj.data || image.src === obj.data.src) {
					return this;
				}
				image.addEventListener('load', function () {
					this$1.setTexture(obj.name, image)
				});
				data = [0, 0, 0, 1];
			}
		}

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



//create and set buffer
Component.prototype.setAttribute = function (a, b) {
	if (this.is2d) return this;

	if (arguments.length === 2 || typeof a === 'string') {
		var opts = {};
		opts[a] = b;
	}
	else {
		var opts = a || {position: [-1,-1, -1,4, 4,-1]};
	}

	var gl = this.context;

	gl.useProgram(this.program);

	for (var name in opts) {
		var obj = this.attributes[name];
		if (obj && !isPlainObject(obj)) {
			obj = this.attributes[name] = {name: name, data: obj};
		}
		else if (obj && obj.data === opts[name]) {
			continue;
		}

		//if object exists and ony the data passed - just update buffer data
		if (obj) {
			if (opts[name] && obj.data && !isPlainObject(opts[name]) && opts[name].length <= obj.data.length) {
				if (obj.target === gl.ELEMENT_ARRAY_BUFFER) {
					obj.data = new Uint16Array(opts[name]);
				}
				else if (obj.type === gl.FLOAT) {
					obj.data = new Float32Array(opts[name]);
				}
				else if (obj.type === gl.UNSIGNED_BYTE) {
					obj.data = new Uint8Array(opts[name]);
				}

				gl.bufferSubData(obj.target, 0, obj.data);
				return this;
			}
		}
		//if no object - create and bind texture
		else {
			obj = this.attributes[name] = {name: name};
		}

		if (!obj.name) obj.name = name;

		//check if passed some data/image-like object for the texture or settings object
		var opt = isPlainObject(opts[name]) ? opts[name] : {data: opts[name]};

		extend(obj, opt);

		if (!obj.target) {
			obj.target = gl.ARRAY_BUFFER;
		}

		if (!obj.data) {
			obj.data = [-1,-1,-1,4,4,-1]
		}

		if (!obj.buffer) {
			obj.buffer = gl.createBuffer();
		}

		if (!obj.usage) {
			obj.usage = gl.STATIC_DRAW;
		}

		if (obj.index == null) {
			var attrCount = attributesCache.get(this.context) || 0;
			obj.index = attrCount++;
			attrCount = Math.max(attrCount, obj.index);
			attributesCache.set(this.context, attrCount);
		}

		if (!obj.size) {
			obj.size = 2;
		}

		if (!obj.type) {
			obj.type = obj.target === gl.ELEMENT_ARRAY_BUFFER ? gl.UNSIGNED_SHORT : gl.FLOAT;
		}

		if (obj.type === gl.FLOAT) {
			obj.data = new Float32Array(obj.data);
		}
		else if (obj.type === gl.UNSIGNED_BYTE) {
			obj.data = new Uint8Array(obj.data);
		}
		else if (obj.type === gl.UNSIGNED_SHORT) {
			obj.data =  new Uint16Array(obj.data);
		}

		if (obj.normalized == null) {
			obj.normalized = false;
		}

		if (obj.stride == null) {
			obj.stride = 0;
		}

		if (obj.offset == null) {
			obj.offset = 0;
		}

		gl.bindBuffer(obj.target, obj.buffer);
		gl.bufferData(obj.target, obj.data, obj.usage);
		gl.enableVertexAttribArray(obj.index);
		gl.vertexAttribPointer(obj.index, obj.size, obj.type, obj.normalized, obj.stride, obj.offset);
		gl.bindAttribLocation(this.program, obj.index, obj.name);
	}

	return this;
}



/**
 * Do resize routine
 */
Component.prototype.resize = function () {
	var gl = this.context;

	this.fit();

	var w = this.canvas.width, h = this.canvas.height;

	//if vp is undefined - set it as full-height
	if (!this.initialViewport) {
		this.viewport = [0, 0, w, h];
	}
	else if (this.initialViewport instanceof Function) {
		this.viewport = this.initialViewport(w, h);
	}
	else {
		this.viewport = this.initialViewport;
	}

	if (!this.is2d) {
		//this trickery inverts viewport Y
		var top = h-(this.viewport[3]+this.viewport[1]);
		this.glViewport = [this.viewport[0], top, this.viewport[2], this.viewport[3] + Math.min(top, 0)];

		gl.useProgram(this.program);
		gl.uniform4fv(this.viewportLocation, this.glViewport);
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
Component.prototype.start = function () {
	this.engine.start();
	return this;
};


/**
 * Render main loop
 */
Component.prototype.render = function () {
	var gl = this.context;


	if (!this.is2d) {
		//save viewport
		// var viewport = gl.getParameter(gl.VIEWPORT);

		gl.viewport.apply(gl, this.glViewport);

		this.emit('render');
		this.draw();

		// gl.viewport.apply(gl, viewport);
	}
	else {
		this.emit('render');
	}

	return this;
};

/**
 * A specific way to draw data.
 */
Component.prototype.draw = function () {

	this.gl.useProgram(this.program);
	//Q: how should we organize drawArrays method?
	//1. we may want to avoid calling it - how?
	//2. we may want to change draw mode
	//3. we may want to draw a specific subset of data
	//a. place everything to event loop, cept this method
	//   - that disables outside `.render` invocation
	//b. provide `.drawMode` param
	//   - that is a bad pattern (diff to remember, god object, too declarative)
	//   - still unable to cancel invocation
	//c. how about a separate `.draw` method?
	//   - a bit of a headache for users to discern render and draw
	//   + though pattern is simple: .render for call, not overriding, draw is for redefinition, not call. Also draw may take params.
	this.gl.drawArrays(this.gl.TRIANGLES, 0, this.attributes.position.data.length / this.attributes.position.size);

	return this;
}


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


},{"canvas-fit":17,"events":4,"get-canvas-context":32,"inherits":36,"is-browser":38,"mutype/is-object":49,"raf-loop":53,"xtend/mutable":63}],35:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window;
} else if (typeof global !== "undefined") {
    module.exports = global;
} else {
    module.exports = {};
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],36:[function(require,module,exports){
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

},{}],37:[function(require,module,exports){
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

},{}],38:[function(require,module,exports){
module.exports = true;
},{}],39:[function(require,module,exports){
module.exports = isFunction

var toString = Object.prototype.toString

function isFunction (fn) {
  var string = toString.call(fn)
  return string === '[object Function]' ||
    (typeof fn === 'function' && string !== '[object RegExp]') ||
    (typeof window !== 'undefined' &&
     // IE8 and below
     (fn === window.setTimeout ||
      fn === window.alert ||
      fn === window.confirm ||
      fn === window.prompt))
};

},{}],40:[function(require,module,exports){
module.exports = isMobile;

function isMobile (ua) {
  if (!ua && typeof navigator != 'undefined') ua = navigator.userAgent;
  if (ua && ua.headers && typeof ua.headers['user-agent'] == 'string') {
    ua = ua.headers['user-agent'];
  }
  if (typeof ua != 'string') return false;

  return /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(ua) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(ua.substr(0,4));
}


},{}],41:[function(require,module,exports){

/**
 * Expose `isUrl`.
 */

module.exports = isUrl;

/**
 * Matcher.
 */

var matcher = /^(?:\w+:)?\/\/([^\s\.]+\.\S{2}|localhost[\:?\d]*)\S*$/;

/**
 * Loosely validate a URL `string`.
 *
 * @param {String} string
 * @return {Boolean}
 */

function isUrl(string){
  return matcher.test(string);
}

},{}],42:[function(require,module,exports){
'use strict';
module.exports = leftPad;

var cache = [
  '',
  ' ',
  '  ',
  '   ',
  '    ',
  '     ',
  '      ',
  '       ',
  '        ',
  '         '
];

function leftPad (str, len, ch) {
  // convert `str` to `string`
  str = str + '';

  // doesn't need to pad
  len = len - str.length;
  if (len <= 0) return str;

  // convert `ch` to `string`
  if (!ch && ch !== 0) ch = ' ';
  ch = ch + '';
  if(ch === ' ' && len < 10) return cache[len] + str;
  var pad = '';
  while (true) {
    if (len & 1) pad += ch;
    len >>= 1;
    if (len) ch += ch;
    else break;
  }
  return pad + str;
}

},{}],43:[function(require,module,exports){
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
},{"./wrap":48}],44:[function(require,module,exports){
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
},{}],45:[function(require,module,exports){
/**
 * Base 10 logarithm
 *
 * @module mumath/lg
 */
module.exports = require('./wrap')(function (a) {
	return Math.log(a) / Math.log(10);
});
},{"./wrap":48}],46:[function(require,module,exports){
/**
 * @module mumath/order
 */
module.exports = require('./wrap')(function (n) {
	n = Math.abs(n);
	var order = Math.floor(Math.log(n) / Math.LN10 + 0.000000001);
	return Math.pow(10,order);
});
},{"./wrap":48}],47:[function(require,module,exports){
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
},{"./wrap":48}],48:[function(require,module,exports){
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
},{}],49:[function(require,module,exports){
/**
 * @module mutype/is-object
 */

//TODO: add st8 tests

//isPlainObject indeed
module.exports = function(o){
	// return obj === Object(obj);
	return !!o && typeof o === 'object' && o.constructor === Object;
};

},{}],50:[function(require,module,exports){
var trim = require('trim')
  , forEach = require('for-each')
  , isArray = function(arg) {
      return Object.prototype.toString.call(arg) === '[object Array]';
    }

module.exports = function (headers) {
  if (!headers)
    return {}

  var result = {}

  forEach(
      trim(headers).split('\n')
    , function (row) {
        var index = row.indexOf(':')
          , key = trim(row.slice(0, index)).toLowerCase()
          , value = trim(row.slice(index + 1))

        if (typeof(result[key]) === 'undefined') {
          result[key] = value
        } else if (isArray(result[key])) {
          result[key].push(value)
        } else {
          result[key] = [ result[key], value ]
        }
      }
  )

  return result
}
},{"for-each":30,"trim":61}],51:[function(require,module,exports){
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
},{"_process":6}],52:[function(require,module,exports){
/**
 * @module  plot-grid
 */

var extend = require('xtend');
var isBrowser = require('is-browser');
var lg = require('mumath/lg');
var Emitter = require('events').EventEmitter;
var inherits = require('inherits');
var sf = 0;
var className = ((require('insert-css')("._6290cd5b {\r\n\tposition: relative;\r\n}\r\n\r\n._6290cd5b .grid {\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\tbottom: 0;\r\n\tright: 0;\r\n\tpointer-events: none;\r\n}\r\n._6290cd5b .grid-lines {\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\tbottom: 0;\r\n\tright: 0;\r\n\toverflow: hidden;\r\n\tpointer-events: none;\r\n}\r\n\r\n._6290cd5b .grid-line {\r\n\tpointer-events: all;\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\twidth: .5rem;\r\n\theight: .5rem;\r\n\topacity: .135;\r\n}\r\n._6290cd5b .grid-line[hidden] {\r\n\tdisplay: none;\r\n}\r\n._6290cd5b .grid-line:hover {\r\n\topacity: .27;\r\n}\r\n\r\n._6290cd5b .grid-line-x {\r\n\theight: 100%;\r\n\twidth: 0;\r\n\tborder-left: 1px dotted;\r\n\tmargin-left: -1px;\r\n}\r\n._6290cd5b .grid-line-x:after {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\twidth: .5rem;\r\n\ttop: 0;\r\n\tbottom: 0;\r\n\tleft: -.25rem;\r\n}\r\n._6290cd5b .grid-line-x.grid-line-min {\r\n\tmargin-left: 0px;\r\n}\r\n\r\n._6290cd5b .grid-line-y {\r\n\twidth: 100%;\r\n\theight: 0;\r\n\tmargin-top: -1px;\r\n\tborder-top: 1px dotted;\r\n}\r\n._6290cd5b .grid-line-y:after {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\theight: .5rem;\r\n\tleft: 0;\r\n\tright: 0;\r\n\ttop: -.25rem;\r\n}\r\n._6290cd5b .grid-line-y.grid-line-max {\r\n\tmargin-top: 0px;\r\n}\r\n\r\n._6290cd5b .grid-axis {\r\n\tposition: absolute;\r\n}\r\n._6290cd5b .grid-axis-x {\r\n\ttop: auto;\r\n\tbottom: 0;\r\n\tright: 0;\r\n\tleft: 0;\r\n\tborder-bottom: 2px solid;\r\n\tmargin-bottom: -.5rem;\r\n}\r\n._6290cd5b .grid-axis-y {\r\n\tborder-left: 2px solid;\r\n\tright: auto;\r\n\ttop: 0;\r\n\tbottom: 0;\r\n\tleft: -1px;\r\n    margin-left: -.5rem;\r\n}\r\n\r\n._6290cd5b .grid-label {\r\n\tposition: absolute;\r\n\ttop: auto;\r\n\tleft: auto;\r\n\tmin-height: 1rem;\r\n\tfont-size: .8rem;\r\n\tfont-family: sans-serif;\r\n\tpointer-events: all;\r\n}\r\n._6290cd5b .grid-label-x {\r\n\tbottom: auto;\r\n\ttop: 100%;\r\n\tmargin-top: 1.5rem;\r\n\twidth: 2rem;\r\n\tmargin-left: -1rem;\r\n\ttext-align: center;\r\n}\r\n._6290cd5b .grid-label-x:before {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\theight: .5rem;\r\n\twidth: 0;\r\n\tborder-left: 2px solid;\r\n\ttop: -1rem;\r\n\tmargin-left: -1px;\r\n\tmargin-top: -2px;\r\n\tleft: 1rem;\r\n}\r\n\r\n._6290cd5b .grid-label-y {\r\n    right: 100%;\r\n    margin-right: 1.5rem;\r\n    margin-top: -.5rem;\r\n}\r\n._6290cd5b .grid-label-y:before {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\twidth: .5rem;\r\n\theight: 0;\r\n\tborder-top: 2px solid;\r\n\tright: -1rem;\r\n\ttop: .4rem;\r\n\tmargin-right: -1px;\r\n}\r\n") || true) && "_6290cd5b");
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

	this.gridElement = document.createElement('div');
	this.gridElement.classList.add('grid');
	this.container.appendChild(this.gridElement);

	//ensure lines values
	this.lines = (options.lines || []).map(function (lines) { return lines && extend(this$1.defaultLines, lines); });
	this.axes = (options.axes || []).map(function (axis) { return axis && extend(this$1.defaultAxis, axis); });

	//create lines container
	this.linesContainer = document.createElement('div');
	this.gridElement.appendChild(this.linesContainer);
	this.linesContainer.classList.add('grid-lines');

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

	var gridElement = this.gridElement;
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

	gridElement.style.left = viewport[0] + (typeof viewport[0] === 'number' ? 'px' : '');
	gridElement.style.top = viewport[1] + (typeof viewport[1] === 'number' ? 'px' : '');
	gridElement.style.width = viewport[2] + (typeof viewport[2] === 'number' ? 'px' : '');
	gridElement.style.height = viewport[3] + (typeof viewport[3] === 'number' ? 'px' : '');

	//exceptional case of overflow:hidden
	// if (this.container === document.body) {
	// 	if (viewport[2] >= window.innerWidth || viewport[3] >= window.innerHeight) {
	// 		linesContainer.style.overflow = 'hidden';
	// 	}
	// 	else {
	// 		linesContainer.style.overflow = 'visible';
	// 	}
	// }

	//hide all lines first
	var lines = gridElement.querySelectorAll('.grid-line');
	for (var i = 0; i < lines.length; i++) {
		lines[i].setAttribute('hidden', true);
	}
	var labels = gridElement.querySelectorAll('.grid-label');
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

		if (options.lines) {
			if (options.lines[idx] && options.lines[idx].style) {
				this.lines[idx].style = extend(this.lines[idx].style, options.lines[idx].style);
				delete options.lines[idx].style;
			}
			lines = extend(this.lines[idx], options.lines[idx]);
		}
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
			var line = linesContainer.querySelector(("#grid-line-" + (lines.orientation) + (lines.logarithmic?'-log':'') + "-" + (value|0) + "-" + idx + "-" + id));
			var ratio;
			if (!line) {
				line = document.createElement('span');
				line.id = "grid-line-" + (lines.orientation) + (lines.logarithmic?'-log':'') + "-" + (value|0) + "-" + idx + "-" + id;
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
		var axisEl = gridElement.querySelector(("#grid-axis-" + (lines.orientation) + (lines.logarithmic?'-log':'') + "-" + idx + "-" + id));
		if (!axisEl) {
			axisEl = document.createElement('span');
			axisEl.id = "grid-axis-" + (lines.orientation) + (lines.logarithmic?'-log':'') + "-" + idx + "-" + id;
			axisEl.classList.add('grid-axis');
			axisEl.classList.add(("grid-axis-" + (lines.orientation)));
			axisEl.setAttribute('data-name', axis.name);
			axisEl.setAttribute('title', axis.name);
			gridElement.appendChild(axisEl);
		}
		axisEl.removeAttribute('hidden');

		//draw labels
		axisValues.forEach(function (value, i) {
			if (value == null || labels[i] == null) return;

			var label = gridElement.querySelector(("#grid-label-" + (lines.orientation) + (lines.logarithmic?'-log':'') + "-" + (value|0) + "-" + idx + "-" + id));
			if (!label) {
				label = document.createElement('label');
				label.id = "grid-label-" + (lines.orientation) + (lines.logarithmic?'-log':'') + "-" + (value|0) + "-" + idx + "-" + id;
				label.classList.add('grid-label');
				label.classList.add(("grid-label-" + (lines.orientation)));
				label.setAttribute('data-value', value);
				label.setAttribute('for', ("grid-line-" + (lines.orientation) + (lines.logarithmic?'-log':'') + "-" + (value|0) + "-" + idx + "-" + id));
				axisTitles && label.setAttribute('title', axisTitles[i]);
				label.innerHTML = labels[i];
				gridElement.appendChild(label);
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
},{"events":4,"get-uid":33,"inherits":36,"insert-css":37,"is-browser":38,"mumath/closest":44,"mumath/lg":45,"mumath/order":46,"mumath/within":47,"xtend":62}],53:[function(require,module,exports){
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
},{"events":4,"inherits":36,"raf":54,"right-now":55}],54:[function(require,module,exports){
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
},{"performance-now":51}],55:[function(require,module,exports){
(function (global){
module.exports =
  global.performance &&
  global.performance.now ? function now() {
    return performance.now()
  } : Date.now || function now() {
    return +new Date
  }

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],56:[function(require,module,exports){
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

},{}],57:[function(require,module,exports){
/**
 * @module audio-demo
 */
var Emitter = require('events').EventEmitter;
var inherits = require('inherits');
var extend = require('xtend/mutable');
var sf = 0;
var className = ((require('insert-css')("._99a524de {\r\n\tmin-height: 100vh;\r\n\tmargin: 0;\r\n\tfont-family: sans-serif;\r\n\tbox-sizing: border-box;\r\n}\r\n\r\n._99a524de * {\r\n\tbox-sizing: border-box;\r\n}\r\n\r\n._99a524de a {\r\n\tcolor: inherit;\r\n}\r\n\r\n._99a524de [hidden] {\r\n\tdisplay: none!important;\r\n}\r\n\r\n._99a524de:after {\r\n\tcontent: '';\r\n}\r\n._99a524de.dragover:after {\r\n\tcontent: '⎗';\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tbottom: 0;\r\n\tleft: 0;\r\n\tright: 0;\r\n\tmargin: auto;\r\n\twidth: 20vh;\r\n\theight: 20vh;\r\n\tz-index: 2;\r\n\tfont-size: 20vh;\r\n\ttext-align: center;\r\n\tline-height: 20vh;\r\n\tdisplay: block;\r\n}\r\n\r\n._99a524de.dragover:before {\r\n\tcontent: '';\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\tright: 0;\r\n\tbottom: 0;\r\n\tmargin: 0;\r\n\tborder: .2rem dashed;\r\n\tz-index: 1;\r\n\tdisplay: block;\r\n}\r\n\r\n._99a524de.dragover .source {\r\n}\r\n\r\n._99a524de .source {\r\n\tmargin: 0;\r\n\tpadding: 0;\r\n\tposition: absolute;\r\n\ttop: .75rem;\r\n\tleft: .75rem;\r\n\tdisplay: block;\r\n\tline-height: 1.5rem;\r\n\tfont-size: .9rem;\r\n\tmax-width: 100%;\r\n\tborder: none;\r\n\tbox-shadow: none;\r\n\toutline: none;\r\n\tfill: currentColor;\r\n\tz-index: 999;\r\n}\r\n._99a524de .source-input {\r\n\tmargin: 0;\r\n\tpadding: 0;\r\n\tborder: 0;\r\n\tdisplay: inline;\r\n\tvertical-align: baseline;\r\n\tline-height: 1rem;\r\n\theight: 1rem;\r\n\tfont-size: .9rem;\r\n\tmax-width: 100%;\r\n\tborder: none;\r\n\tbox-shadow: none;\r\n\tfont-weight: bolder;\r\n\toutline: none;\r\n\tbackground: none;\r\n\t-webkit-appearance: none;\r\n\tappearance: none;\r\n\tborder-radius: 0;\r\n\tbox-shadow: 0 2px;\r\n\tcolor: inherit;\r\n}\r\n._99a524de .source-input:focus{\r\n\toutline: none;\r\n}\r\n._99a524de .source-input-file {\r\n\tposition: absolute;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\tbottom: 0;\r\n\tright: 0;\r\n\topacity: 0;\r\n\tborder: none;\r\n\tcursor: pointer;\r\n}\r\n._99a524de .source-input-url {\r\n\tfont-family: sans-serif;\r\n\tfont-weight: bold;\r\n\tmin-width: 40vw;\r\n}\r\n._99a524de .source-input-url:focus {\r\n}\r\n._99a524de input[type=file],\r\n._99a524de input[type=file]::-webkit-file-upload-button {\r\n\tcursor: pointer;\r\n}\r\n._99a524de i {\r\n\tfill: currentColor;\r\n}\r\n._99a524de .source i {\r\n\twidth: 1.5rem;\r\n\theight: 1.5rem;\r\n\tdisplay: inline-block;\r\n\tposition: relative;\r\n}\r\n._99a524de .source i svg {\r\n\tmargin-bottom: -.52rem;\r\n}\r\n._99a524de i svg {\r\n\tmax-width: 100%;\r\n\tmax-height: 100%;\r\n}\r\n._99a524de .source-link {\r\n\tposition: relative;\r\n\tfont-weight: bold;\r\n\ttext-decoration: none;\r\n\tbox-shadow: 0px 2px;\r\n\twhite-space: nowrap;\r\n\tcursor: pointer;\r\n}\r\n\r\n._99a524de .text-length-limiter {\r\n\tdisplay: inline-block;\r\n\tmax-width: 40vw;\r\n\tvertical-align: top;\r\n\twhite-space: nowrap;\r\n\ttext-overflow: ellipsis;\r\n\toverflow: hidden;\r\n}\r\n._99a524de .source-title {\r\n\tdisplay: inline;\r\n}\r\n\r\n._99a524de .fps {\r\n\tposition: fixed;\r\n\ttop: .75rem;\r\n\tright: .75rem;\r\n\tline-height: 1.5rem;\r\n\tfont-size: .9rem;\r\n\tz-index: 999;\r\n}\r\n\r\n\r\n._99a524de .fps-canvas {\r\n\theight: 1rem;\r\n\twidth: 2rem;\r\n\tdisplay: inline-block;\r\n\tvertical-align: baseline;\r\n\tmargin-right: .15rem;\r\n\tmargin-bottom: -.15rem;\r\n}\r\n\r\n._99a524de .fps-text {\r\n}\r\n\r\n._99a524de .fps-value {\r\n}\r\n\r\n._99a524de .audio-playback {\r\n\r\n}\r\n\r\n._99a524de .progress {\r\n\tposition: fixed;\r\n\ttop: 0;\r\n\tleft: 0;\r\n\theight: .2rem;\r\n\tbackground: currentColor;\r\n\ttransition: .1s linear width;\r\n\tz-index: 999;\r\n}\r\n\r\n@media (max-width: 640px) {\r\n\t._99a524de .text-length-limiter {\r\n\t\tmax-width: 30%;\r\n\t}\r\n\t._99a524de .source {\r\n\t\tright: .75rem;\r\n\t\ttext-align: center;\r\n\t}\r\n\t._99a524de .fps {\r\n\t\ttop: auto;\r\n\t\tbottom: .75rem;\r\n\t\tright: .75rem;\r\n\t\tleft: .75rem;\r\n\t\ttext-align: center;\r\n\t}\r\n}") || true) && "_99a524de");
var ctx = require('audio-context');

var raf = require('raf');
var now = require('right-now');
var colorParse = require('color-parse');
var hsl = require('color-space/hsl');
var pad = require('left-pad');
var isMobile = require('is-mobile')();
var xhr = require('xhr');
var isUrl = require('is-url');

module.exports = StartApp;



/**
 * @constructor
 */
function StartApp (opts, cb) {
	var this$1 = this;

	if (!(this instanceof StartApp)) return new StartApp(opts, cb);

	var self = this;

	extend(this, opts);

	//ensure container
	if (!this.container) this.container = document.body || document.documentElement;
	this.container.classList.add(className);

	//create container
	this.sourceEl = document.createElement('div');
	this.sourceEl.classList.add('source');
	this.container.appendChild(this.sourceEl);

	//create dynamic style
	this.styleEl = document.createElement('style');
	(document.head || document.documentElement).appendChild(this.styleEl);

	this.setColor(this.color);

	//add mobile metas
	if (isMobile && this.mobile) {
		var metaEl = document.createElement('meta');
		metaEl.setAttribute('name', 'viewport');
		metaEl.setAttribute('content', 'width=device-width, initial-scale=1, shrink-to-fit=no, user-scalable=no');
		(document.head || document.documentElement).appendChild(metaEl);

		metaEl = document.createElement('meta');
		metaEl.setAttribute('name', 'apple-mobile-web-app-capable');
		metaEl.setAttribute('content', 'yes');
		(document.head || document.documentElement).appendChild(metaEl);

		setTimeout(function () {
			window.scrollTo(0, 0);
		}, 0);
	}

	//create layout
	this.sourceEl.innerHTML = "\n\t\t<i class=\"source-icon\">" + (this.icons.loading) + "</i>\n\t\t<span class=\"source-text\"></span>\n\t\t<a href=\"#audio\" class=\"audio-playback\" hidden><i class=\"audio-icon\">" + (this.icons.play) + "</i></a><a href=\"#stop\" class=\"audio-stop\" title=\"Reset\" hidden><i class=\"audio-icon\">" + (this.icons.eject) + "</i></a>\n\t";
	this.sourceIcon = this.sourceEl.querySelector('.source-icon');
	this.sourceText = this.sourceEl.querySelector('.source-text');
	this.sourceIcon.innerHTML = this.file ? this.icons.open : this.url ? this.icons.url : this.mic ? this.icons.mic : this.icons.open;

	this.sourceText.innerHTML = "\n\t\t<span class=\"source-links\">\n\t\t\t<a href=\"#open-file\" " + (this.file ? '' : 'hidden') + " class=\"source-link source-link-file\">Open file</a>" + (this.file && this.url && this.mic ? ',' : this.file && (this.url || this.mic) ? ' or' : '') + "\n\t\t\t<a href=\"#enter-url\" " + (this.url ? '' : 'hidden') + " class=\"source-link source-link-url\">enter URL</a>\n\t\t\t" + (this.url && this.mic ? ' or' : '') + "\n\t\t\t<a href=\"#enable-mic\" " + (this.mic ? '' : 'hidden') + " class=\"source-link source-link-mic\">\n\t\t\t\tenable microphone\n\t\t\t</a>\n\t\t</span>\n\t\t<input class=\"source-input source-input-file\" hidden type=\"file\"/>\n\t\t<input placeholder=\"http://url.to/audio\" hidden class=\"source-input source-input-url\" type=\"url\" value=\"" + (this.source || '') + "\"/>\n\t\t<strong class=\"source-title\"></strong>\n\t";
	this.sourceTitle = this.sourceEl.querySelector('.source-title');
	this.sourceLinks = this.sourceEl.querySelector('.source-links');
	this.sourceInputFile = this.sourceEl.querySelector('.source-input-file');
	this.sourceEl.querySelector('.source-link-file').addEventListener('click', function (e) {
		e.preventDefault();
		this$1.sourceInputFile.click();
	});
	this.sourceInputFile.addEventListener('change', function (e) {
		if (!this$1.sourceInputFile.files.length) return this$1;
		this$1.setSource(this$1.sourceInputFile.files);
	});
	this.sourceInputURL = this.sourceEl.querySelector('.source-input-url');
	var lastURL;
	this.sourceInputURL.addEventListener('focus', function (e) {
		lastURL = this$1.sourceInputURL.value;
	});
	this.sourceInputURL.addEventListener('blur', function (e) {
		//if nothing changed - blur
		if (lastURL === this$1.sourceInputURL.value) {
			this$1.showInput();
		}
	});
	this.sourceInputURL.addEventListener('change', function (e) {
		e.preventDefault();
		this$1.hideInput();
		this$1.sourceIcon.innerHTML = this$1.icons.loading;
		this$1.sourceTitle.innerHTML = "loading";
		this$1.sourceInputURL.setAttribute('hidden', true);
		this$1.setSource(this$1.sourceInputURL.value, function (err) {
			this$1.hideInput();
			//in case of error allow second chance
			if (err) {
				this$1.sourceTitle.innerHTML = "";
				this$1.sourceInputURL.removeAttribute('hidden');
				this$1.sourceIcon.innerHTML = this$1.icons.url;
				return;
			}
		});
	});
	this.sourceEl.querySelector('.source-link-url').addEventListener('click', function (e) {
		e.preventDefault();
		this$1.hideInput();
		this$1.sourceInputURL.removeAttribute('hidden');
		this$1.sourceInputURL.focus();
		this$1.sourceIcon.innerHTML = this$1.icons.url;
	});
	this.sourceInputMic = this.sourceEl.querySelector('.source-link-mic');
	this.sourceInputMic.addEventListener('click', function (e) {
		e.preventDefault();

		if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
			navigator.mediaDevices.getUserMedia({audio: true, video: false})
			.then(enableMic).catch(errMic);
		}
		else {
			try {
				navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia);
				navigator.getUserMedia({audio: true, video: false}, enableMic, errMic);
			} catch (e) {
				errMic(e);
			}
		}

		function enableMic(stream) {
			self.hideInput();
			self.sourceTitle.innerHTML = "Microphone";
			self.sourceIcon.innerHTML = self.icons.mic;

			self.audio.src = URL.createObjectURL(stream);
			self.play();
			self.audioStop.querySelector('i').innerHTML = self.icons.stop;
			self.audioStop.removeAttribute('hidden');
		}
		function errMic (err) {
			self.hideInput();
			self.sourceTitle.innerHTML = err;//`microphone is not allowed`;
			self.sourceIcon.innerHTML = self.icons.error;
			setTimeout(function () {
				if (!self.source) self.showInput();
				cb && cb(new Error('Microphone is not allowed'));
			}, 1000);
		}
	});

	//init audio
	var audio = this.audio = new Audio();
	this.audio.loop = this.loop;
	this.audio.crossOrigin = 'Anonymous';
	this.audioEl = this.sourceEl.querySelector('.audio-playback');
	this.audioStop = this.sourceEl.querySelector('.audio-stop');
	this.audioIcon = this.sourceEl.querySelector('.audio-icon');
	this.audio.addEventListener('canplay', function () {
		this$1.source && this$1.autoplay && this$1.play();
	});
	this.audioEl.addEventListener('click', function (e) {
		e.preventDefault();
		if (this$1.audio.paused) {
			this$1.play();
		}
		else {
			this$1.pause();
		}
	});
	this.audioStop.addEventListener('click', function (e) {
		this$1.reset();
	});

	//init progress bar
	var progress = this.progressEl = document.createElement('div');
	this.progressEl.classList.add('progress');
	if (!this.progress) this.progressEl.setAttribute('hidden', true);
	this.progressEl.setAttribute('title', '00:00');
	this.container.appendChild(progress);
	setInterval(function () {
		if (this$1.audio) {
			progress.style.width = ((audio.currentTime / audio.duration * 100) || 0) + '%';
			progress.setAttribute('title', ((this$1.getTime(this$1.audio.currentTime)) + " / " + (this$1.getTime(this$1.audio.duration)) + " played"));
		}
	}, 500)


	//init fps
	this.fpsEl = document.createElement('div');
	this.fpsEl.classList.add('fps');
	this.fpsEl.setAttribute('hidden', true);
	this.fpsEl.innerHTML = "\n\t\t<canvas class=\"fps-canvas\"></canvas>\n\t\t<span class=\"fps-text\">\n\t\t\tfps <span class=\"fps-value\">60.0</span>\n\t\t</span>\n\t";
	this.fpsCanvas = this.fpsEl.querySelector('.fps-canvas');
	var fpsValue = this.fpsValue = this.fpsEl.querySelector('.fps-value');
	this.container.appendChild(this.fpsEl);

	var w = this.fpsCanvas.width = parseInt(getComputedStyle(this.fpsCanvas).width) || 1;
	var h = this.fpsCanvas.height = parseInt(getComputedStyle(this.fpsCanvas).height) || 1;

	var ctx = this.fpsCanvas.getContext('2d');
	var count = 0;
	var last = 0;
	var len = this.fpsCanvas.width;
	var values = Array(len).fill(0);
	var updatePeriod = 1000;
	var maxFPS = 100;
	var that = this;

	//enable update routine
	raf(function measure () {
		count++;
		var t = now();
		if (t - last > updatePeriod) {
			var color = that.color;
			var transparentColor = that.transparentColor;
			last = t;
			values.push((count) / (maxFPS * updatePeriod * 0.001));
			values = values.slice(-len);
			count = 0;

			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = color;
			for (var i = 0; i < len; i++) {
				ctx.fillRect(i, h - h * values[i], 1, h * values[i]);
			}

			fpsValue.innerHTML = (values[values.length - 1]*maxFPS).toFixed(1);
		}

		raf(measure);
	});


	this.update();

	setTimeout(function () {
		if (this$1.source) {
			this$1.setSource(this$1.source, function (err) {
				if (err) this$1.showInput();
				cb && cb(null, this$1.source);
			});
		}
		else {
			cb && cb(null, this$1.source);
		}
	});
}

inherits(StartApp, Emitter);

//Allow dropping files to browser
StartApp.prototype.dragAndDrop = true;

//Enable file select
StartApp.prototype.file = true;

//Enable url select
StartApp.prototype.url = true;

//Enable mic input
StartApp.prototype.mic = !!(navigator.mediaDevices || navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia);

//Default (my) soundcloud API token
StartApp.prototype.token = {
	soundcloud: '6b7ae5b9df6a0eb3fcca34cc3bb0ef14',
	youtube: 'AIzaSyBPxsJRzvSSz_LOpejJhOGPyEzlRxU062M'
};

//display micro fps counter
StartApp.prototype.fps = true;

//autostart play
StartApp.prototype.autoplay = true;
StartApp.prototype.loop = true;

//enable progress indicator
StartApp.prototype.progress = true;

//icon paths
StartApp.prototype.icons = {
	record: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"819\" height=\"1024\" viewBox=\"0 0 819 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M757.76 818.347h-696.32c-29.013 0-52.907-23.893-52.907-52.907v-532.48c0-29.013 23.893-52.907 52.907-52.907h696.32c29.013 0 52.907 23.893 52.907 52.907v532.48c0 29.013-23.893 52.907-52.907 52.907zM75.093 751.787h669.013v-505.173h-669.013v505.173z\"></path>\n<path d=\"M574.293 636.588c-69.973 0-128-56.32-128-126.293s56.32-126.293 128-126.293c69.973 0 128 56.32 128 126.293s-58.027 126.293-128 126.293zM574.293 450.561c-32.427 0-59.733 27.307-59.733 59.733s27.307 59.733 59.733 59.733 59.733-27.307 59.733-59.733-27.307-59.733-59.733-59.733z\"></path>\n<path d=\"M241.493 636.588c-69.973 0-128-56.32-128-126.293s56.32-126.293 128-126.293c69.973 0 128 56.32 128 126.293s-58.027 126.293-128 126.293zM241.493 450.561c-32.427 0-59.733 27.307-59.733 59.733s27.307 59.733 59.733 59.733c32.427 0 59.733-27.307 59.733-59.733s-27.307-59.733-59.733-59.733z\"></path>\n<path d=\"M572.607 450.113h-332.8c-18.773 0-34.133-14.88-34.133-33.067s15.36-33.067 34.133-33.067h332.8c18.773 0 34.133 14.88 34.133 33.067s-17.067 33.067-34.133 33.067z\"></path>\n</svg>\n",
	error: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"819\" height=\"1024\" viewBox=\"0 0 819 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M807.303 756.637l-351.17-607.966c-9.601-16.582-27.188-26.702-46.308-26.702-0.074 0-0.143 0-0.208 0s-0.143 0-0.208 0c-19.112 0-36.699 10.12-46.308 26.702l-351.186 607.966c-9.564 16.643-9.564 37.104 0 53.706 9.511 16.61 27.209 26.775 46.525 26.775h702.348c19.308 0 37.014-10.165 46.525-26.775 9.564-16.598 9.564-37.087-0.008-53.706zM89.419 765.556l320.193-554.297 320.193 554.297h-640.382z\"></path>\n<path d=\"M540.178 663.195l-72.859-74.216 70.995-71.763-57.871-57.242-70.161 70.926-70.746-72.058-58.075 57.025 71.584 72.904-73.991 74.804 57.863 57.242 73.157-73.946 72.033 73.353z\"></path>\n</svg>\n",
	soundcloud: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"1206\" height=\"1024\" viewBox=\"0 0 1206 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M54.937 674.845c0 13.601 4.925 23.883 14.799 30.861 9.861 6.973 20.4 9.443 31.63 7.391 10.545-2.033 17.938-5.785 22.187-11.229 4.246-5.445 6.37-14.459 6.37-27.037v-147.916c0-10.545-3.66-19.475-10.963-26.771-7.315-7.315-16.244-10.963-26.771-10.963-10.203 0-18.954 3.66-26.276 10.963s-10.963 16.244-10.963 26.771v147.916zM172.25 738.092c0 9.861 3.479 17.261 10.461 22.187s15.903 7.391 26.771 7.391c11.229 0 20.311-2.463 27.292-7.391 6.973-4.924 10.461-12.331 10.461-22.187v-344.801c0-10.203-3.662-18.956-10.963-26.276-7.315-7.315-16.245-10.963-26.771-10.963-10.203 0-18.956 3.662-26.276 10.963-7.315 7.315-10.963 16.062-10.963 26.276v344.801zM289.060 754.417c0 9.861 3.569 17.261 10.708 22.187 7.139 4.924 16.321 7.391 27.541 7.391 10.887 0 19.813-2.463 26.771-7.391 6.973-4.925 10.462-12.331 10.462-22.187v-314.708c0-10.545-3.662-19.551-10.963-27.037-7.315-7.477-16.062-11.228-26.276-11.228-10.545 0-19.551 3.743-27.037 11.228s-11.229 16.493-11.229 27.037v314.708zM406.369 755.939c0 18.708 12.584 28.062 37.752 28.062s37.751-9.354 37.751-28.062v-510.062c0-28.557-8.676-44.708-26.011-48.461-11.229-2.717-22.277 0.513-33.155 9.692s-16.321 22.097-16.321 38.769v510.062zM525.728 770.737v-554.954c0-17.689 5.263-28.216 15.815-31.63 22.781-5.445 45.391-8.155 67.845-8.155 52.028 0 100.491 12.245 145.37 36.727 44.891 24.491 81.187 57.893 108.893 100.226 27.721 42.34 43.785 89.014 48.203 140.012 20.739-8.835 42.845-13.262 66.306-13.262 47.602 0 88.331 16.831 122.155 50.493 33.839 33.664 50.749 74.125 50.749 121.392 0 47.602-16.923 88.245-50.749 121.907s-74.385 50.493-121.658 50.493l-443.755-0.513c-3.059-1.016-5.356-2.893-6.893-5.605s-2.299-5.11-2.299-7.142z\"></path>\n</svg>\n",
	open: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"819\" height=\"1024\" viewBox=\"0 0 819 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M799.019 413.071c-13.274-16.986-33.621-26.933-55.195-26.933v-140.089c0-38.664-31.379-70.045-70.045-70.045h-140.089c-38.664 0-70.045 31.379-70.045 70.045h-350.222c-38.664 0-70.045 31.379-70.045 70.045v420.267c0 38.664 31.379 70.045 70.045 70.045h560.355c32.466 0 59.503-22.205 67.453-52.149 0.105-0.315 0.456-0.595 0.525-0.875l70.045-280.178c5.218-20.944 0.49-43.147-12.783-60.133zM113.424 316.095h420.267v-70.045h140.089v140.089h-490.311c-32.15 0-60.168 21.889-67.943 53.059l-2.101 8.336v-131.438zM673.781 736.361h-560.355l70.045-280.178h560.355l-70.045 280.178z\"></path>\n</svg>\n",
	loading: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"819\" height=\"1024\" viewBox=\"0 0 819 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M640.327 412.161c-45.569 0-82.591 37.025-82.591 85.44s37.025 85.44 82.591 85.44c45.569 0 82.591-37.025 82.591-85.44s-37.025-85.44-82.591-85.44zM409.639 412.161c-45.569 0-82.591 37.025-82.591 85.44s37.025 85.44 82.591 85.44c45.569 0 82.591-37.025 82.591-85.44s-37.025-85.44-82.591-85.44zM178.951 412.161c-45.569 0-82.591 37.025-82.591 85.44s37.025 85.44 82.591 85.44c45.569 0 82.591-37.025 82.591-85.44s-37.025-85.44-82.591-85.44z\"></path>\n</svg>\n",
	url: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"819\" height=\"1024\" viewBox=\"0 0 819 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M407.776 122.436c-199.872 0-362.496 162.624-362.496 362.496s162.624 362.496 362.496 362.496 362.496-162.624 362.496-362.496-162.624-362.496-362.496-362.496zM407.776 791.652c-39.826 0-83.1-74.988-101.902-187.459 32.351-4.849 66.514-7.709 101.902-7.709s69.551 2.9 101.902 7.709c-18.801 112.471-62.075 187.459-101.902 187.459zM407.776 540.708c-37.837 0-74.271 2.989-108.846 8.152-1.764-20.485-2.674-41.864-2.674-63.896s0.91-43.411 2.674-63.896c34.574 5.164 71.009 8.152 108.846 8.152s74.271-2.989 108.846-8.152c1.764 20.485 2.674 41.864 2.674 63.896s-0.91 43.411-2.674 63.896c-34.574-5.164-71.009-8.152-108.846-8.152zM101.056 484.932c0-42.775 8.797-83.471 24.738-120.445 32.174 19.486 72.596 34.896 117.948 45.9-2.175 23.885-3.262 48.848-3.262 74.586s1.087 50.612 3.262 74.586c-45.409 11.052-85.775 26.374-117.948 45.9-15.91-37.023-24.738-77.751-24.738-120.526zM407.776 178.212c39.826 0 83.1 74.988 101.902 187.459-32.351 4.809-66.474 7.709-101.902 7.709s-69.551-2.9-101.902-7.709c18.801-112.471 62.075-187.459 101.902-187.459zM571.842 410.346c45.409-11.052 85.726-26.374 117.948-45.9 15.853 36.886 24.738 77.614 24.738 120.389s-8.797 83.471-24.738 120.437c-32.222-19.478-72.596-34.977-117.948-45.9 2.175-23.876 3.262-48.848 3.262-74.586s-1.087-50.476-3.262-74.408zM663.102 315.276c-26.188 16.361-59.852 29.813-98.51 39.609-10.69-63.936-29.137-118.222-53.198-158.314 62.349 22.515 115.499 64.387 151.709 118.673zM304.191 196.603c-24.062 40.060-42.509 94.346-53.198 158.314-38.69-9.828-72.322-23.248-98.51-39.609 36.209-54.286 89.359-96.158 151.709-118.673zM152.482 654.661c26.188-16.401 59.852-29.821 98.51-39.649 10.69 63.936 29.137 118.222 53.198 158.322-62.349-22.563-115.499-64.436-151.709-118.673zM511.361 773.334c24.062-40.1 42.509-94.386 53.198-158.322 38.69 9.828 72.322 23.248 98.51 39.649-36.209 54.237-89.359 96.11-151.709 118.673z\"></path>\n</svg>\n",
	mic: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"819\" height=\"1024\" viewBox=\"0 0 819 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M409.618 681.692c114.138 0 206.667-92.529 206.667-206.667v-165.333c0-114.138-92.529-206.667-206.667-206.667s-206.667 92.529-206.667 206.667v165.333c0 114.138 92.529 206.667 206.667 206.667z\"></path>\n<path d=\"M368.285 844.589v85.104h82.667v-85.104c185.707-20.667 330.667-178.44 330.667-369.563v-82.667h-82.667v82.667c0 159.547-129.83 289.333-289.333 289.333s-289.333-129.787-289.333-289.333v-82.667h-82.667v82.667c0 191.124 144.96 348.94 330.667 369.563z\"></path>\n</svg>\n",
	play: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"819\" height=\"1024\" viewBox=\"0 0 819 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M236.256 289.447c0-26.093 21.148-47.248 47.241-47.248 8.109 0 13.243 2.118 22.273 5.714l331.371 192.797c15.414 9.136 22.545 23.813 25.295 40.725v4.748c-2.758 16.904-9.891 31.585-25.295 40.725l-331.363 192.789c-9.045 3.604-14.179 5.706-22.273 5.706-26.093 0-47.241-21.155-47.241-47.248v-388.723z\"></path>\n</svg>\n",
	pause: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"819\" height=\"1024\" viewBox=\"0 0 819 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M186.54 304.268c0-25.055 20.319-45.372 45.387-45.372h95.385c25.055 0 45.387 20.319 45.387 45.372v360.448c0 25.060-20.319 45.38-45.387 45.38h-95.385c-25.055 0-45.387-20.319-45.387-45.38v-360.448z\"></path>\n<path d=\"M446.44 304.268c0-25.055 20.319-45.372 45.359-45.372h95.387c25.055 0 45.364 20.319 45.364 45.372v360.448c0 25.060-20.312 45.38-45.364 45.38h-95.387c-25.050 0-45.364-20.319-45.364-45.38v-360.448z\"></path>\n</svg>\n",
	stop: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"819\" height=\"1024\" viewBox=\"0 0 819 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M183.954 319.128c0-28.864 23.393-52.253 52.261-52.253h346.679c28.864 0 52.261 23.393 52.261 52.253v346.687c0 28.864-23.393 52.261-52.261 52.261h-346.679c-28.864 0-52.261-23.394-52.261-52.261v-346.687z\"></path>\n</svg>\n",
	eject: "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- Generated by IcoMoon.io -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"819\" height=\"1024\" viewBox=\"0 0 819 1024\">\n<g id=\"icomoon-ignore\">\n</g>\n<path d=\"M631.487 257.578l-311.033 199.782c-8.736 5.828-12.814 14.564-12.814 23.879s4.078 18.053 12.814 23.879l311.612 200.361c18.642 12.235 43.68-1.166 43.68-23.879v-400.142c-0.579-22.718-25.050-36.114-44.27-23.879z\"></path>\n<path d=\"M249.975 252.331h-40.772c-31.457 0-57.083 25.629-57.083 57.083v343.648c0 31.457 25.629 57.083 57.083 57.083h40.772c31.457 0 57.083-25.629 57.083-57.083v-343.648c0-31.457-25.629-57.083-57.083-57.083z\"></path>\n</svg>\n"
};

//do mobile routines
StartApp.prototype.mobile = true;


/**
 * Init settings
 */
StartApp.prototype.update = function (opts) {
	var this$1 = this;

	extend(this, opts);

	if (this.color) {
		this.setColor(this.color);
	}

	if (this.dragAndDrop && !this.isDnD) {
		this.isDnD = true;
		var title, icon, target;

		this.container.addEventListener('dragstart', function (e) {
			//ignore dragging the container
			//FIXME: maybe we need a bit more specifics here, by components
			e.preventDefault();
			return false;
		}, false);
		this.container.addEventListener('dragenter', function (e) {
			if (target) return;
			target = e.target;
			// if (e.target != this.container) return;

			this$1.container.classList.add('dragover');
			e.dataTransfer.dropEffect = 'copy';

			//save initial values
			title = this$1.sourceTitle.innerHTML;
			icon = this$1.sourceIcon.innerHTML;

			var dt = e.dataTransfer;
			var list = dt.files, src;

			this$1.hideInput();
			this$1.sourceTitle.innerHTML = "drop audio file";
			this$1.sourceIcon.innerHTML = this$1.icons.record;
		});

		this.container.addEventListener('dragleave', function (e) {
			if (e.target != this$1.container) return;

			target = null;
			this$1.container.classList.remove('dragover');
			if (this$1.source) {
				this$1.sourceTitle.innerHTML = title;
				this$1.sourceIcon.innerHTML = icon;
			}
			else {
				this$1.showInput();
			}
		}, false);

		this.container.addEventListener('drop', function (e) {
			e.preventDefault();
			this$1.container.classList.remove('dragover');
			target = null;

			var dt = e.dataTransfer;
			this$1.setSource(dt.files, function (err, data) {
				if (err) {
					this$1.sourceTitle.innerHTML = title;
					this$1.sourceIcon.innerHTML = icon;
				}
			});
		}, false);

		this.container.addEventListener('dragover', function (e) {
			e.preventDefault();
		}, false);
	}

	if (this.fps) {
		this.fpsEl.removeAttribute('hidden');
	}
	else {
		this.fpsEl.setAttribute('hidden', true);
	}

	if (this.time) {

	}

	return this;
};


//inner method for setting color
StartApp.prototype.setColor = function (color) {
	this.color = color = color || this.color;

	var parsed = colorParse(color);

	if (parsed.space === 'hsl') {
		var values = hsl.rgb(parsed.values);
	}
	else {
		var values = parsed.values;
	}
	this.colorValues = values;
	this.color = "rgba(" + (values.join(', ')) + ", " + (parsed.alpha) + ")";
	this.inverseColor = "rgba(" + (values.map(function (v) { return 255 - v; }).join(', ')) + ", " + (parsed.alpha) + ")";
	this.transparentColor = "rgba(" + (values.join(', ')) + ", 0.1)";
	this.semiTransparentColor = "rgba(" + (values.join(', ')) + ", 0.25)";

	this.styleEl.innerHTML = "\n\t\t." + className + " {\n\t\t\tcolor: " + (this.color) + ";\n\t\t}\n\t\t." + className + " .source-input,\n\t\t." + className + " .source-link\n\t\t{\n\t\t\tbox-shadow: 0 2px " + (this.semiTransparentColor) + ";\n\t\t}\n\t\t." + className + " .source-input:focus,\n\t\t." + className + " .source-link:hover\n\t\t{\n\t\t\tbox-shadow: 0 2px " + (this.color) + ";\n\t\t}\n\n\t\t::selection{\n\t\t\tbackground: " + (this.semiTransparentColor) + ";\n\t\t\tcolor: " + (this.inverseColor) + ";\n\t\t}\n\t\t::-moz-selection{\n\t\t\tbackground: " + (this.semiTransparentColor) + ";\n\t\t\tcolor: " + (this.inverseColor) + ";\n\t\t}\n\n\t\t." + className + " .fps-canvas { background:" + (this.transparentColor) + "; }\n\n\t\t::-moz-placeholder { color:" + (this.semiTransparentColor) + "; }\n\t\tinput:-moz-placeholder { color:" + (this.semiTransparentColor) + "; }\n\t\t:-ms-input-placeholder { color:" + (this.semiTransparentColor) + "; }\n\t\t::-webkit-input-placeholder { color:" + (this.semiTransparentColor) + "; }\n\t";

	return this;
};


/**
 * Set source to play
 */
StartApp.prototype.setSource = function (src, cb) {
	var this$1 = this;

	var self = this;

	//Undefined source - no action
	if (!src) {
		return this;
	}

	this.hideInput();

	//find first audio file from the list
	if (src instanceof FileList) {
		var list = src;
		src = null;

		for (var i = 0; i < list.length; i++) {
			if (/audio/.test(list[i].type)) {
				src = list[i];
				break;
			}
		}

		if (!src) {
			this.sourceTitle.innerHTML = "not an audio";
			this.sourceIcon.innerHTML = this.icons.error;
			setTimeout(function () {
				if (!this$1.source) this$1.showInput();
				cb && cb(new Error('Not an audio'));
			}, 1000);
			return this;
		}
	}

	//File instance case
	if (src instanceof File) {
		var url = URL.createObjectURL(src);
		this.sourceIcon.innerHTML = this.icons.record;
		this.sourceTitle.innerHTML = "<a class=\"source-link\" href=\"" + url + "\" target=\"_blank\" title=\"" + (src.name) + "\"><span class=\"text-length-limiter\">" + (src.name) + "</span></a>";

		this.source = url;

		this.audio.src = url;
		this.audioEl.removeAttribute('hidden');
		this.audioStop.removeAttribute('hidden');

		this.emit('source', url);
		cb && cb(null, url);

		return this;
	}


	if (/soundcloud/.test(src)) {
		this.sourceIcon.innerHTML = this.icons.loading;
		this.sourceTitle.innerHTML = 'connecting to soundcloud';
		var token = this.token.soundcloud || this.token;

		//sad ios workaround
		if (isMobile) {
			xhr({
				uri: ("https://api.soundcloud.com/resolve.json?client_id=" + (this.token.soundcloud || this.token) + "&url=" + src + "&format=json"),
				method: 'GET'
			}, function () {
				xhr({
					uri: ("https://api.soundcloud.com/resolve.json?client_id=" + (this$1.token.soundcloud || this$1.token) + "&url=" + src + "&_status_code_map[302]=200&format=json"),
					method: 'GET'
				}, function (err, response) {
					if (err) return badURL(err);

					var obj = JSON.parse(response.body);
					xhr({
						uri: obj.location,
						method: 'GET'
					}, function (err, response) {
						if (err) return badURL(err);

						var json = JSON.parse(response.body);

						setSoundcloud(json);
					});
				});
			});
		}

		else {
			xhr({
				uri: ("https://api.soundcloud.com/resolve.json?client_id=" + (this.token.soundcloud || this.token) + "&url=" + src),
				method: 'GET'
			}, function (err, response) {
				if (err) {
					return badURL(err);
				}

				var json = JSON.parse(response.body);

				setSoundcloud(json);
			});
		}

		function setSoundcloud (json) {
			var streamUrl = json.stream_url + '?client_id=' + token;

			self.sourceIcon.innerHTML = self.icons.soundcloud;

			//FIXME: play list of tracks properly
			if (json.tracks) {
				var id = Math.floor(Math.random() * json.tracks.length);
				return self.setSource(json.tracks[id].permalink_url, cb);
			}

			var maxTitle = window.innerWidth * .05;
			self.sourceTitle.innerHTML = "\n\t\t\t\t<a class=\"source-link\" href=\"" + (json.permalink_url) + "\" target=\"_blank\" title=\"" + (json.title) + "\"><span class=\"text-length-limiter\">" + (json.title) + "</span></a>\n\t\t\t";
			if (json.user) {
				self.sourceTitle.innerHTML += "by\n\t\t\t\t<a class=\"source-link\" href=\"" + (json.user.permalink_url) + "\" target=\"_blank\" title=\"" + (json.user.username) + "\"><span class=\"text-length-limiter\">" + (json.user.username) + "</span></a>\n\t\t\t\t";
			}

			self.source = streamUrl;

			self.audio.src = streamUrl;
			self.audioEl.removeAttribute('hidden');
			self.audioStop.removeAttribute('hidden');

			self.emit('source', streamUrl);

			cb && cb(null, streamUrl);
		}
	}

	// else if (/youtu/.test(url.hostname)) {
	// 	this.sourceIcon.innerHTML = this.icons.loading;
	// 	this.sourceTitle.innerHTML = 'connecting to youtube';
	// 	var token = this.token.youtube || this.token;


	// 	self.source = url.href;
	// 	self.audio.src = url.href;
	//
	// 	self.audioEl.removeAttribute('hidden');
	// 	self.audioStop.removeAttribute('hidden');
	// }

	//default url
	else {
		if (!isUrl(src)) {
			badURL();
			return this;
		}

		xhr({
			url: src,
			method: 'GET',
		}, function (err, resp) {
			if (err) return badURL(err);

			//FIXME: here actually possible to handle websockets/stuff, not the stupid method below
			self.source = src;

			self.sourceTitle.innerHTML = "\n\t\t\t\t<a class=\"source-link\" href=\"" + src + "\" target=\"_blank\" title=\"Open " + src + "\"><span class=\"text-length-limiter\">" + src + "</span></a>\n\t\t\t";
			self.audio.src = src;
			self.audioEl.removeAttribute('hidden');
			self.audioStop.removeAttribute('hidden');

			this$1.emit('source', src);
			cb && cb(null, src);
		});
	}

	function badURL (err) {
		self.sourceTitle.innerHTML = err || "bad URL";
		self.sourceIcon.innerHTML = self.icons.error;
		setTimeout(function () {
			cb && cb('Bad url');
		}, 1000);
	}

	return this;
};

/**
 * Show/hide source input default view
 */
StartApp.prototype.showInput = function () {
	this.sourceLinks.removeAttribute('hidden');
	this.sourceInputURL.setAttribute('hidden', true);
	this.sourceIcon.innerHTML = this.file ? this.icons.open : this.url ? this.icons.url : this.mic ? this.icons.mic : this.icons.open;
	this.sourceTitle.innerHTML = '';
	this.audioEl.setAttribute('hidden', true);

	return this;
}

StartApp.prototype.hideInput = function () {
	this.sourceLinks.setAttribute('hidden', true);

	return this;
};


/**
 * Play/stop/reset audio
 */
StartApp.prototype.play = function () {
	this.audio.play();
	this.audioEl.title = "Pause";
	this.audioIcon.innerHTML = this.icons.pause;
	this.audioStop.setAttribute('hidden', true);

	return this;
}
StartApp.prototype.pause = function () {
	this.audio.pause();
	this.audioEl.title = "Play";
	this.audioIcon.innerHTML = this.icons.play;
	this.audioStop.removeAttribute('hidden');

	return this;
}
StartApp.prototype.reset = function () {
	this.source = '';
	this.sourceTitle.innerHTML = '';
	this.sourceInputURL.value = '';
	this.audio.currentTime = 0;

	this.audio.src = '';
	this.pause();
	this.audioStop.querySelector('i').innerHTML = this.icons.eject;
	this.audioStop.setAttribute('hidden', true);
	this.showInput();
}
StartApp.prototype.getTime = function (time) {
	return pad((time / 60)|0, 2, 0) + ':' + pad((time % 60)|0, 2, 0);
}
},{"audio-context":16,"color-parse":20,"color-space/hsl":21,"events":4,"inherits":36,"insert-css":37,"is-mobile":40,"is-url":41,"left-pad":42,"raf":54,"right-now":55,"xhr":60,"xtend/mutable":63}],58:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window;
} else if (typeof global !== "undefined") {
    module.exports = global;
} else if (typeof self !== "undefined"){
    module.exports = self;
} else {
    module.exports = {};
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],59:[function(require,module,exports){
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

},{}],60:[function(require,module,exports){
"use strict";
var window = require("global/window")
var once = require("once")
var isFunction = require("is-function")
var parseHeaders = require("parse-headers")
var xtend = require("xtend")

module.exports = createXHR
createXHR.XMLHttpRequest = window.XMLHttpRequest || noop
createXHR.XDomainRequest = "withCredentials" in (new createXHR.XMLHttpRequest()) ? createXHR.XMLHttpRequest : window.XDomainRequest

forEachArray(["get", "put", "post", "patch", "head", "delete"], function(method) {
    createXHR[method === "delete" ? "del" : method] = function(uri, options, callback) {
        options = initParams(uri, options, callback)
        options.method = method.toUpperCase()
        return _createXHR(options)
    }
})

function forEachArray(array, iterator) {
    for (var i = 0; i < array.length; i++) {
        iterator(array[i])
    }
}

function isEmpty(obj){
    for(var i in obj){
        if(obj.hasOwnProperty(i)) return false
    }
    return true
}

function initParams(uri, options, callback) {
    var params = uri

    if (isFunction(options)) {
        callback = options
        if (typeof uri === "string") {
            params = {uri:uri}
        }
    } else {
        params = xtend(options, {uri: uri})
    }

    params.callback = callback
    return params
}

function createXHR(uri, options, callback) {
    options = initParams(uri, options, callback)
    return _createXHR(options)
}

function _createXHR(options) {
    var callback = options.callback
    if(typeof callback === "undefined"){
        throw new Error("callback argument missing")
    }
    callback = once(callback)

    function readystatechange() {
        if (xhr.readyState === 4) {
            loadFunc()
        }
    }

    function getBody() {
        // Chrome with requestType=blob throws errors arround when even testing access to responseText
        var body = undefined

        if (xhr.response) {
            body = xhr.response
        } else if (xhr.responseType === "text" || !xhr.responseType) {
            body = xhr.responseText || xhr.responseXML
        }

        if (isJson) {
            try {
                body = JSON.parse(body)
            } catch (e) {}
        }

        return body
    }

    var failureResponse = {
                body: undefined,
                headers: {},
                statusCode: 0,
                method: method,
                url: uri,
                rawRequest: xhr
            }

    function errorFunc(evt) {
        clearTimeout(timeoutTimer)
        if(!(evt instanceof Error)){
            evt = new Error("" + (evt || "Unknown XMLHttpRequest Error") )
        }
        evt.statusCode = 0
        callback(evt, failureResponse)
    }

    // will load the data & process the response in a special response object
    function loadFunc() {
        if (aborted) return
        var status
        clearTimeout(timeoutTimer)
        if(options.useXDR && xhr.status===undefined) {
            //IE8 CORS GET successful response doesn't have a status field, but body is fine
            status = 200
        } else {
            status = (xhr.status === 1223 ? 204 : xhr.status)
        }
        var response = failureResponse
        var err = null

        if (status !== 0){
            response = {
                body: getBody(),
                statusCode: status,
                method: method,
                headers: {},
                url: uri,
                rawRequest: xhr
            }
            if(xhr.getAllResponseHeaders){ //remember xhr can in fact be XDR for CORS in IE
                response.headers = parseHeaders(xhr.getAllResponseHeaders())
            }
        } else {
            err = new Error("Internal XMLHttpRequest Error")
        }
        callback(err, response, response.body)

    }

    var xhr = options.xhr || null

    if (!xhr) {
        if (options.cors || options.useXDR) {
            xhr = new createXHR.XDomainRequest()
        }else{
            xhr = new createXHR.XMLHttpRequest()
        }
    }

    var key
    var aborted
    var uri = xhr.url = options.uri || options.url
    var method = xhr.method = options.method || "GET"
    var body = options.body || options.data || null
    var headers = xhr.headers = options.headers || {}
    var sync = !!options.sync
    var isJson = false
    var timeoutTimer

    if ("json" in options) {
        isJson = true
        headers["accept"] || headers["Accept"] || (headers["Accept"] = "application/json") //Don't override existing accept header declared by user
        if (method !== "GET" && method !== "HEAD") {
            headers["content-type"] || headers["Content-Type"] || (headers["Content-Type"] = "application/json") //Don't override existing accept header declared by user
            body = JSON.stringify(options.json)
        }
    }

    xhr.onreadystatechange = readystatechange
    xhr.onload = loadFunc
    xhr.onerror = errorFunc
    // IE9 must have onprogress be set to a unique function.
    xhr.onprogress = function () {
        // IE must die
    }
    xhr.ontimeout = errorFunc
    xhr.open(method, uri, !sync, options.username, options.password)
    //has to be after open
    if(!sync) {
        xhr.withCredentials = !!options.withCredentials
    }
    // Cannot set timeout with sync request
    // not setting timeout on the xhr object, because of old webkits etc. not handling that correctly
    // both npm's request and jquery 1.x use this kind of timeout, so this is being consistent
    if (!sync && options.timeout > 0 ) {
        timeoutTimer = setTimeout(function(){
            aborted=true//IE9 may still call readystatechange
            xhr.abort("timeout")
            var e = new Error("XMLHttpRequest timeout")
            e.code = "ETIMEDOUT"
            errorFunc(e)
        }, options.timeout )
    }

    if (xhr.setRequestHeader) {
        for(key in headers){
            if(headers.hasOwnProperty(key)){
                xhr.setRequestHeader(key, headers[key])
            }
        }
    } else if (options.headers && !isEmpty(options.headers)) {
        throw new Error("Headers cannot be set on an XDomainRequest object")
    }

    if ("responseType" in options) {
        xhr.responseType = options.responseType
    }

    if ("beforeSend" in options &&
        typeof options.beforeSend === "function"
    ) {
        options.beforeSend(xhr)
    }

    xhr.send(body)

    return xhr


}

function noop() {}

},{"global/window":58,"is-function":39,"once":59,"parse-headers":50,"xtend":62}],61:[function(require,module,exports){

exports = module.exports = trim;

function trim(str){
  return str.replace(/^\s*|\s*$/g, '');
}

exports.left = function(str){
  return str.replace(/^\s*/, '');
};

exports.right = function(str){
  return str.replace(/\s*$/, '');
};

},{}],62:[function(require,module,exports){
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

},{}],63:[function(require,module,exports){
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

},{}],64:[function(require,module,exports){
// var test = require('tst');
// var Formant = require('audio-formant');
// var Speaker = require('audio-speaker');
// var Sink = require('audio-sink');
// var Slice = require('audio-slice');
var Spectrum = require('./');
var ft = require('fourier-transform');
var blackman = require('scijs-window-functions/blackman-harris');
var isBrowser = require('is-browser');
var db = require('decibels');
var colorScales = require('colormap/colorScales');
var startApp = require('start-app');
var ctx = require('audio-context');
// var createAudioContext = require('ios-safe-audio-context')


var app = startApp({
	color: '#E86F56',
	token: '6b7ae5b9df6a0eb3fcca34cc3bb0ef14',
	autoplay: true,
	// source: './Liwei.mp3',
	// source: 'https://soundcloud.com/wooded-events/wooded-podcast-cinthie',
	// source: 'https://soundcloud.com/compost/cbls-362-compost-black-label-sessions-tom-burclay',
	source: 'https://soundcloud.com/vertvrecords/trailer-mad-rey-hotel-la-chapelle-mp3-128kbit-s',
	// source: 'https://soundcloud.com/einmusik/einmusik-live-watergate-4th-may-2016',
	// source: 'https://soundcloud.com/when-we-dip/atish-mark-slee-manjumasi-mix-when-we-dip-062',
	// source: 'https://soundcloud.com/dark-textures/dt-darkambients-4',
	// source: 'https://soundcloud.com/deep-house-amsterdam/diynamic-festival-podcast-by-kollektiv-turmstrasse',
});



var source = ctx.createMediaElementSource(app.audio);
var analyser = ctx.createAnalyser();
analyser.frequencyBinCount = 2048;
analyser.smoothingTimeConstant = .1;
source.connect(analyser);
analyser.connect(ctx.destination);


//generate input sine
var N = 2048;
var sine = new Float32Array(N);
var saw = new Float32Array(N);
var noise = new Float32Array(N);
var rate = 44100;

for (var i = 0; i < N; i++) {
	sine[i] = Math.sin(10000 * Math.PI * 2 * (i / rate));
	saw[i] = 2 * ((1000 * i / rate) % 1) - 1;
	noise[i] = Math.random() * 2 - 1;
}

// var frequencies = ft(sine);
// var frequencies = new Float32Array(1024).fill(0.5);
// var frequencies = ft(noise);
//NOTE: ios does not allow setting too big this value
var frequencies = new Float32Array(analyser.frequencyBinCount);
for (var i = 0; i < frequencies.length; i++) frequencies[i] = -150;

// frequencies = frequencies
// .map((v, i) => v*blackman(i, noise.length))
// .map((v) => db.fromGain(v));

var spectrum = new Spectrum({
	// autostart: false,
	// frequencies: frequencies,
	fill: 'inferno',
	grid: true,
	minFrequency: 40,
	maxFrequency: 20000,
	logarithmic: true,
	// smoothing: .7,
	details: 1,
	maxDecibels: 0,
	mask: createMask(10, 10),
	align: .5,
	trail: 38,
	autostart: true,
	// balance: .5,
	// antialias: true,
	// fill: [1,1,1,0],
	// fill: './images/stretch.png',
	group: 6,
	// background: [27/255,0/255,37/255, 1],
	//background: [1,0,0,1]//'./images/bg-small.jpg'
	// viewport: function (w, h) {
	// 	return [50,20,w-70,h-60];
	// }
}).on('render', function () {
	// frequencies = ft(waveform.map((v, i) => v*blackman(i, waveform.length)));
	// frequencies = frequencies.map((f, i) => db.fromGain(f));

	analyser.getFloatFrequencyData(frequencies);
	spectrum.setFrequencies(frequencies);
});

createColormapSelector(spectrum);


// test('line webgl');

// test('bars 2d');

// test('node');

// test('viewport');

// test('clannels');

// test('classic');

// test('bars');

// test('bars line');

// test('dots');

// test('dots line');

// test('colormap (heatmap)');

// test('multilayered (max values)');

// test('line');

// test('oscilloscope');




function createColormapSelector (spectrum) {
	var container = document.createElement('div');
	container.style.position = 'fixed';
	container.style.bottom = '0';
	container.style.left = '0';
	container.style.right = '0';
	container.style.padding = '.5rem .75rem';
	container.style.border = '0';
	container.style.zIndex = 999;
	container.style.lineHeight = '1.5rem';
	container.style.fontSize = '.8rem';
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
	var html = '';
	for (var name in colorScales ) {
		if (name === 'alpha') continue;
		html += "<option value=\"" + name + "\"" + ((name === 'inferno') ? 'selected' : '') + ">" + name + "</option>"
	}
	switcher.innerHTML = html;
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
	weightingEl.style.marginRight = '1rem';
	weightingEl.style.fontSize = '.8rem';
	weightingEl.style.background = 'none';
	weightingEl.title = 'Noise weighting';
	weightingEl.innerHTML = "\n\t\t<option value=\"a\">A</option>\n\t\t<option value=\"b\">B</option>\n\t\t<option value=\"c\">C</option>\n\t\t<option value=\"d\">D</option>\n\t\t<option value=\"itu\" selected>ITU</option>\n\t\t<option value=\"z\">Z (none)</option>\n\t";
	weightingEl.addEventListener('input', function () {
		spectrum.weighting = weightingEl.value;

		updateView();
	});
	container.appendChild(weightingEl);


	//logarithmic
	var logSwitch = createSwitch('log', function () {
		spectrum.logarithmic = this.checked;
		updateView();
	});
	var logCheckbox = logSwitch.querySelector('input');
	logCheckbox.checked = true;
	container.appendChild(logSwitch);


	//align slider
	var alignEl = createSlider('align', function (v) {
		spectrum.align = v;
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


	//mask checkbox
	var maskSwitch = createSwitch('mask', function () {
		spectrum.setMask(this.checked ? createMask(10, 10) : null);
		updateView();
	});
	var maskCb = maskSwitch.querySelector('input');
	maskCb.checked = true;
	container.appendChild(
		maskSwitch
	);

	//group size
	var groupEl = createSlider({name: 'group', min: 0, max: 50, step: 1, value: spectrum.group}, function (v) {
		spectrum.group = v;
		updateView();
	});
	container.appendChild(groupEl);


	//trail slider
	var trailEl = createSlider({
		min: 0,
		max: 50,
		value: spectrum.trail,
		name: 'trail'
	}, function (v) {
		spectrum.trail = v;
		updateView();
	});
	container.appendChild(trailEl);


	//smoothing slider
	var smoothingEl = createSlider({
		min: 0,
		max: 1,
		value: spectrum.smoothing,
		name: 'smoothing'
	}, function (v) {
		spectrum.smoothing = v;
		updateView();
	});
	container.appendChild(smoothingEl);


	updateView();

	function updateView () {
		spectrum.update();
		if (Array.isArray(spectrum.fill)) {
			app.setColor('rgb(' + spectrum.fill.slice(-4, -1).map(function (v) { return v*255; }).join(', ') + ')');
		}
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
	checkbox.style.fontSize = '.8rem';

	switcher.style.fontSize = '.8rem';
	switcher.style.verticalAlign = 'middle';
	switcher.style.height = '1rem';
	switcher.classList.add(name + '-switcher');
	switcher.style.margin = '0 .5rem 0 0';
	switcher.style.border = '0';
	switcher.style.background = 'none';
	switcher.style.color = 'inherit';
	switcher.title = name;
	checkbox.addEventListener('click', cb);

	return switcher;
}


function createSlider (opts, cb) {
	opts = (typeof opts === 'string') ? {name: opts} : opts ? opts : {};
	var sliderEl = document.createElement('input');
	var title = opts.name.slice(0,1).toUpperCase() + opts.name.slice(1);
	sliderEl.type = 'range';
	sliderEl.min = opts.min || 0;
	sliderEl.max = opts.max || 1;
	sliderEl.step = opts.step || 0.01;
	sliderEl.value = opts.value || 0.5;
	sliderEl.classList.add(opts.name);
	sliderEl.style.width = '5rem';
	sliderEl.style.height = '1rem';
	sliderEl.style.border = '0';
	sliderEl.style.color = 'inherit';
	sliderEl.style.fontSize = '.8rem';
	sliderEl.style.margin = '0 1rem 0 0';
	sliderEl.style.verticalAlign = 'middle';
	sliderEl.style.background = 'none';
	sliderEl.title = title + ': ' + sliderEl.value;
	sliderEl.addEventListener('input', function () {
		var v = parseFloat(sliderEl.value);
		sliderEl.title = title + ': ' + v;
		cb(v);
	});
	return sliderEl;
}


//create mask
function createMask (w, h) {
	w = w || 10;
	h = h || 10;
	var rect = [w, h];
	var radius = w/1.5;
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

},{"./":7,"audio-context":16,"colormap/colorScales":23,"decibels":26,"fourier-transform":31,"is-browser":38,"scijs-window-functions/blackman-harris":56,"start-app":57}]},{},[64]);
