import type * as THREE from "three";
/**
 * Interface representing any WebGPU-like renderer.
 * WebGPURenderer is imported from 'three/webgpu' in THREE.js r165+,
 * but we define a minimal interface here to avoid import issues.
 */
export interface WebGPURendererLike {
    readonly isWebGPURenderer: true;
    render(scene: THREE.Object3D, camera: THREE.Camera): void;
    setRenderTarget(target: THREE.RenderTarget | null): void;
    getDrawingBufferSize(target: THREE.Vector2): THREE.Vector2;
    xr: THREE.WebXRManager;
    info: THREE.WebGLInfo;
}
/**
 * Union type for both WebGL and WebGPU renderers.
 * WebGPURenderer is available in THREE.js r165+.
 */
export type AnyRenderer = THREE.WebGLRenderer | WebGPURendererLike;
/**
 * Options for creating a render target that supports array/3D textures.
 */
export interface ArrayRenderTargetOptions {
    width: number;
    height: number;
    depth: number;
    depthBuffer?: boolean;
    stencilBuffer?: boolean;
    generateMipmaps?: boolean;
    magFilter?: THREE.TextureFilter;
    minFilter?: THREE.TextureFilter;
    format?: "rgba8" | "rgba32ui";
    scissorTest?: boolean;
}
/**
 * Abstract interface for array render targets.
 * WebGL uses WebGLArrayRenderTarget, WebGPU may use different targets.
 */
export interface ArrayRenderTarget {
    readonly texture: THREE.DataArrayTexture;
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    scissor: THREE.Vector4;
    scissorTest: boolean;
    dispose(): void;
}
/**
 * Options for creating the main splat rendering material.
 */
export interface SplatMaterialOptions {
    premultipliedAlpha: boolean;
    uniforms: Record<string, THREE.IUniform>;
}
/**
 * Options for pixel readback operations.
 */
export interface ReadPixelsOptions {
    target: ArrayRenderTarget;
    layer: number;
    x: number;
    y: number;
    width: number;
    height: number;
    buffer: Uint8Array;
}
/**
 * Backend abstraction interface for renderer-specific operations.
 * Implementations provide WebGL or WebGPU specific functionality.
 */
export interface RendererBackend {
    /** True if this is a WebGPU backend */
    readonly isWebGPU: boolean;
    /** The underlying THREE.js renderer */
    readonly renderer: AnyRenderer;
    /**
     * Creates the main splat rendering material.
     * WebGL uses ShaderMaterial with GLSL, WebGPU uses NodeMaterial with TSL.
     */
    createSplatMaterial(options: SplatMaterialOptions): THREE.Material;
    /**
     * Creates an array render target for packed splat storage or readback.
     */
    createArrayRenderTarget(options: ArrayRenderTargetOptions): ArrayRenderTarget;
    /**
     * Reads pixels from a render target asynchronously.
     */
    readPixelsAsync(options: ReadPixelsOptions): Promise<void>;
    /**
     * Sets the render target for subsequent render operations.
     * @param target The render target, or null for the canvas
     * @param layer Optional layer index for array targets
     */
    setRenderTarget(target: ArrayRenderTarget | null, layer?: number): void;
    /**
     * Flushes pending GPU commands.
     * WebGL uses gl.flush(), WebGPU may use different mechanisms.
     */
    flush(): void;
}
/**
 * Type guard to check if a renderer is a WebGPU renderer.
 */
export declare function isWebGPURenderer(renderer: AnyRenderer): renderer is WebGPURendererLike;
/**
 * Type guard to check if a renderer is a WebGL renderer.
 */
export declare function isWebGLRenderer(renderer: AnyRenderer): renderer is THREE.WebGLRenderer;
