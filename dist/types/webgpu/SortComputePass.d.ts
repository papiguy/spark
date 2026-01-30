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
export declare class SortComputePass {
    private renderer;
    private maxSplats;
    private distanceBuffer;
    private indicesArray;
    sortedIndicesBuffer: any;
    private uniforms;
    private packedSplatsTextureUniform;
    private distanceComputeNode;
    constructor(renderer: any, maxSplats?: number);
    /**
     * Build the distance computation shader (called once in constructor).
     */
    private buildDistanceComputeNode;
    /**
     * Sort splats and return sorted indices storage.
     */
    sort(params: SortComputeParams): Promise<void>;
    /**
     * Get the sorted indices storage node for use in render pass.
     */
    getSortedIndicesStorage(): any;
    /**
     * Dispose of GPU resources.
     */
    dispose(): void;
}
