import { WebGPUSplatMaterialOptions } from './WebGPUSplatMaterial.js';
/**
 * WebGPUSplatPipeline: Main orchestrator for WebGPU-based splat rendering.
 *
 * This class manages the complete rendering pipeline:
 * 1. SortComputePass - Computes sorted indices for back-to-front rendering
 * 2. RenderComputePass - Generates quad vertices from packed splat data
 * 3. WebGPUSplatMaterial - Renders quads with Gaussian falloff
 */
import * as THREE from "three";
export interface WebGPUSplatPipelineOptions {
    /** Maximum number of splats to support */
    maxSplats?: number;
    /** Material options */
    materialOptions?: WebGPUSplatMaterialOptions;
    /** Use debug material (shows vertex colors without Gaussian falloff) */
    debug?: boolean;
}
export interface WebGPUSplatPipelineParams {
    /** Packed splats texture (DataArrayTexture with RGBA32UI format) */
    packedSplatsTexture: THREE.DataArrayTexture;
    /** Number of active splats */
    numSplats: number;
    /** Camera for view/projection matrices */
    camera: THREE.Camera;
    /** Accumulator-to-world transform */
    accumToWorld: THREE.Matrix4;
    /** Render target size in pixels */
    renderSize: THREE.Vector2;
    /** RGB min/max and ln scale min/max for unpacking */
    rgbMinMaxLnScaleMinMax: THREE.Vector4;
    /** Maximum standard deviations to render */
    maxStdDev?: number;
    /** Minimum alpha to render */
    minAlpha?: number;
    /** Minimum pixel radius for splats */
    minPixelRadius?: number;
    /** Maximum pixel radius for splats */
    maxPixelRadius?: number;
    /** Frustum clip factor (>1 to render slightly outside frustum) */
    clipXY?: number;
    /** Focal adjustment factor */
    focalAdjustment?: number;
    /** Blur amount for anti-aliasing */
    blurAmount?: number;
    /** Pre-blur amount */
    preBlurAmount?: number;
    /** Use radial sort (true) or depth sort (false) */
    sortRadial?: boolean;
    /** Depth bias for depth sorting */
    depthBias?: number;
}
/**
 * WebGPUSplatPipeline manages WebGPU-based Gaussian splat rendering.
 */
export declare class WebGPUSplatPipeline {
    private renderer;
    private maxSplats;
    private sortPass;
    private renderPass;
    private material;
    /** The mesh to add to the scene for rendering */
    mesh: THREE.Mesh;
    private worldToView;
    private accumToView;
    private viewToAccum;
    private renderToViewQuat;
    private renderToViewPos;
    constructor(renderer: any, options?: WebGPUSplatPipelineOptions);
    /**
     * Update the pipeline and render splats.
     *
     * @param params - Pipeline parameters
     */
    update(params: WebGPUSplatPipelineParams): Promise<void>;
    /**
     * Dispose of GPU resources.
     */
    dispose(): void;
}
