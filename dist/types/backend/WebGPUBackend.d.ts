import { ArrayRenderTarget, ArrayRenderTargetOptions, ReadPixelsOptions, RendererBackend, SplatMaterialOptions, WebGPURendererLike } from './types';
import * as THREE from "three";
/**
 * WebGPU backend implementation.
 * Uses TSL (Three Shading Language) for shaders via NodeMaterial.
 */
export declare class WebGPUBackend implements RendererBackend {
    readonly isWebGPU = true;
    readonly renderer: WebGPURendererLike;
    constructor(renderer: WebGPURendererLike);
    createSplatMaterial(options: SplatMaterialOptions): THREE.Material;
    createArrayRenderTarget(options: ArrayRenderTargetOptions): WebGPUArrayRenderTargetWrapper;
    readPixelsAsync(options: ReadPixelsOptions): Promise<void>;
    setRenderTarget(target: ArrayRenderTarget | null, layer?: number): void;
    flush(): void;
}
/**
 * Wrapper around render target for WebGPU.
 */
declare class WebGPUArrayRenderTargetWrapper implements ArrayRenderTarget {
    readonly target: THREE.WebGLArrayRenderTarget;
    constructor(target: THREE.WebGLArrayRenderTarget);
    get texture(): THREE.DataArrayTexture;
    get width(): number;
    get height(): number;
    get depth(): number;
    get scissor(): THREE.Vector4;
    get scissorTest(): boolean;
    set scissorTest(value: boolean);
    dispose(): void;
}
export {};
