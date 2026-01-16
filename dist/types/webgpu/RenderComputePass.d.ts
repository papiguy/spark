import { StorageBufferAttribute } from 'three/webgpu';
/**
 * RenderComputePass: Compute shader that generates quad vertices from packed splat data.
 *
 * This reads packed splat data from a texture, unpacks it, transforms to view space,
 * projects to 2D, computes Gaussian covariance, and outputs 4 vertices per splat
 * as a quad suitable for rendering.
 */
import * as THREE from "three";
export interface RenderComputeParams {
    /** Packed splats texture */
    packedSplatsTexture: THREE.DataArrayTexture;
    /** Number of splats to render */
    numSplats: number;
    /** Sorted indices buffer (or null for unsorted) */
    sortedIndices: InstanceType<typeof StorageBufferAttribute> | null;
    /** Render-to-view quaternion */
    renderToViewQuat: THREE.Quaternion;
    /** Render-to-view position */
    renderToViewPos: THREE.Vector3;
    /** Camera projection matrix */
    projectionMatrix: THREE.Matrix4;
    /** Render target size in pixels */
    renderSize: THREE.Vector2;
    /** RGB min/max and ln scale min/max */
    rgbMinMaxLnScaleMinMax: THREE.Vector4;
    /** Maximum standard deviations to render */
    maxStdDev: number;
    /** Minimum alpha to render */
    minAlpha: number;
    /** Minimum pixel radius */
    minPixelRadius: number;
    /** Maximum pixel radius */
    maxPixelRadius: number;
    /** Frustum clip factor */
    clipXY: number;
    /** Focal adjustment factor */
    focalAdjustment: number;
    /** Blur amount */
    blurAmount: number;
    /** Pre-blur amount */
    preBlurAmount: number;
    /** Whether using orthographic projection */
    isOrthographic: boolean;
}
/**
 * RenderComputePass generates quad vertices from packed splat data.
 * Uses select() instead of If/Return for TSL compatibility.
 */
export declare class RenderComputePass {
    private renderer;
    private maxSplats;
    private positionAttr;
    private colorAttr;
    private uvAttr;
    private positionStorage;
    private colorStorage;
    private uvStorage;
    private uniforms;
    private packedSplatsTextureUniform;
    private currentTexture;
    private computeNode;
    geometry: THREE.BufferGeometry;
    private sortedIndicesStorage;
    private useSortedIndices;
    constructor(renderer: any, maxSplats?: number);
    /**
     * Set sorted indices storage for reading splats in sorted order.
     */
    setSortedIndicesStorage(sortedIndicesStorage: any): void;
    /**
     * Build the compute shader node.
     * Uses select() instead of If/Return for TSL compatibility.
     */
    private buildComputeNode;
    /**
     * Update uniforms and run the compute shader.
     */
    update(params: RenderComputeParams): Promise<void>;
    /**
     * Dispose of GPU resources.
     */
    dispose(): void;
}
