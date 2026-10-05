/** CSS color string (any syntax the browser parses, oklch included) or [r, g, b, a?] with channels 0..1 */
export type Color = string | ArrayLike<number>

export type Scale = 'log' | 'mel' | 'erb' | 'lin'

export interface Options {
  /**
   * Levels in dB, one per bin, bin k at k · sampleRate / (2 · length) Hz, as AnalyserNode.getFloatFrequencyData gives.
   * A Float32Array is referenced, not copied: refill it and render again. Other array-likes are converted.
   * NaN is a gap; -Infinity the floor.
   */
  data?: ArrayLike<number> | null
  /** Hz. null: 44100. */
  sampleRate?: number | null
  /** Frequency axis. null: 'log'. */
  scale?: Scale | null
  /** Visible [low, high] in Hz, left to right. null: the scale's floor (20 Hz on log, else 0) to Nyquist. */
  band?: [number, number] | null
  /** [floor, top] in dB, mapped to level 0..1; levels past them clamp. null: [-100, 0]. */
  levels?: [number, number] | null
  /** Where level 0 sits: 0 the bottom, 1 the top, between a base the spectrum mirrors to both sides of. null: 0. */
  align?: number | null
  /** [x, y, width, height] in CSS px, top-left origin. null: the whole canvas. */
  viewport?: [number, number, number, number] | null
  /** Line color. null: default blue. */
  color?: Color | null
  /** Fill under the line: a color, or an array of colors as a colormap from the floor to the top; false hides it.
   *  null or true: the line color at a third of its opacity. */
  fill?: Color | Color[] | boolean | null
  /** Line width in CSS px, at least one device pixel. null: 1. */
  thickness?: number | null
  /** Device px per CSS px. null: devicePixelRatio. */
  pixelRatio?: number | null
}

export interface Bin {
  /** Bin index */
  bin: number
  /** Its frequency, Hz */
  frequency: number
  /** Its level, dB, as given */
  level: number
}

export interface Axis {
  /** The axis' floor, Hz */
  low: number
  /** Where f Hz sits between lo and hi, 0..1 */
  at(f: number, lo: number, hi: number): number
  /** The frequency at u, 0..1, between lo and hi */
  of(u: number, lo: number, hi: number): number
}

/** The frequency axes, for labels that match them */
export const scales: Record<Scale, Axis>

export default class Spectrum {
  /** A canvas (its WebGL2 context is created or reused) or a WebGL2 context shared with other renderers */
  constructor(target: HTMLCanvasElement | OffscreenCanvas | WebGL2RenderingContext, options?: Options)
  readonly gl: WebGL2RenderingContext
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  /** Number of bins */
  readonly length: number
  /** Resolved visible band, Hz */
  readonly band: [number, number]
  /** [floor, top], dB */
  readonly levels: [number, number]
  /** Change any option; undefined keeps, null restores the default */
  update(options: Options): this
  /** Draw into the viewport, over what is there; reads the data as it is now */
  render(): this
  /** Clear the viewport to transparent */
  clear(): this
  /**
   * The bin the column at x CSS px from the viewport's left shows: the loudest of the bins under it, or between bins the
   * nearest. null over a gap or outside the viewport.
   */
  pick(x: number): Bin | null
  /** Release the GPU textures, the data and the event listeners */
  destroy(): void
}
