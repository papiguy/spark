/**
 * RenderComputePass: Compute shader that generates quad vertices from packed splat data.
 *
 * This reads packed splat data from a texture, unpacks it, transforms to view space,
 * projects to 2D, computes Gaussian covariance, and outputs 4 vertices per splat
 * as a quad suitable for rendering.
 */

import * as THREE from "three";
import {
  Fn,
  abs,
  add,
  div,
  float,
  instanceIndex,
  int,
  ivec3,
  max,
  min,
  mul,
  normalize,
  select,
  sqrt,
  storage,
  sub,
  texture,
  textureLoad,
  uint,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { StorageBufferAttribute } from "three/webgpu";

import {
  DEFAULT_MAX_SPLATS,
  QUAD_INDICES,
  SPLAT_TEX_HEIGHT_MASK,
  SPLAT_TEX_LAYER_BITS,
  SPLAT_TEX_WIDTH_BITS,
  SPLAT_TEX_WIDTH_MASK,
} from "./constants.js";

import {
  computeCov3D,
  eigenDecompose2x2,
  projectCov3DTo2D,
  quatQuat,
  quatVec,
  scaleQuaternionToMatrix,
  unpackSplatEncoding,
} from "./tslHelpers.js";

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
export class RenderComputePass {
  private renderer: any;
  private maxSplats: number;

  // Storage buffer attributes (4 vertices per splat)
  private positionAttr: InstanceType<typeof StorageBufferAttribute>;
  private colorAttr: InstanceType<typeof StorageBufferAttribute>;
  private uvAttr: InstanceType<typeof StorageBufferAttribute>;

  // TSL storage wrappers
  private positionStorage: any;
  private colorStorage: any;
  private uvStorage: any;

  // Uniforms
  private uniforms: {
    numSplats: any;
    renderToViewQuat: any;
    renderToViewPos: any;
    projMatrix: any;
    renderSize: any;
    rgbMinMaxLnScaleMinMax: any;
    maxStdDev: any;
    minAlpha: any;
    minPixelRadius: any;
    maxPixelRadius: any;
    clipXY: any;
    focalAdjustment: any;
    blurAmount: any;
    preBlurAmount: any;
    isOrthographic: any;
  };

  // Texture uniform
  private packedSplatsTextureUniform: any;
  private currentTexture: THREE.DataArrayTexture | null = null;

  // Compute node
  private computeNode: any = null;

  // Output geometry
  public geometry: THREE.BufferGeometry;

  // Sorted indices (optional)
  private sortedIndicesStorage: any = null;
  private useSortedIndices = false;

  constructor(renderer: any, maxSplats = DEFAULT_MAX_SPLATS) {
    this.renderer = renderer;
    this.maxSplats = maxSplats;

    const vertexCount = maxSplats * 4; // 4 vertices per splat quad

    // Create storage buffer attributes
    this.positionAttr = new StorageBufferAttribute(vertexCount, 3);
    this.colorAttr = new StorageBufferAttribute(vertexCount, 4);
    this.uvAttr = new StorageBufferAttribute(vertexCount, 2);

    // Create geometry
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", this.positionAttr);
    this.geometry.setAttribute("color", this.colorAttr);
    this.geometry.setAttribute("uv", this.uvAttr);

    // Create index buffer for quads (6 indices per quad)
    const indices = new Uint32Array(maxSplats * 6);
    for (let i = 0; i < maxSplats; i++) {
      const vi = i * 4;
      const ii = i * 6;
      indices[ii + 0] = vi + QUAD_INDICES[0];
      indices[ii + 1] = vi + QUAD_INDICES[1];
      indices[ii + 2] = vi + QUAD_INDICES[2];
      indices[ii + 3] = vi + QUAD_INDICES[3];
      indices[ii + 4] = vi + QUAD_INDICES[4];
      indices[ii + 5] = vi + QUAD_INDICES[5];
    }
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry.setDrawRange(0, 0); // Start with nothing visible

    // Create storage wrappers for compute access
    // Note: Position buffer is tightly packed (stride 12), so we must access it as floats
    this.positionStorage = storage(this.positionAttr, "float", vertexCount * 3);
    this.colorStorage = storage(this.colorAttr, "vec4", vertexCount);
    this.uvStorage = storage(this.uvAttr, "vec2", vertexCount);

    // Create uniforms
    this.uniforms = {
      numSplats: uniform(0),
      renderToViewQuat: uniform(new THREE.Vector4(0, 0, 0, 1)),
      renderToViewPos: uniform(new THREE.Vector3(0, 0, 0)),
      projMatrix: uniform(new THREE.Matrix4()),
      renderSize: uniform(new THREE.Vector2(1, 1)),
      rgbMinMaxLnScaleMinMax: uniform(new THREE.Vector4(0, 1, -12, 9)),
      maxStdDev: uniform(3.0),
      minAlpha: uniform(1.0 / 255.0),
      minPixelRadius: uniform(0.0),
      maxPixelRadius: uniform(2048.0),
      clipXY: uniform(1.2),
      focalAdjustment: uniform(1.0),
      blurAmount: uniform(0.3),
      preBlurAmount: uniform(0.0),
      isOrthographic: uniform(0), // Use int: 0 = perspective, 1 = orthographic
    };

    // Create a placeholder texture (will be replaced on update)
    const placeholderTexture = new THREE.DataArrayTexture(
      new Uint32Array(4),
      1,
      1,
      1,
    );
    placeholderTexture.format = THREE.RGBAIntegerFormat;
    placeholderTexture.type = THREE.UnsignedIntType;
    placeholderTexture.internalFormat = "RGBA32UI";
    placeholderTexture.needsUpdate = true;

    this.packedSplatsTextureUniform = texture(placeholderTexture);

    // Build the compute node
    this.buildComputeNode();
  }

  /**
   * Set sorted indices storage for reading splats in sorted order.
   */
  setSortedIndicesStorage(sortedIndicesStorage: any): void {
    this.sortedIndicesStorage = sortedIndicesStorage;
    this.useSortedIndices = sortedIndicesStorage !== null;
  }

  /**
   * Build the compute shader node.
   * Uses select() instead of If/Return for TSL compatibility.
   */
  private buildComputeNode(): void {
    const posStorage = this.positionStorage;
    const colStorage = this.colorStorage;
    const uvStorage = this.uvStorage;
    const uniforms = this.uniforms;
    const packedSplatsTexture = this.packedSplatsTextureUniform;
    const sortedIndicesStorage = this.sortedIndicesStorage;
    const useSorted = this.useSortedIndices;

    // Main compute kernel
    this.computeNode = Fn(() => {
      const splatIdx = instanceIndex;

      // Degenerate quad values (outside frustum, invisible) - must be inside Fn()
      const degeneratePos = vec3(0.0, 0.0, 2.0);
      const degenerateColor = vec4(0.0, 0.0, 0.0, 0.0);
      const degenerateUv = vec2(0.0, 0.0);

      // Check if splat is within valid range
      const withinRange = splatIdx.lessThan(uniforms.numSplats);

      // Get actual splat index (from sorted indices or direct)
      const actualIdx =
        useSorted && sortedIndicesStorage
          ? sortedIndicesStorage.element(splatIdx)
          : splatIdx;

      // Compute texture coordinates (integer coordinates for textureLoad)
      const ix = int(uint(actualIdx).bitAnd(uint(SPLAT_TEX_WIDTH_MASK)));
      const iy = int(
        uint(actualIdx)
          .shiftRight(uint(SPLAT_TEX_WIDTH_BITS))
          .bitAnd(uint(SPLAT_TEX_HEIGHT_MASK)),
      );
      const iz = int(uint(actualIdx).shiftRight(uint(SPLAT_TEX_LAYER_BITS)));
      const texCoord = ivec3(ix, iy, iz);

      // Read packed splat data from texture
      const packed = textureLoad(packedSplatsTexture, texCoord, int(0));

      // Unpack splat data
      const { center, scales, quaternion, rgba } = unpackSplatEncoding(
        packed,
        uniforms.rgbMinMaxLnScaleMinMax,
      );

      // Alpha validity check
      const alphaValid = rgba.w.greaterThanEqual(uniforms.minAlpha);

      // Zero scale check
      const hasNonZeroScale = scales.x
        .greaterThan(float(0))
        .or(scales.y.greaterThan(float(0)))
        .or(scales.z.greaterThan(float(0)));

      // Transform to view space
      const viewQuat = vec4(
        uniforms.renderToViewQuat.x,
        uniforms.renderToViewQuat.y,
        uniforms.renderToViewQuat.z,
        uniforms.renderToViewQuat.w,
      );
      const viewPos = vec3(
        uniforms.renderToViewPos.x,
        uniforms.renderToViewPos.y,
        uniforms.renderToViewPos.z,
      );
      const viewCenter = add(quatVec(viewQuat, center), viewPos);

      // Behind camera check (z should be negative for visible splats)
      const inFrontOfCamera = viewCenter.z.lessThan(float(0));

      // Compute clip space position
      const clipCenter = uniforms.projMatrix.mul(vec4(viewCenter, float(1.0)));

      // Near/far plane check
      const withinDepthRange = abs(clipCenter.z).lessThan(clipCenter.w);

      // XY frustum check
      const clipLimit = mul(uniforms.clipXY, clipCenter.w);
      const withinXYFrustum = abs(clipCenter.x)
        .lessThanEqual(clipLimit)
        .and(abs(clipCenter.y).lessThanEqual(clipLimit));

      // NDC center (avoid division by zero)
      const safeW = select(
        clipCenter.w.equal(float(0)),
        float(1),
        clipCenter.w,
      );
      const ndcCenter = div(clipCenter.xyz, safeW);

      // Compute view quaternion (renderToView * splat quaternion)
      const viewQuaternion = quatQuat(viewQuat, quaternion);

      // Compute 3D covariance matrix from scale-rotation
      const RS = scaleQuaternionToMatrix(scales, viewQuaternion);
      const cov3D = computeCov3D(RS);

      // Compute focal lengths
      const scaledRenderSize = mul(
        uniforms.renderSize,
        uniforms.focalAdjustment,
      );
      const fx = mul(
        mul(float(0.5), scaledRenderSize.x),
        uniforms.projMatrix.element(0).element(0),
      );
      const fy = mul(
        mul(float(0.5), scaledRenderSize.y),
        uniforms.projMatrix.element(1).element(1),
      );
      const focal = vec2(fx, fy);

      // Project 3D covariance to 2D
      const cov2D = projectCov3DTo2D(viewCenter, cov3D, focal, false);

      // Apply pre-blur
      const a = add(cov2D.a, uniforms.preBlurAmount);
      const b = cov2D.b;
      const d = add(cov2D.d, uniforms.preBlurAmount);

      // Apply anti-aliasing blur
      const detOrig = sub(mul(a, d), mul(b, b));
      const aBlur = add(a, uniforms.blurAmount);
      const dBlur = add(d, uniforms.blurAmount);
      const det = sub(mul(aBlur, dBlur), mul(b, b));

      // Anti-aliasing alpha adjustment (avoid sqrt of negative)
      const safeDet = max(float(1e-10), det);
      const blurAdjust = sqrt(max(float(0), div(detOrig, safeDet)));
      const finalAlpha = mul(rgba.w, blurAdjust);

      // Final alpha check
      const finalAlphaValid = finalAlpha.greaterThanEqual(uniforms.minAlpha);

      // Eigendecomposition of 2D covariance
      const { eigen1, eigen2, eigenVec1, eigenVec2 } = eigenDecompose2x2(
        aBlur,
        b,
        dBlur,
      );

      // Compute pixel radii
      const scale1 = min(
        uniforms.maxPixelRadius,
        mul(uniforms.maxStdDev, sqrt(max(float(0), eigen1))),
      );
      const scale2 = min(
        uniforms.maxPixelRadius,
        mul(uniforms.maxStdDev, sqrt(max(float(0), eigen2))),
      );

      // Minimum radius check
      const hasMinRadius = scale1
        .greaterThanEqual(uniforms.minPixelRadius)
        .or(scale2.greaterThanEqual(uniforms.minPixelRadius));

      // Combine all validity conditions
      const isValid = withinRange
        .and(alphaValid)
        .and(hasNonZeroScale)
        .and(inFrontOfCamera)
        .and(withinDepthRange)
        .and(withinXYFrustum)
        .and(finalAlphaValid)
        .and(hasMinRadius);

      // Final color with alpha adjustment
      const finalRgba = vec4(rgba.x, rgba.y, rgba.z, finalAlpha);

      // Generate 4 quad corners
      const baseVertex = mul(splatIdx, uint(4));
      const invRenderSize = div(float(2.0), scaledRenderSize);

      // Helper to compute corner position
      const computeCornerPos = (cornerX: any, cornerY: any) => {
        const pixelOffset = add(
          mul(mul(cornerX, eigenVec1), scale1),
          mul(mul(cornerY, eigenVec2), scale2),
        );
        const ndcOffset = mul(invRenderSize, pixelOffset);
        return vec3(
          add(ndcCenter.x, ndcOffset.x),
          add(ndcCenter.y, ndcOffset.y),
          ndcCenter.z,
        );
      };

      // Corner 0: (-1, -1)
      const corner0 = vec2(float(-1.0), float(-1.0));
      const pos0 = computeCornerPos(corner0.x, corner0.y);
      const uv0 = mul(corner0, uniforms.maxStdDev);
      const vertexIdx0 = add(baseVertex, uint(0));
      posStorage
        .element(vertexIdx0)
        .assign(select(isValid, pos0, degeneratePos));
      colStorage
        .element(vertexIdx0)
        .assign(select(isValid, finalRgba, degenerateColor));
      uvStorage.element(vertexIdx0).assign(select(isValid, uv0, degenerateUv));

      // Corner 1: (1, -1)
      const corner1 = vec2(float(1.0), float(-1.0));
      const pos1 = computeCornerPos(corner1.x, corner1.y);
      const uv1 = mul(corner1, uniforms.maxStdDev);
      const vertexIdx1 = add(baseVertex, uint(1));
      posStorage
        .element(vertexIdx1)
        .assign(select(isValid, pos1, degeneratePos));
      colStorage
        .element(vertexIdx1)
        .assign(select(isValid, finalRgba, degenerateColor));
      uvStorage.element(vertexIdx1).assign(select(isValid, uv1, degenerateUv));

      // Corner 2: (1, 1)
      const corner2 = vec2(float(1.0), float(1.0));
      const pos2 = computeCornerPos(corner2.x, corner2.y);
      const uv2 = mul(corner2, uniforms.maxStdDev);
      const vertexIdx2 = add(baseVertex, uint(2));
      posStorage
        .element(vertexIdx2)
        .assign(select(isValid, pos2, degeneratePos));
      colStorage
        .element(vertexIdx2)
        .assign(select(isValid, finalRgba, degenerateColor));
      uvStorage.element(vertexIdx2).assign(select(isValid, uv2, degenerateUv));

      // Corner 3: (-1, 1)
      const corner3 = vec2(float(-1.0), float(1.0));
      const pos3 = computeCornerPos(corner3.x, corner3.y);
      const uv3 = mul(corner3, uniforms.maxStdDev);
      const vertexIdx3 = add(baseVertex, uint(3));
      posStorage
        .element(vertexIdx3)
        .assign(select(isValid, pos3, degeneratePos));
      colStorage
        .element(vertexIdx3)
        .assign(select(isValid, finalRgba, degenerateColor));
      uvStorage.element(vertexIdx3).assign(select(isValid, uv3, degenerateUv));
    })().compute(this.maxSplats);
  }

  /**
   * Update uniforms and run the compute shader.
   */
  async update(params: RenderComputeParams): Promise<void> {
    // Update uniforms
    this.uniforms.numSplats.value = params.numSplats;
    this.uniforms.renderToViewQuat.value.set(
      params.renderToViewQuat.x,
      params.renderToViewQuat.y,
      params.renderToViewQuat.z,
      params.renderToViewQuat.w,
    );
    this.uniforms.renderToViewPos.value.copy(params.renderToViewPos);
    this.uniforms.projMatrix.value.copy(params.projectionMatrix);
    this.uniforms.renderSize.value.copy(params.renderSize);
    this.uniforms.rgbMinMaxLnScaleMinMax.value.copy(
      params.rgbMinMaxLnScaleMinMax,
    );
    this.uniforms.maxStdDev.value = params.maxStdDev;
    this.uniforms.minAlpha.value = params.minAlpha;
    this.uniforms.minPixelRadius.value = params.minPixelRadius;
    this.uniforms.maxPixelRadius.value = params.maxPixelRadius;
    this.uniforms.clipXY.value = params.clipXY;
    this.uniforms.focalAdjustment.value = params.focalAdjustment;
    this.uniforms.blurAmount.value = params.blurAmount;
    this.uniforms.preBlurAmount.value = params.preBlurAmount;
    this.uniforms.isOrthographic.value = params.isOrthographic ? 1 : 0;

    // Update texture and rebuild only if changed
    if (this.currentTexture !== params.packedSplatsTexture) {
      this.currentTexture = params.packedSplatsTexture;
      this.packedSplatsTextureUniform = texture(params.packedSplatsTexture);
      this.buildComputeNode();
    }

    // Run compute shader
    await this.renderer.computeAsync(this.computeNode);

    // Update draw range
    this.geometry.setDrawRange(0, params.numSplats * 6);
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    this.geometry.dispose();
  }
}
