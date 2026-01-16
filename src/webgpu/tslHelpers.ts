/**
 * TSL (Three.js Shading Language) helper functions for WebGPU splat rendering.
 * These are ports of the GLSL functions from splatDefines.glsl.
 */

import {
  Fn,
  If,
  Return,
  abs,
  add,
  bitAnd,
  bitOr,
  clamp,
  cos,
  cross,
  div,
  dot,
  exp,
  float,
  int,
  ivec3,
  log,
  max,
  min,
  mul,
  normalize,
  select,
  shiftLeft,
  shiftRight,
  sin,
  sqrt,
  sub,
  uint,
  unpackHalf2x16,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import {
  PI,
  SPLAT_TEX_HEIGHT_BITS,
  SPLAT_TEX_HEIGHT_MASK,
  SPLAT_TEX_LAYER_BITS,
  SPLAT_TEX_WIDTH_BITS,
  SPLAT_TEX_WIDTH_MASK,
} from "./constants.js";

// Type aliases for TSL node types
type TSLFloat = ReturnType<typeof float>;
type TSLInt = ReturnType<typeof int>;
type TSLUint = ReturnType<typeof uint>;
type TSLVec2 = ReturnType<typeof vec2>;
type TSLVec3 = ReturnType<typeof vec3>;
type TSLVec4 = ReturnType<typeof vec4>;
type TSLIvec3 = ReturnType<typeof ivec3>;

/**
 * Compute texture coordinates from splat index.
 * Equivalent to GLSL: ivec3 splatTexCoord(int index)
 */
export const splatTexCoord = Fn(([index]: [TSLUint]) => {
  const x = bitAnd(index, uint(SPLAT_TEX_WIDTH_MASK));
  const y = bitAnd(
    shiftRight(index, uint(SPLAT_TEX_WIDTH_BITS)),
    uint(SPLAT_TEX_HEIGHT_MASK),
  );
  const z = shiftRight(index, uint(SPLAT_TEX_LAYER_BITS));
  return ivec3(int(x), int(y), int(z));
});

/**
 * Rotate vector v by quaternion q.
 * Equivalent to GLSL: vec3 quatVec(vec4 q, vec3 v)
 */
export const quatVec = Fn(([q, v]: [TSLVec4, TSLVec3]) => {
  // t = 2.0 * cross(q.xyz, v)
  const qxyz = vec3(q.x, q.y, q.z);
  const t = mul(float(2.0), cross(qxyz, v));
  // return v + q.w * t + cross(q.xyz, t)
  return add(v, add(mul(q.w, t), cross(qxyz, t)));
});

/**
 * Apply quaternion q1 after quaternion q2.
 * Equivalent to GLSL: vec4 quatQuat(vec4 q1, vec4 q2)
 */
export const quatQuat = Fn(([q1, q2]: [TSLVec4, TSLVec4]) => {
  return vec4(
    add(
      add(add(mul(q1.w, q2.x), mul(q1.x, q2.w)), mul(q1.y, q2.z)),
      mul(float(-1), mul(q1.z, q2.y)),
    ),
    add(
      add(sub(mul(q1.w, q2.y), mul(q1.x, q2.z)), mul(q1.y, q2.w)),
      mul(q1.z, q2.x),
    ),
    add(
      sub(add(mul(q1.w, q2.z), mul(q1.x, q2.y)), mul(q1.y, q2.x)),
      mul(q1.z, q2.w),
    ),
    sub(
      sub(sub(mul(q1.w, q2.w), mul(q1.x, q2.x)), mul(q1.y, q2.y)),
      mul(q1.z, q2.z),
    ),
  );
});

/**
 * Decode a 24-bit encoded uint into a quaternion using folded octahedral inverse.
 * Equivalent to GLSL: vec4 decodeQuatOctXy88R8(uint encoded)
 */
export const decodeQuatOctXy88R8 = Fn(([encoded]: [TSLUint]) => {
  // Extract the fields
  const quantU = bitAnd(encoded, uint(0xff));
  const quantV = bitAnd(shiftRight(encoded, uint(8)), uint(0xff));
  const angleInt = shiftRight(encoded, uint(16));

  // Recover u and v in [0,1], then map to [-1,1]
  const u_f = div(float(quantU), float(255.0));
  const v_f = div(float(quantV), float(255.0));
  const fx = sub(mul(u_f, float(2.0)), float(1.0));
  const fy = sub(mul(v_f, float(2.0)), float(1.0));

  // axis.z = 1.0 - abs(f.x) - abs(f.y)
  const axisZ = sub(sub(float(1.0), abs(fx)), abs(fy));

  // t = max(-axis.z, 0.0)
  const t = max(mul(float(-1), axisZ), float(0.0));

  // Adjust x and y based on their signs
  const axisX = add(
    fx,
    select(fx.greaterThanEqual(float(0.0)), mul(float(-1), t), t),
  );
  const axisY = add(
    fy,
    select(fy.greaterThanEqual(float(0.0)), mul(float(-1), t), t),
  );

  // Normalize the axis
  const axis = normalize(vec3(axisX, axisY, axisZ));

  // Decode the angle theta in [0,pi]
  const theta = mul(div(float(angleInt), float(255.0)), float(PI));
  const halfTheta = mul(theta, float(0.5));
  const s = sin(halfTheta);
  const w = cos(halfTheta);

  return vec4(mul(axis, s), w);
});

/**
 * Unpack splat encoding from packed uvec4 data.
 * Returns: { center: vec3, scales: vec3, quaternion: vec4, rgba: vec4 }
 */
export function unpackSplatEncoding(
  packed: any,
  rgbMinMaxLnScaleMinMax: any,
): { center: any; scales: any; quaternion: any; rgba: any } {
  const word0 = packed.x;
  const word1 = packed.y;
  const word2 = packed.z;
  const word3 = packed.w;

  // Unpack RGBA (word0)
  const uR = bitAnd(word0, uint(0xff));
  const uG = bitAnd(shiftRight(word0, uint(8)), uint(0xff));
  const uB = bitAnd(shiftRight(word0, uint(16)), uint(0xff));
  const uA = shiftRight(word0, uint(24));

  const rgbMin = rgbMinMaxLnScaleMinMax.x;
  const rgbMax = rgbMinMaxLnScaleMinMax.y;

  // rgba = (vec4(uRgba) / 255.0)
  // rgba.rgb = rgba.rgb * (rgbMax - rgbMin) + rgbMin
  const r = add(mul(div(float(uR), float(255.0)), sub(rgbMax, rgbMin)), rgbMin);
  const g = add(mul(div(float(uG), float(255.0)), sub(rgbMax, rgbMin)), rgbMin);
  const b = add(mul(div(float(uB), float(255.0)), sub(rgbMax, rgbMin)), rgbMin);
  const a = div(float(uA), float(255.0));
  const rgba = vec4(r, g, b, a);

  // Unpack center (word1, word2)
  // word1 contains X and Y as half-floats
  const centerXY = unpackHalf2x16(word1);
  // word2 lower 16 bits contains Z as half-float
  const centerZPart = unpackHalf2x16(bitAnd(word2, uint(0xffff)));
  const center = vec3(centerXY.x, centerXY.y, centerZPart.x);

  // Unpack scales (word3)
  const uScaleX = bitAnd(word3, uint(0xff));
  const uScaleY = bitAnd(shiftRight(word3, uint(8)), uint(0xff));
  const uScaleZ = bitAnd(shiftRight(word3, uint(16)), uint(0xff));

  const lnScaleMin = rgbMinMaxLnScaleMinMax.z;
  const lnScaleMax = rgbMinMaxLnScaleMinMax.w;
  const lnScaleScale = div(sub(lnScaleMax, lnScaleMin), float(254.0));

  // Decode scale: 0 means 0.0, otherwise exp(lnScaleMin + (value-1) * scale)
  const decodeScale = (uScale: any) => {
    const isZero = uScale.equal(uint(0));
    const decoded = exp(
      add(lnScaleMin, mul(sub(float(uScale), float(1.0)), lnScaleScale)),
    );
    return select(isZero, float(0.0), decoded);
  };

  const scales = vec3(
    decodeScale(uScaleX),
    decodeScale(uScaleY),
    decodeScale(uScaleZ),
  );

  // Unpack quaternion
  // uQuat = ((word2 >> 16) & 0xFFFF) | ((word3 >> 8) & 0xFF0000)
  const quatLower = bitAnd(shiftRight(word2, uint(16)), uint(0xffff));
  const quatUpper = bitAnd(shiftRight(word3, uint(8)), uint(0xff0000));
  const uQuat = bitOr(quatLower, quatUpper);
  const quaternion = decodeQuatOctXy88R8(uQuat);

  return { center, scales, quaternion, rgba };
}

/**
 * Build scale-quaternion matrix components.
 * Returns the 9 elements of the 3x3 matrix (column-major: mColRow).
 */
export function scaleQuaternionToMatrix(
  s: any,
  q: any,
): {
  m00: any;
  m01: any;
  m02: any;
  m10: any;
  m11: any;
  m12: any;
  m20: any;
  m21: any;
  m22: any;
} {
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;

  // Column 0
  const m00 = mul(
    s.x,
    sub(float(1.0), mul(float(2.0), add(mul(qy, qy), mul(qz, qz)))),
  );
  const m01 = mul(s.x, mul(float(2.0), add(mul(qx, qy), mul(qw, qz))));
  const m02 = mul(s.x, mul(float(2.0), sub(mul(qx, qz), mul(qw, qy))));

  // Column 1
  const m10 = mul(s.y, mul(float(2.0), sub(mul(qx, qy), mul(qw, qz))));
  const m11 = mul(
    s.y,
    sub(float(1.0), mul(float(2.0), add(mul(qx, qx), mul(qz, qz)))),
  );
  const m12 = mul(s.y, mul(float(2.0), add(mul(qy, qz), mul(qw, qx))));

  // Column 2
  const m20 = mul(s.z, mul(float(2.0), add(mul(qx, qz), mul(qw, qy))));
  const m21 = mul(s.z, mul(float(2.0), sub(mul(qy, qz), mul(qw, qx))));
  const m22 = mul(
    s.z,
    sub(float(1.0), mul(float(2.0), add(mul(qx, qx), mul(qy, qy)))),
  );

  return { m00, m01, m02, m10, m11, m12, m20, m21, m22 };
}

/**
 * Compute 3D covariance matrix from scale-quaternion matrix.
 * cov3D = RS * RS^T where RS is the scale-rotation matrix.
 * Returns the 6 unique elements (symmetric matrix):
 * { c00, c01, c02, c11, c12, c22 }
 */
export function computeCov3D(RS: {
  m00: any;
  m01: any;
  m02: any;
  m10: any;
  m11: any;
  m12: any;
  m20: any;
  m21: any;
  m22: any;
}): {
  c00: any;
  c01: any;
  c02: any;
  c11: any;
  c12: any;
  c22: any;
} {
  // cov3D = RS * RS^T (symmetric)
  // c[i][j] = sum_k RS[i][k] * RS[j][k]
  const c00 = add(
    add(mul(RS.m00, RS.m00), mul(RS.m10, RS.m10)),
    mul(RS.m20, RS.m20),
  );
  const c01 = add(
    add(mul(RS.m00, RS.m01), mul(RS.m10, RS.m11)),
    mul(RS.m20, RS.m21),
  );
  const c02 = add(
    add(mul(RS.m00, RS.m02), mul(RS.m10, RS.m12)),
    mul(RS.m20, RS.m22),
  );
  const c11 = add(
    add(mul(RS.m01, RS.m01), mul(RS.m11, RS.m11)),
    mul(RS.m21, RS.m21),
  );
  const c12 = add(
    add(mul(RS.m01, RS.m02), mul(RS.m11, RS.m12)),
    mul(RS.m21, RS.m22),
  );
  const c22 = add(
    add(mul(RS.m02, RS.m02), mul(RS.m12, RS.m12)),
    mul(RS.m22, RS.m22),
  );

  return { c00, c01, c02, c11, c12, c22 };
}

/**
 * Project 3D covariance to 2D using the Jacobian of perspective projection.
 * Returns { a, b, d } where the 2D covariance is [[a, b], [b, d]].
 *
 * @param viewCenter - View space center of the splat (vec3)
 * @param cov3D - 3D covariance matrix elements
 * @param focal - Focal length in pixels (vec2: fx, fy)
 * @param isOrthographic - Whether using orthographic projection
 */
export function projectCov3DTo2D(
  viewCenter: any,
  cov3D: { c00: any; c01: any; c02: any; c11: any; c12: any; c22: any },
  focal: any,
  isOrthographic: boolean,
): { a: any; b: any; d: any } {
  if (isOrthographic) {
    // For orthographic projection, just take the XY components
    return {
      a: mul(cov3D.c00, mul(focal.x, focal.x)),
      b: mul(cov3D.c01, mul(focal.x, focal.y)),
      d: mul(cov3D.c11, mul(focal.y, focal.y)),
    };
  }

  // Perspective projection Jacobian
  const invZ = div(float(1.0), viewCenter.z);
  const invZ2 = mul(invZ, invZ);

  // J = [ fx/z,  0,    -fx*x/z^2 ]
  //     [ 0,     fy/z, -fy*y/z^2 ]
  const J00 = mul(focal.x, invZ);
  const J02 = mul(mul(float(-1), focal.x), mul(viewCenter.x, invZ2));
  const J11 = mul(focal.y, invZ);
  const J12 = mul(mul(float(-1), focal.y), mul(viewCenter.y, invZ2));

  // cov2D = J * cov3D * J^T
  // a = J[0,0]^2 * c00 + 2*J[0,0]*J[0,2]*c02 + J[0,2]^2*c22
  // b = J[0,0]*J[1,1]*c01 + J[0,0]*J[1,2]*c02 + J[0,2]*J[1,1]*c12 + J[0,2]*J[1,2]*c22
  // d = J[1,1]^2 * c11 + 2*J[1,1]*J[1,2]*c12 + J[1,2]^2*c22

  const a = add(
    add(
      mul(mul(J00, J00), cov3D.c00),
      mul(mul(float(2), mul(J00, J02)), cov3D.c02),
    ),
    mul(mul(J02, J02), cov3D.c22),
  );

  const b = add(
    add(
      add(mul(mul(J00, J11), cov3D.c01), mul(mul(J00, J12), cov3D.c02)),
      mul(mul(J02, J11), cov3D.c12),
    ),
    mul(mul(J02, J12), cov3D.c22),
  );

  const d = add(
    add(
      mul(mul(J11, J11), cov3D.c11),
      mul(mul(float(2), mul(J11, J12)), cov3D.c12),
    ),
    mul(mul(J12, J12), cov3D.c22),
  );

  return { a, b, d };
}

/**
 * Compute eigenvalues and eigenvectors of a 2x2 symmetric matrix [[a, b], [b, d]].
 * Returns { eigen1, eigen2, eigenVec1, eigenVec2 }.
 */
export function eigenDecompose2x2(
  a: any,
  b: any,
  d: any,
): {
  eigen1: any;
  eigen2: any;
  eigenVec1: any;
  eigenVec2: any;
} {
  // Eigenvalues: avg +/- sqrt(avg^2 - det)
  // where avg = (a + d) / 2, det = a * d - b * b
  const eigenAvg = mul(float(0.5), add(a, d));
  const det = sub(mul(a, d), mul(b, b));
  const eigenDelta = sqrt(max(float(0.0), sub(mul(eigenAvg, eigenAvg), det)));

  const eigen1 = add(eigenAvg, eigenDelta);
  const eigen2 = sub(eigenAvg, eigenDelta);

  // Eigenvector for eigen1: (b, eigen1 - a) normalized
  // When b is very small, use (1, 0) as fallback
  const bSmall = abs(b).lessThan(float(0.001));
  const evx = select(bSmall, float(1.0), b);
  const evy = select(bSmall, float(0.0), sub(eigen1, a));
  const eigenVec1 = normalize(vec2(evx, evy));

  // Eigenvector for eigen2 is perpendicular to eigenVec1
  const eigenVec2 = vec2(eigenVec1.y, mul(float(-1), eigenVec1.x));

  return { eigen1, eigen2, eigenVec1, eigenVec2 };
}

/**
 * Compute quad corner positions from ellipse axes and scales.
 *
 * @param ndcCenter - NDC center position (vec3)
 * @param eigenVec1 - First eigenvector (vec2)
 * @param eigenVec2 - Second eigenvector (vec2)
 * @param scale1 - First eigenvalue sqrt (pixel radius)
 * @param scale2 - Second eigenvalue sqrt (pixel radius)
 * @param renderSize - Render target size in pixels (vec2)
 * @param cornerOffset - Corner offset [-1,-1] to [1,1] (vec2)
 * @returns NDC position for this corner (vec3)
 */
export function computeQuadCorner(
  ndcCenter: any,
  eigenVec1: any,
  eigenVec2: any,
  scale1: any,
  scale2: any,
  renderSize: any,
  cornerOffset: any,
): any {
  // Pixel offset = corner.x * eigenVec1 * scale1 + corner.y * eigenVec2 * scale2
  const pixelOffset = add(
    mul(mul(cornerOffset.x, eigenVec1), scale1),
    mul(mul(cornerOffset.y, eigenVec2), scale2),
  );

  // Convert pixel offset to NDC offset: 2.0 / renderSize
  const ndcOffset = mul(div(float(2.0), renderSize), pixelOffset);

  return vec3(
    add(ndcCenter.x, ndcOffset.x),
    add(ndcCenter.y, ndcOffset.y),
    ndcCenter.z,
  );
}

/**
 * Square function.
 */
export function sqr(x: any): any {
  return mul(x, x);
}

/**
 * Linear interpolation.
 */
export function mix(a: any, b: any, t: any): any {
  return add(a, mul(t, sub(b, a)));
}
