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
 */

import * as THREE from "three";
import {
  Fn,
  add,
  dot,
  float,
  instanceIndex,
  int,
  ivec3,
  mul,
  select,
  sqrt,
  storage,
  sub,
  texture,
  textureLoad,
  uint,
  uniform,
  vec3,
} from "three/tsl";
import { StorageBufferAttribute } from "three/webgpu";

import {
  DEFAULT_MAX_SPLATS,
  SPLAT_TEX_HEIGHT_BITS,
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
 */
export class SortComputePass {
  private renderer: any;
  private maxSplats: number;

  // Distance buffer for GPU computation
  private distanceAttr: InstanceType<typeof StorageBufferAttribute>;
  private distanceStorage: any;

  // CPU-side buffers for sorting
  private distanceArray: Float32Array;
  private indicesArray: Uint32Array;

  // Output sorted indices (uploaded to GPU after CPU sort)
  public sortedIndicesAttr: InstanceType<typeof StorageBufferAttribute>;
  public sortedIndicesStorage: any;

  // Uniforms
  private uniforms: {
    numSplats: any;
    viewOrigin: any;
    viewDirection: any;
    rgbMinMaxLnScaleMinMax: any;
    sortRadial: any;
    depthBias: any;
  };

  // Texture uniform
  private packedSplatsTextureUniform: any;

  // Compute node
  private distanceComputeNode: any = null;

  // Track current texture for rebuild detection
  private currentTexture: THREE.DataArrayTexture | null = null;

  constructor(renderer: any, maxSplats = DEFAULT_MAX_SPLATS) {
    this.renderer = renderer;
    this.maxSplats = maxSplats;

    // Create GPU storage buffer for distances
    this.distanceAttr = new StorageBufferAttribute(maxSplats, 1);
    this.distanceStorage = storage(this.distanceAttr, "float", maxSplats);

    // Create CPU-side buffers
    this.distanceArray = new Float32Array(maxSplats);
    this.indicesArray = new Uint32Array(maxSplats);

    // Create GPU storage buffer for sorted indices
    this.sortedIndicesAttr = new StorageBufferAttribute(maxSplats, 1);
    this.sortedIndicesStorage = storage(
      this.sortedIndicesAttr,
      "uint",
      maxSplats,
    );

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

    // Create a placeholder texture
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
  }

  /**
   * Build the distance computation shader.
   * Uses select() instead of If/Return for better TSL compatibility.
   */
  private buildDistanceComputeNode(): void {
    const distStorage = this.distanceStorage;
    const uniforms = this.uniforms;
    const packedSplatsTexture = this.packedSplatsTextureUniform;

    this.distanceComputeNode = Fn(() => {
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
      const texCoord = ivec3(ix, iy, iz);

      // Read packed splat data from texture
      const packed = textureLoad(packedSplatsTexture, texCoord, int(0));

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
      distStorage.element(splatIdx).assign(finalDistance);
    })().compute(this.maxSplats);
  }

  /**
   * Sort splats and return sorted indices storage.
   */
  async sort(
    params: SortComputeParams,
  ): Promise<InstanceType<typeof StorageBufferAttribute>> {
    const { numSplats } = params;

    if (numSplats === 0) {
      return this.sortedIndicesAttr;
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

    // Rebuild compute node if texture changed
    if (this.currentTexture !== params.packedSplatsTexture) {
      this.currentTexture = params.packedSplatsTexture;
      this.packedSplatsTextureUniform = texture(params.packedSplatsTexture);
      this.buildDistanceComputeNode();
    }

    // Step 1: Compute distances on GPU
    if (this.distanceComputeNode) {
      await this.renderer.computeAsync(this.distanceComputeNode);
    }

    // Step 2: Read back distances to CPU
    let distArray: Float32Array;
    try {
      const buffer = await this.renderer.getArrayBufferAsync(this.distanceAttr);
      distArray = new Float32Array(buffer);
    } catch (e) {
      // Buffer might not be ready yet (e.g. first frame or optimize-out)
      // console.warn("SortComputePass: Readback failed", e);
      return this.sortedIndicesAttr;
    }

    // Step 3: Sort indices on CPU (back-to-front ordering for alpha blending)
    // Initialize indices
    for (let i = 0; i < numSplats; i++) {
      this.indicesArray[i] = i;
    }

    // Sort by distance (descending - furthest first for correct alpha blending)
    const indices = this.indicesArray;
    const distances = distArray;

    // Use a simple but effective sorting approach
    // For small counts, use insertion sort; for larger, use Array.sort
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
    const sortedArray = this.sortedIndicesAttr.array as Uint32Array;
    sortedArray.set(indices.subarray(0, numSplats));
    this.sortedIndicesAttr.needsUpdate = true;

    return this.sortedIndicesAttr;
  }

  /**
   * Get the sorted indices storage for use in render pass.
   */
  getSortedIndicesStorage(): any {
    return this.sortedIndicesStorage;
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    // Storage buffers are managed by Three.js
  }
}
