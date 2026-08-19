// Core type definitions for Sketchify

export interface AppState {
  artStyle: string;
  style: string;
  resolution: string;
  aspect: string;
  intensity: string;
  stroke: string;
  smoothing: string;
  brush: string;
  useWebGL: boolean;
  outputName: string;
  skipHatching: boolean;
  contrast: string;
  saturation: string;
  hueShift: string;
  colorize: boolean;
  textureType: string;
  textureOpacity: string;
}

export interface RenderParams {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  edges: Uint8ClampedArray;
  gray: Uint8ClampedArray;
  intensity: number;
  stroke: number;
  rand: RandFn;
  originalColors?: Uint8ClampedArray;
}

export type StyleRenderFn = (params: RenderParams) => void;

export type RandFn = () => number;

export interface StyleEntry {
  value: string;
  label: string;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}
