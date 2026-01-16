/**
 * SplatComputePipeline manages the WebGPU compute-based splat rendering pipeline.
 *
 * Strategy (from Three.js webgpu_compute_geometry example):
 * 1. Create StorageBufferAttribute for positions/colors
 * 2. Add to geometry as regular attributes
 * 3. Wrap with storage() for compute shader access
 * 4. Compute writes to storage, render reads from geometry attributes
 */
import * as THREE from "three";
export interface ComputePipelineParams {
    packedSplatsTexture: THREE.DataArrayTexture;
    numSplats: number;
    renderToViewQuat: THREE.Quaternion;
    renderToViewPos: THREE.Vector3;
    projectionMatrix: THREE.Matrix4;
    renderSize: THREE.Vector2;
    maxStdDev: number;
    minAlpha: number;
    minPixelRadius: number;
    maxPixelRadius: number;
    clipXY: number;
    focalAdjustment: number;
    blurAmount: number;
    preBlurAmount: number;
    rgbMinMaxLnScaleMinMax: THREE.Vector4;
    isOrthographic: boolean;
}
export declare class SplatComputePipeline {
    private renderer;
    private maxSplats;
    private positionAttribute;
    private colorAttribute;
    private positionStorage;
    private colorStorage;
    private uniforms;
    private computeNode;
    mesh: THREE.Mesh;
    private initialized;
    constructor(renderer: any, maxSplats?: number);
    /**
     * Update uniforms and run compute shader.
     */
    update(params: ComputePipelineParams): Promise<void>;
    dispose(): void;
}
