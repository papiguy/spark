/**
 * SortComputePass: GPU-assisted sorting for splat ordering.
 *
 * This computes distance metrics for each splat on the GPU, reads them back
 * to CPU for sorting, then uploads the sorted indices back to GPU.
 *
 * The approach uses:
 * 1. GPU compute shader to calculate distances (parallel, fast)
 * 2. CPU radix sort for the actual sorting (reliable, well-tested)
 * 3. GPU storage buffer for sorted indices (used by render pass)
 *
 * The compute node is built ONCE and the texture is updated via uniform .value
 * to avoid repeated Fn() callback evaluation (which causes "No stack defined"
 * warnings when the TSL build context is not active).
 */

import * as THREE from "three";
import { TSL } from "three/webgpu";

const {
  Fn,
  add,
  attributeArray,
  dot,
  float,
  getCurrentStack,
  setCurrentStack,
  instanceIndex,
  int,
  ivec2,
  ivec3,
  select,
  sqrt,
  sub,
  texture,
  textureLoad,
  uint,
  uniform,
} = TSL;

import {
  DEFAULT_MAX_SPLATS,
  SPLAT_TEX_HEIGHT_MASK,
  SPLAT_TEX_LAYER_BITS,
  SPLAT_TEX_WIDTH_BITS,
  SPLAT_TEX_WIDTH_MASK,
} from "./constants.js";

import { unpackSplatEncoding } from "./tslHelpers.js";

export interface SortComputeParams {
  /** Packed splats texture */
  packedSplatsTexture: THREE.DataArrayTexture;
  /** Number of splats */
  numSplats: number;
  /** View origin in accumulator space */
  viewOrigin: THREE.Vector3;
  /** View direction in accumulator space */
  viewDirection: THREE.Vector3;
  /** RGB min/max and ln scale min/max */
  rgbMinMaxLnScaleMinMax: THREE.Vector4;
  /** Use radial sort (true) or depth sort (false) */
  sortRadial: boolean;
  /** Depth bias for depth sorting */
  depthBias: number;
}

/**
 * SortComputePass computes sorted indices for splat rendering.
 *
 * Uses GPU for distance computation, CPU for sorting (reliable approach).
 * The compute shader is built once at construction time; the texture uniform
 * is updated via .value to avoid rebuilding the shader node graph.
 */
export class SortComputePass {
  private renderer: any;
  private maxSplats: number;

  // Distance storage buffer (GPU compute writes distances here)
  private distanceBuffer: any;

  // CPU-side buffers for sorting
  private indicesArray: Uint32Array;

  // Output sorted indices (uploaded to GPU after CPU sort)
  public sortedIndicesBuffer: any;

  // Uniforms
  private uniforms: {
    numSplats: any;
    viewOrigin: any;
    viewDirection: any;
    rgbMinMaxLnScaleMinMax: any;
    sortRadial: any;
    depthBias: any;
  };

  // Texture uniform (updated via .value, never recreated)
  private packedSplatsTextureUniform: any;

  // Compute node (built once, never rebuilt)
  private distanceComputeNode: any;

  constructor(renderer: any, maxSplats = DEFAULT_MAX_SPLATS) {
    this.renderer = renderer;
    this.maxSplats = maxSplats;

    // Create GPU storage buffers
    this.distanceBuffer = attributeArray(maxSplats, "float");
    this.sortedIndicesBuffer = attributeArray(maxSplats, "uint");

    // Create CPU-side buffer for sorting
    this.indicesArray = new Uint32Array(maxSplats);

    // Initialize indices to identity
    for (let i = 0; i < maxSplats; i++) {
      this.indicesArray[i] = i;
    }

    // Create uniforms
    this.uniforms = {
      numSplats: uniform(0),
      viewOrigin: uniform(new THREE.Vector3(0, 0, 0)),
      viewDirection: uniform(new THREE.Vector3(0, 0, -1)),
      rgbMinMaxLnScaleMinMax: uniform(new THREE.Vector4(0, 1, -12, 9)),
      sortRadial: uniform(1), // 1 = radial, 0 = depth
      depthBias: uniform(1.0),
    };

    // Create texture uniform with placeholder — will be updated via .value
    const placeholderTexture = new THREE.DataArrayTexture(
      new Uint32Array(4),
      1,
      1,
      1,
    );
    placeholderTexture.format = THREE.RGBAIntegerFormat;
    placeholderTexture.type = THREE.UnsignedIntType;
    placeholderTexture.internalFormat = "RGBA32UI";
    placeholderTexture.needsUpdate = true;

    this.packedSplatsTextureUniform = texture(placeholderTexture);

    // Build compute node ONCE — closure captures the texture uniform node,
    // whose .value will be updated at runtime without rebuilding the shader.
    this.distanceComputeNode = this.buildDistanceComputeNode();
  }

