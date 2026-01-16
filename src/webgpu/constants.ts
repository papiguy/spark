/**
 * Shared constants for WebGPU splat rendering pipeline.
 */

// Texture layout constants - must match splatDefines.glsl
export const SPLAT_TEX_WIDTH_BITS = 11;
export const SPLAT_TEX_HEIGHT_BITS = 11;
export const SPLAT_TEX_DEPTH_BITS = 11;
export const SPLAT_TEX_LAYER_BITS =
  SPLAT_TEX_WIDTH_BITS + SPLAT_TEX_HEIGHT_BITS;

export const SPLAT_TEX_WIDTH = 1 << SPLAT_TEX_WIDTH_BITS; // 2048
export const SPLAT_TEX_HEIGHT = 1 << SPLAT_TEX_HEIGHT_BITS; // 2048
export const SPLAT_TEX_DEPTH = 1 << SPLAT_TEX_DEPTH_BITS; // 2048

export const SPLAT_TEX_WIDTH_MASK = SPLAT_TEX_WIDTH - 1; // 0x7FF
export const SPLAT_TEX_HEIGHT_MASK = SPLAT_TEX_HEIGHT - 1; // 0x7FF
export const SPLAT_TEX_DEPTH_MASK = SPLAT_TEX_DEPTH - 1; // 0x7FF

// Scale encoding constants
export const LN_SCALE_MIN = -12.0;
export const LN_SCALE_MAX = 9.0;

// Math constants
export const PI = 3.14159265359;

// Radix sort configuration
export const RADIX_BITS = 8;
export const RADIX_SIZE = 1 << RADIX_BITS; // 256 bins
export const RADIX_PASSES = 4; // 32-bit keys need 4 passes of 8 bits
export const WORKGROUP_SIZE = 256;

// Default maximum splats
export const DEFAULT_MAX_SPLATS = 1024 * 1024; // 1M splats

// Quad corner offsets (for generating 4 vertices per splat)
export const QUAD_CORNERS = [
  [-1, -1], // bottom-left
  [1, -1], // bottom-right
  [1, 1], // top-right
  [-1, 1], // top-left
] as const;

// Index pattern for two triangles forming a quad
export const QUAD_INDICES = [0, 1, 2, 0, 2, 3] as const;
