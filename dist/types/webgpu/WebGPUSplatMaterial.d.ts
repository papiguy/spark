import { NodeMaterial } from 'three/webgpu';
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
export declare function createWebGPUSplatMaterial(options?: WebGPUSplatMaterialOptions): InstanceType<typeof NodeMaterial>;
/**
 * Create a simple debug material for testing the compute pipeline.
 * Shows vertex colors without Gaussian falloff.
 */
export declare function createDebugSplatMaterial(): InstanceType<typeof NodeMaterial>;
