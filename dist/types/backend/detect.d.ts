import { AnyRenderer, RendererBackend } from './types';
import type * as THREE from "three";
/**
 * Returns true if the current renderer is WebGPU.
 * This can be checked before the backend is fully initialized.
 */
export declare function isUsingWebGPU(): boolean;
/**
 * Sets the internalFormat on a texture only if using WebGL.
 * WebGPU doesn't accept WebGL format strings like "RGBA32UI".
 *
 * @param texture - The THREE.js texture to configure
 * @param format - The WebGL internal format string (e.g., "RGBA32UI", "RGBA8")
 */
export declare function setTextureInternalFormat(texture: THREE.Texture, format: string): void;
/**
 * Detects the renderer type and creates the appropriate backend.
 *
 * @param renderer - The THREE.js renderer (WebGLRenderer or WebGPURenderer)
 * @returns The appropriate backend implementation
 */
export declare function createBackend(renderer: AnyRenderer): RendererBackend;
