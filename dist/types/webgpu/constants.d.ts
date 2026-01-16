/**
 * Shared constants for WebGPU splat rendering pipeline.
 */
export declare const SPLAT_TEX_WIDTH_BITS = 11;
export declare const SPLAT_TEX_HEIGHT_BITS = 11;
export declare const SPLAT_TEX_DEPTH_BITS = 11;
export declare const SPLAT_TEX_LAYER_BITS: number;
export declare const SPLAT_TEX_WIDTH: number;
export declare const SPLAT_TEX_HEIGHT: number;
export declare const SPLAT_TEX_DEPTH: number;
export declare const SPLAT_TEX_WIDTH_MASK: number;
export declare const SPLAT_TEX_HEIGHT_MASK: number;
export declare const SPLAT_TEX_DEPTH_MASK: number;
export declare const LN_SCALE_MIN = -12;
export declare const LN_SCALE_MAX = 9;
export declare const PI = 3.14159265359;
export declare const RADIX_BITS = 8;
export declare const RADIX_SIZE: number;
export declare const RADIX_PASSES = 4;
export declare const WORKGROUP_SIZE = 256;
export declare const DEFAULT_MAX_SPLATS: number;
export declare const QUAD_CORNERS: readonly [readonly [-1, -1], readonly [1, -1], readonly [1, 1], readonly [-1, 1]];
export declare const QUAD_INDICES: readonly [0, 1, 2, 0, 2, 3];
