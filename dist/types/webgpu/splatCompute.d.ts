/**
 * TSL Compute Shader for Gaussian Splat Processing.
 *
 * This compute shader processes packed splat data and outputs
 * vertex positions, colors, and UVs for rendering as regular triangles.
 *
 * One thread per splat, outputs 4 vertices per splat.
 */
/**
 * Parameters for the compute kernel
 */
export interface SplatComputeKernelParams {
    outPositions: any;
    outColors: any;
    outUvs: any;
    outVisibility: any;
    numSplats?: any;
}
/**
 * Create a SIMPLE test compute kernel.
 * This just outputs test data to verify the compute pipeline works.
 */
export declare function createSplatComputeKernel(params: SplatComputeKernelParams): import('three/src/nodes/TSL.js').ShaderNodeFn<[]>;
