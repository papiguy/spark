import * as THREE from "three";
declare const SPLAT_TEX_WIDTH_BITS = 11;
declare const SPLAT_TEX_HEIGHT_BITS = 11;
declare const SPLAT_TEX_WIDTH_MASK: number;
declare const SPLAT_TEX_HEIGHT_MASK: number;
declare const SPLAT_TEX_LAYER_BITS: number;
declare const LN_SCALE_MIN = -12;
declare const LN_SCALE_MAX = 9;
export type WebGPUSplatMaterialOptions = {
    uniforms: ReturnType<typeof import("../SparkRenderer").SparkRenderer.makeUniforms>;
    premultipliedAlpha: boolean;
};
export type ComputeSplatMaterialOptions = {
    premultipliedAlpha: boolean;
    maxStdDev: number;
    minAlpha: number;
    falloff: number;
    positionStorage?: any;
    colorStorage?: any;
    uvStorage?: any;
};
/**
 * Create a WebGPU-compatible material for splat rendering (placeholder).
 *
 * NOTE: NodeMaterial (TSL) doesn't work with SparkRenderer's InstancedBufferGeometry
 * due to a Three.js bug. This placeholder returns MeshBasicMaterial.
 *
 * Use createComputeSplatMaterial() with the compute pipeline instead.
 */
export declare function createWebGPUSplatMaterial(options: WebGPUSplatMaterialOptions): THREE.Material;
/**
 * Create a material for compute-based splat rendering.
 *
 * This material is used with regular BufferGeometry (non-instanced)
 * where vertex positions, colors, and UVs are computed by a compute shader.
 *
 * If storage buffers are provided, reads directly from them.
 * Otherwise, reads from standard vertex attributes.
 *
 * The material applies gaussian falloff in the fragment shader.
 */
export declare function createComputeSplatMaterial(options: ComputeSplatMaterialOptions): THREE.Material;
export { SPLAT_TEX_WIDTH_BITS, SPLAT_TEX_HEIGHT_BITS, SPLAT_TEX_WIDTH_MASK, SPLAT_TEX_HEIGHT_MASK, SPLAT_TEX_LAYER_BITS, LN_SCALE_MIN, LN_SCALE_MAX, };
