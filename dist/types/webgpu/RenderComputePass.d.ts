/**
 * RenderComputePass: Compute shader that generates quad vertices from packed splat data.
 *
 * This reads packed splat data from a texture, unpacks it, transforms to view space,
 * projects to 2D, computes Gaussian covariance, and outputs 4 vertices per splat
 * as a quad suitable for rendering.
 *
 * The compute node is built ONCE at construction time. The texture uniform and all
 * other parameters are updated via uniform .value to avoid rebuilding the shader
 * node graph (which causes "No stack defined" warnings).
 */
import * as THREE from "three";
export interface RenderComputeParams {
    /** Packed splats texture */
    packedSplatsTexture: THREE.DataArrayTexture;
    /** Number of splats to render */
    numSplats: number;
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
 * The compute shader is built once at construction time; all parameters
 * are updated via uniform .value. Uses select() instead of If/Return.
 */
export declare class RenderComputePass {
    private renderer;
    private maxSplats;
    private positionBuffer;
    private colorBuffer;
    private uvBuffer;
    private uniforms;
    private packedSplatsTextureUniform;
    private computeNode;
    geometry: THREE.BufferGeometry;
    constructor(renderer: any, maxSplats?: number, sortedIndicesStorage?: any);
    /**
     * Build the compute shader node (called once in constructor).
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