  /**
   * Build the distance computation shader (called once in constructor).
   */
  private buildDistanceComputeNode(): any {
    const distBuffer = this.distanceBuffer;
    const uniforms = this.uniforms;
    const packedSplatsTexture = this.packedSplatsTextureUniform;

    return Fn((builder: any) => {
      // WORKAROUND: Three.js TSL r182 doesn't set currentStack before Fn callback
      // in compute shaders. Manually set it from builder.stack if needed.
      if (getCurrentStack() === null && builder?.stack?.isStackNode) {
        setCurrentStack(builder.stack);
      }

      const splatIdx = instanceIndex;

      // Check if this splat is valid (within numSplats)
      const isValid = splatIdx.lessThan(uniforms.numSplats);

      // Compute texture coordinates from splat index
      const ix = int(uint(splatIdx).bitAnd(uint(SPLAT_TEX_WIDTH_MASK)));
      const iy = int(
        uint(splatIdx)
          .shiftRight(uint(SPLAT_TEX_WIDTH_BITS))
          .bitAnd(uint(SPLAT_TEX_HEIGHT_MASK)),
      );
      const iz = int(uint(splatIdx).shiftRight(uint(SPLAT_TEX_LAYER_BITS)));

      // Read packed splat data from texture (use .depth() for array index)
      const packed = textureLoad(packedSplatsTexture, ivec2(ix, iy)).depth(iz);

      // Unpack to get center position
      const { center } = unpackSplatEncoding(
        packed,
        uniforms.rgbMinMaxLnScaleMinMax,
      );

      // Compute vector from view origin to splat
      const toSplat = sub(center, uniforms.viewOrigin);

      // Compute distance based on sort mode
      const radialDist = sqrt(dot(toSplat, toSplat));
      const depthDist = add(
        dot(toSplat, uniforms.viewDirection),
        uniforms.depthBias,
      );

      // Select based on sortRadial flag
      const computedDistance = select(
        uniforms.sortRadial.equal(int(1)),
        radialDist,
        depthDist,
      );

      // Final distance: valid splats get computed distance, invalid get large value
      const finalDistance = select(isValid, computedDistance, float(1e30));

      // Store distance
      distBuffer.element(splatIdx).assign(finalDistance);
    })().compute(this.maxSplats);
  }

  /**
   * Sort splats and return sorted indices storage.
   */
  async sort(params: SortComputeParams): Promise<void> {
    const { numSplats } = params;

    if (numSplats === 0) {
      return;
    }

    // Update uniforms
    this.uniforms.numSplats.value = numSplats;
    this.uniforms.viewOrigin.value.copy(params.viewOrigin);
    this.uniforms.viewDirection.value.copy(params.viewDirection);
    this.uniforms.rgbMinMaxLnScaleMinMax.value.copy(
      params.rgbMinMaxLnScaleMinMax,
    );
    this.uniforms.sortRadial.value = params.sortRadial ? 1 : 0;
    this.uniforms.depthBias.value = params.depthBias;

    // Update texture uniform value (no rebuild needed)
    if (this.packedSplatsTextureUniform.value !== params.packedSplatsTexture) {
      this.packedSplatsTextureUniform.value = params.packedSplatsTexture;
    }

    // Step 1: Compute distances on GPU
    await this.renderer.computeAsync(this.distanceComputeNode);

    // Step 2: Read back distances to CPU
    const distanceAttr = this.distanceBuffer.value;
    let distArray: Float32Array;
    try {
      const buffer = await this.renderer.getArrayBufferAsync(distanceAttr);
      distArray = new Float32Array(buffer);
    } catch (e) {
      // Buffer might not be ready yet (e.g. first frame)
      return;
    }

    // Step 3: Sort indices on CPU (back-to-front ordering for alpha blending)
    for (let i = 0; i < numSplats; i++) {
      this.indicesArray[i] = i;
    }

    const indices = this.indicesArray;
    const distances = distArray;

    if (numSplats < 1000) {
      // Insertion sort for small arrays
      for (let i = 1; i < numSplats; i++) {
        const idx = indices[i];
        const dist = distances[idx];
        let j = i - 1;
        while (j >= 0 && distances[indices[j]] < dist) {
          indices[j + 1] = indices[j];
          j--;
        }
        indices[j + 1] = idx;
      }
    } else {
      // Use Array.sort for larger arrays (JS engine optimized)
      const indexArray = Array.from(indices.subarray(0, numSplats));
      indexArray.sort((a, b) => distances[b] - distances[a]);
      for (let i = 0; i < numSplats; i++) {
        indices[i] = indexArray[i];
      }
    }

    // Step 4: Upload sorted indices to GPU
    const sortedAttr = this.sortedIndicesBuffer.value;
    const sortedArray = sortedAttr.array as Uint32Array;
    sortedArray.set(indices.subarray(0, numSplats));
    sortedAttr.needsUpdate = true;
  }

  /**
   * Get the sorted indices storage node for use in render pass.
   */
  getSortedIndicesStorage(): any {
    return this.sortedIndicesBuffer;
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    // Storage buffers are managed by Three.js
  }
}
