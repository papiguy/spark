import { TSL } from 'three/webgpu';
/**
 * Compute texture coordinates from splat index.
 * Equivalent to GLSL: ivec3 splatTexCoord(int index)
 */
export declare const splatTexCoord: TSL.ShaderNodeFn<[number | import('three/webgpu').Node]>;
/**
 * Rotate vector v by quaternion q.
 * Equivalent to GLSL: vec3 quatVec(vec4 q, vec3 v)
 */
export declare const quatVec: TSL.ShaderNodeFn<[number | import('three/webgpu').Node, number | import('three/webgpu').Node]>;
/**
 * Apply quaternion q1 after quaternion q2.
 * Equivalent to GLSL: vec4 quatQuat(vec4 q1, vec4 q2)
 */
export declare const quatQuat: TSL.ShaderNodeFn<[number | import('three/webgpu').Node, number | import('three/webgpu').Node]>;
/**
 * Decode a 24-bit encoded uint into a quaternion using folded octahedral inverse.
 * Equivalent to GLSL: vec4 decodeQuatOctXy88R8(uint encoded)
 */
export declare const decodeQuatOctXy88R8: TSL.ShaderNodeFn<[number | import('three/webgpu').Node]>;
/**
 * Unpack splat encoding from packed uvec4 data.
 * Returns: { center: vec3, scales: vec3, quaternion: vec4, rgba: vec4 }
 */
export declare function unpackSplatEncoding(packed: any, rgbMinMaxLnScaleMinMax: any): {
    center: any;
    scales: any;
    quaternion: any;
    rgba: any;
};
/**
 * Build scale-quaternion matrix components.
 * Returns the 9 elements of the 3x3 matrix (column-major: mColRow).
 */
export declare function scaleQuaternionToMatrix(s: any, q: any): {
    m00: any;
    m01: any;
    m02: any;
    m10: any;
    m11: any;
    m12: any;
    m20: any;
    m21: any;
    m22: any;
};
/**
 * Compute 3D covariance matrix from scale-quaternion matrix.
 * cov3D = RS * RS^T where RS is the scale-rotation matrix.
 * Returns the 6 unique elements (symmetric matrix):
 * { c00, c01, c02, c11, c12, c22 }
 */
export declare function computeCov3D(RS: {
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
};
/**
 * Project 3D covariance to 2D using the Jacobian of perspective projection.
 * Returns { a, b, d } where the 2D covariance is [[a, b], [b, d]].
 *
 * @param viewCenter - View space center of the splat (vec3)
 * @param cov3D - 3D covariance matrix elements
 * @param focal - Focal length in pixels (vec2: fx, fy)
 * @param isOrthographic - Whether using orthographic projection
 */
export declare function projectCov3DTo2D(viewCenter: any, cov3D: {
    c00: any;
    c01: any;
    c02: any;
    c11: any;
    c12: any;
    c22: any;
}, focal: any, isOrthographic: boolean): {
    a: any;
    b: any;
    d: any;
};
/**
 * Compute eigenvalues and eigenvectors of a 2x2 symmetric matrix [[a, b], [b, d]].
 * Returns { eigen1, eigen2, eigenVec1, eigenVec2 }.
 */
export declare function eigenDecompose2x2(a: any, b: any, d: any): {
    eigen1: any;
    eigen2: any;
    eigenVec1: any;
    eigenVec2: any;
};
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
export declare function computeQuadCorner(ndcCenter: any, eigenVec1: any, eigenVec2: any, scale1: any, scale2: any, renderSize: any, cornerOffset: any): any;
/**
 * Square function.
 */
export declare function sqr(x: any): any;
/**
 * Linear interpolation.
 */
export declare function mix(a: any, b: any, t: any): any;
