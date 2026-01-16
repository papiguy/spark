/**
 * TSL (Three.js Shading Language) helper functions for splat compute shader.
 * These are ports of the GLSL functions from splatDefines.glsl.
 */
export declare const SPLAT_TEX_WIDTH_BITS = 11;
export declare const SPLAT_TEX_HEIGHT_BITS = 11;
export declare const SPLAT_TEX_LAYER_BITS: number;
export declare const SPLAT_TEX_WIDTH_MASK: number;
export declare const SPLAT_TEX_HEIGHT_MASK: number;
export declare const LN_SCALE_MIN = -12;
export declare const LN_SCALE_MAX = 9;
/**
 * Compute texture coordinates from splat index.
 * Equivalent to GLSL: ivec3 splatTexCoord(int index)
 */
export declare const splatTexCoord: import('three/src/nodes/TSL.js').ShaderNodeFn<[number | import('three/webgpu').Node]>;
/**
 * Rotate vector v by quaternion q.
 * Equivalent to GLSL: vec3 quatVec(vec4 q, vec3 v)
 */
export declare const quatVec: import('three/src/nodes/TSL.js').ShaderNodeFn<[number | import('three/webgpu').Node, number | import('three/webgpu').Node]>;
/**
 * Apply quaternion q1 after quaternion q2.
 * Equivalent to GLSL: vec4 quatQuat(vec4 q1, vec4 q2)
 */
export declare const quatQuat: import('three/src/nodes/TSL.js').ShaderNodeFn<[number | import('three/webgpu').Node, number | import('three/webgpu').Node]>;
/**
 * Compute the matrix of scaling by s then rotating by q.
 * Equivalent to GLSL: mat3 scaleQuaternionToMatrix(vec3 s, vec4 q)
 *
 * This is a regular JS function that returns a JS object with
 * the 9 matrix elements as TSL nodes (column-major: mColRow).
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
 * Decode a 24-bit encoded uint into a quaternion using folded octahedral inverse.
 * Equivalent to GLSL: vec4 decodeQuatOctXy88R8(uint encoded)
 */
export declare const decodeQuatOctXy88R8: import('three/src/nodes/TSL.js').ShaderNodeFn<[number | import('three/webgpu').Node]>;
/**
 * Unpack half2x16 - extracts two float16 values from a uint32.
 * This is a TSL implementation of GLSL's unpackHalf2x16.
 */
export declare const unpackHalf2x16: import('three/src/nodes/TSL.js').ShaderNodeFn<[number | import('three/webgpu').Node]>;
/**
 * Unpack splat encoding from packed uvec4 data.
 * Equivalent to GLSL: unpackSplatEncoding
 *
 * This is a regular JS function (not Fn-wrapped) so it can return
 * a destructurable JS object containing TSL nodes.
 *
 * Returns: { center: vec3, scales: vec3, quaternion: vec4, rgba: vec4 }
 */
export declare function unpackSplatEncoding(packed: any, rgbMinMaxLnScaleMinMax: any): {
    center: any;
    scales: any;
    quaternion: any;
    rgba: any;
};
