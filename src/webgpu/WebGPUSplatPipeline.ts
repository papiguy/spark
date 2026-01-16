/**
 * WebGPUSplatPipeline: Main orchestrator for WebGPU-based splat rendering.
 *
 * This class manages the complete rendering pipeline:
 * 1. SortComputePass - Computes sorted indices for back-to-front rendering
 * 2. RenderComputePass - Generates quad vertices from packed splat data
 * 3. WebGPUSplatMaterial - Renders quads with Gaussian falloff
 */

import * as THREE from "three";
import type { NodeMaterial } from "three/webgpu";

import {
  type RenderComputeParams,
  RenderComputePass,
} from "./RenderComputePass.js";
import { type SortComputeParams, SortComputePass } from "./SortComputePass.js";
import {
  type WebGPUSplatMaterialOptions,
  createDebugSplatMaterial,
  createWebGPUSplatMaterial,
} from "./WebGPUSplatMaterial.js";
import { DEFAULT_MAX_SPLATS } from "./constants.js";

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
export class WebGPUSplatPipeline {
  private renderer: any;
  private maxSplats: number;

  private sortPass: SortComputePass;
  private renderPass: RenderComputePass;
  private material: InstanceType<typeof NodeMaterial>;

  /** The mesh to add to the scene for rendering */
  public mesh: THREE.Mesh;

  // Cached matrices for computing transforms
  private worldToView = new THREE.Matrix4();
  private accumToView = new THREE.Matrix4();
  private viewToAccum = new THREE.Matrix4();

  // Cached quaternion/position for renderToView transform
  private renderToViewQuat = new THREE.Quaternion();
  private renderToViewPos = new THREE.Vector3();

  constructor(renderer: any, options: WebGPUSplatPipelineOptions = {}) {
    this.renderer = renderer;
    this.maxSplats = options.maxSplats ?? DEFAULT_MAX_SPLATS;

    // Create pipeline components
    this.sortPass = new SortComputePass(renderer, this.maxSplats);
    this.renderPass = new RenderComputePass(renderer, this.maxSplats);

    // Create material
    if (options.debug) {
      this.material = createDebugSplatMaterial();
    } else {
      this.material = createWebGPUSplatMaterial(options.materialOptions ?? {});
    }

    // Create mesh with render pass geometry
    this.mesh = new THREE.Mesh(this.renderPass.geometry, this.material);
    this.mesh.frustumCulled = false; // We handle culling in compute shader
    this.mesh.renderOrder = 1000; // Render after other objects

    console.log("[WebGPUSplatPipeline] Pipeline initialized");
  }

  /**
   * Update the pipeline and render splats.
   *
   * @param params - Pipeline parameters
   */
  async update(params: WebGPUSplatPipelineParams): Promise<void> {
    const {
      packedSplatsTexture,
      numSplats,
      camera,
      accumToWorld,
      renderSize,
      rgbMinMaxLnScaleMinMax,
      maxStdDev = 3.0,
      minAlpha = 1.0 / 255.0,
      minPixelRadius = 0.0,
      maxPixelRadius = 2048.0,
      clipXY = 1.2,
      focalAdjustment = 1.0,
      blurAmount = 0.3,
      preBlurAmount = 0.0,
      sortRadial = true,
      depthBias = 1.0,
    } = params;

    // Early exit if no splats
    if (numSplats === 0) {
      this.renderPass.geometry.setDrawRange(0, 0);
      return;
    }

    // Compute view transforms
    // worldToView = viewMatrix = inverse(camera.matrixWorld)
    this.worldToView.copy(camera.matrixWorld).invert();

    // accumToView = worldToView * accumToWorld
    this.accumToView.multiplyMatrices(this.worldToView, accumToWorld);

    // viewToAccum = inverse(accumToView) for computing view origin in accum space
    this.viewToAccum.copy(this.accumToView).invert();

    // Extract quaternion and position from accumToView
    // This represents the transform from accumulator space to view space
    this.accumToView.decompose(
      this.renderToViewPos,
      this.renderToViewQuat,
      new THREE.Vector3(), // scale (ignored)
    );

    // Compute view origin in accumulator space (for sorting)
    const viewOrigin = new THREE.Vector3(0, 0, 0);
    viewOrigin.applyMatrix4(this.viewToAccum);

    // Compute view direction in accumulator space
    const viewDirection = new THREE.Vector3(0, 0, -1);
    viewDirection.transformDirection(this.viewToAccum).normalize();

    // Check if orthographic
    const isOrthographic = !(camera as THREE.PerspectiveCamera)
      .isPerspectiveCamera;

    // Step 1: Sort splats (computes distances and sorted indices)
    const sortParams: SortComputeParams = {
      packedSplatsTexture,
      numSplats,
      viewOrigin,
      viewDirection,
      rgbMinMaxLnScaleMinMax,
      sortRadial,
      depthBias,
    };

    await this.sortPass.sort(sortParams);

    // Connect sorted indices to render pass
    const sortedIndicesStorage = this.sortPass.getSortedIndicesStorage();
    this.renderPass.setSortedIndicesStorage(sortedIndicesStorage);

    // Step 2: Generate quad vertices
    const renderParams: RenderComputeParams = {
      packedSplatsTexture,
      numSplats,
      sortedIndices: this.sortPass.sortedIndicesAttr, // Use sorted indices from sort pass
      renderToViewQuat: this.renderToViewQuat,
      renderToViewPos: this.renderToViewPos,
      projectionMatrix: camera.projectionMatrix,
      renderSize,
      rgbMinMaxLnScaleMinMax,
      maxStdDev,
      minAlpha,
      minPixelRadius,
      maxPixelRadius,
      clipXY,
      focalAdjustment,
      blurAmount,
      preBlurAmount,
      isOrthographic,
    };

    await this.renderPass.update(renderParams);
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    this.sortPass.dispose();
    this.renderPass.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
