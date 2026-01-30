/**
 * WebGPU splat rendering material using TSL (Three.js Shading Language).
 * Implements Gaussian falloff in the fragment shader.
 */

import * as THREE from "three";
import { NodeMaterial, TSL } from "three/webgpu";

const {
  Discard,
  Fn,
  attribute,
  dot,
  exp,
  float,
  getCurrentStack,
  setCurrentStack,
  mul,
  positionLocal,
  varyingProperty,
  vec4,
} = TSL;

export interface WebGPUSplatMaterialOptions {
  /** Falloff multiplier for Gaussian (default: 1.0) */
  falloff?: number;
  /** Minimum alpha to render (default: 1/255) */
  minAlpha?: number;
  /** Use premultiplied alpha (default: true) */
  premultipliedAlpha?: boolean;
  /** Enable stochastic rendering (default: false) */
  stochastic?: boolean;
  /** Disable Gaussian falloff entirely (default: false) */
  disableFalloff?: boolean;
}

/**
 * Create a WebGPU material for splat rendering.
 * Expects geometry with:
 * - position: vec3 (NDC positions from compute pass)
 * - color: vec4 (RGBA from compute pass)
 * - uv: vec2 (local quad coordinates [-1,1] from compute pass)
 */
export function createWebGPUSplatMaterial(
  options: WebGPUSplatMaterialOptions = {},
): InstanceType<typeof NodeMaterial> {
  const {
    falloff = 1.0,
    minAlpha = 1.0 / 255.0,
    premultipliedAlpha = true,
    stochastic = false,
    disableFalloff = false,
  } = options;

  const material = new NodeMaterial();

  // Basic material settings
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = stochastic; // Write depth only for stochastic rendering
  material.side = THREE.DoubleSide;

  // Set up varyings from vertex to fragment shader
  // The vertex shader passes position through (already in NDC from compute)
  // and forwards color and uv to fragment shader

  // Use varyingProperty to pass data from vertex to fragment
  const vColor = varyingProperty("vec4", "vColor");
  const vUv = varyingProperty("vec2", "vUv");

  // Vertex shader: pass through position and forward attributes to fragment
  material.positionNode = Fn((builder: any) => {
    // WORKAROUND: Three.js TSL r182 may not set currentStack before Fn callback
    if (getCurrentStack() === null && builder?.stack?.isStackNode) {
      setCurrentStack(builder.stack);
    }

    // Get attributes from geometry (written by compute shader)
    const colorAttr = attribute("color");
    const uvAttr = attribute("uv");

    // Forward to fragment shader via varyings
    vColor.assign(colorAttr);
    vUv.assign(uvAttr);

    // Position is already in clip space from compute shader
    // Three.js expects local position, so we use it directly
    return positionLocal;
  })();

  // Fragment shader: Gaussian falloff
  material.colorNode = Fn(() => {
    const uv = vUv;
    const color = vColor;

    // Compute squared distance from center
    const distSq = dot(uv, uv);

    // Compute alpha with Gaussian falloff
    let alpha;
    if (disableFalloff) {
      alpha = color.w;
    } else {
      // exp(-0.5 * distSq * falloff)
      const gaussian = exp(mul(float(-0.5), mul(distSq, float(falloff))));
      alpha = mul(color.w, gaussian);
    }

    // Discard nearly transparent fragments
    Discard(alpha.lessThan(float(minAlpha)));

    // Output color
    if (premultipliedAlpha) {
      // Premultiplied alpha: rgb * alpha
      return vec4(mul(color.xyz, alpha), alpha);
    } else {
      return vec4(color.xyz, alpha);
    }
  })();

  // Set up blending
  if (premultipliedAlpha) {
    material.blending = THREE.CustomBlending;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  } else {
    material.blending = THREE.NormalBlending;
  }

  return material;
}

/**
 * Create a simple debug material for testing the compute pipeline.
 * Shows vertex colors without Gaussian falloff.
 */
export function createDebugSplatMaterial(): InstanceType<typeof NodeMaterial> {
  const material = new NodeMaterial();

  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;

  // Just pass through vertex colors
  material.colorNode = attribute("color");

  return material;
}
