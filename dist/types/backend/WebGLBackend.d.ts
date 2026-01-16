import { ArrayRenderTarget, ArrayRenderTargetOptions, ReadPixelsOptions, RendererBackend, SplatMaterialOptions } from './types';
import * as THREE from "three";
/**
 * WebGL backend implementation.
 * Wraps WebGL-specific THREE.js functionality for the splat renderer.
 */
export declare class WebGLBackend implements RendererBackend {
    readonly isWebGPU = false;
    readonly renderer: THREE.WebGLRenderer;
    constructor(renderer: THREE.WebGLRenderer);
    createSplatMaterial(options: SplatMaterialOptions): THREE.ShaderMaterial;
    createArrayRenderTarget(options: ArrayRenderTargetOptions): WebGLArrayRenderTargetWrapper;
    readPixelsAsync(options: ReadPixelsOptions): Promise<void>;
    setRenderTarget(target: ArrayRenderTarget | null, layer?: number): void;
    flush(): void;
}
/**
 * Wrapper around WebGLArrayRenderTarget that implements ArrayRenderTarget.
 */
declare class WebGLArrayRenderTargetWrapper implements ArrayRenderTarget {
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
