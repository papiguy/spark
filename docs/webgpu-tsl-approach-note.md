# WebGPU TSL Implementation: Approach Note & Audit

## Summary

This note compares our current WebGPU compute shader implementation against
official Three.js TSL patterns from the wiki, official examples
(`webgpu_compute_particles`, `webgpu_compute_sort_bitonic`), and
Three.js r182 source code. It identifies root causes for the
"No stack defined for assign" warnings and proposes fixes.

---

## Issue #1: Position Storage Type Mismatch (Critical)

**Current code** (`RenderComputePass.ts:178`):
```ts
this.positionStorage = storage(this.positionAttr, "float", vertexCount * 3);
```

**Problem**: The storage is declared as `"float"` elements with count `vertexCount * 3`.
This means `posStorage.element(idx)` returns a **float** node. But we then assign
a **vec3** to it:
```ts
posStorage.element(vertexIdx0).assign(select(isValid, pos0, degeneratePos));
//                  ^^^float          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ vec3
```

This type mismatch (vec3 → float) is likely one source of the warnings.

**Fix**: Change storage type to `"vec3"` with count `vertexCount`:
```ts
this.positionStorage = storage(this.positionAttr, "vec3", vertexCount);
```

**Evidence**: `colorStorage` and `uvStorage` already use proper types (`"vec4"`, `"vec2"`)
and match their element assign types.

---

## Issue #2: Use `attributeArray()` / `instancedArray()` Pattern (Recommended)

**Current code** manually creates `StorageBufferAttribute` + wraps with `storage()`:
```ts
this.positionAttr = new StorageBufferAttribute(vertexCount, 3);
this.positionStorage = storage(this.positionAttr, "vec3", vertexCount);
```

**Official pattern** (from Three.js `Arrays.js` source and all examples):
```js
// For non-instanced (regular vertex attributes):
const positionBuffer = attributeArray(vertexCount, 'vec3');

// For instanced (per-instance attributes):
const positionBuffer = instancedArray(particleCount, 'vec3');
```

Both `attributeArray()` and `instancedArray()` internally do:
```js
const buffer = new StorageBufferAttribute(count, itemSize, typedArray);
const node = storage(buffer, type, count);
return node; // Returns the StorageBufferNode directly
```

**Why this matters**:
- `attributeArray()` correctly derives `itemSize` from type (e.g., `'vec3'` → 3)
- It picks the correct `TypedArray` type (Float32Array for vec3, Uint32Array for uint)
- The returned node IS the StorageBufferNode, usable both in compute and rendering
- The underlying `BufferAttribute` is accessible via `node.value` for setting on geometry

**For our case**: Since we use a regular `Mesh` (not instanced), we should use
`attributeArray()` (which creates `StorageBufferAttribute`), NOT `instancedArray()`
(which creates `StorageInstancedBufferAttribute`).

---

## Issue #3: Official Element Access Pattern

**Current code**:
```ts
posStorage.element(vertexIdx0).assign(select(isValid, pos0, degeneratePos));
```

**Official patterns** (from `webgpu_compute_particles.html`):
```js
const position = positions.element(instanceIndex);
position.addAssign(velocity);
// or:
position.x = 1;
position.y = 1;
position.z = 1;
```

**From `webgpu_compute_sort_bitonic.html`**:
```js
tempStorage.element(idxBefore).assign(currentElementsStorage.element(idxAfter));
```

**Analysis**: Both `.assign()` and property assignment (`position.x = value`) are used
in official examples. The bitonic sort uses `.assign()` with `storage()` and it works.
However, the bitonic sort uses:
```js
const currentElementsBuffer = new THREE.StorageInstancedBufferAttribute(array, 1);
const currentElementsStorage = storage(currentElementsBuffer, 'uint', size).setPBO(true);
```
Key difference: it passes an actual `StorageInstancedBufferAttribute`, not our
`StorageBufferAttribute`. Both should work though, as `StorageBufferNode` accepts either.

**Conclusion**: Our `.assign()` pattern is correct — the issue is likely the type mismatch
from Issue #1, not the assign pattern itself.

---

## Issue #4: `If()` Being Null at Runtime

**Symptom**: `TypeError: Cannot read properties of null (reading 'If')` at runtime.

**Current status**: We replaced `If()`/`Return()` with `select()` in compute shaders.
But `WebGPUSplatMaterial.ts:106` still uses `If()` for fragment discard:
```ts
If(alpha.lessThan(float(minAlpha)), () => {
    Discard();
});
```

**Analysis from official examples**: Official examples DO use `If()` successfully.
The `webgpu_compute_particles` example uses:
```js
If(position.y.lessThan(0), () => {
    position.y = 0;
    velocity.y = velocity.y.negate().mul(bounce);
});
```

**Root cause hypothesis**: The `If` import from `three/tsl` may be null depending on
the module resolution path. The Three.js TSL exports are re-exports from internal
modules. If the bundler tree-shakes or resolves differently, some exports may be null.

**Risk**: The material's `If()` + `Discard()` could also fail at runtime. Since this
is in the fragment shader (not compute), it would only manifest when the mesh renders.

**Recommendation**: Either:
- Test that `If` is non-null before use, with a fallback to `select()` + `Discard()`
- Or use `discard(alpha.lessThan(float(minAlpha)))` if available in the TSL API

---

## Issue #5: The 13 "No Stack Defined" Warnings

**Count breakdown**:
- RenderComputePass: 4 corners × 3 buffers (position, color, uv) = **12 assigns**
- SortComputePass: 1 assign (distance) = **1 assign**
- **Total: 13** — matches the reported count

**When they occur**: During `computeAsync()` → build phase → `ShaderCallNodeInternal.setupOutput()`.

**Three.js source analysis** (`TSLCore.js:59-83`):
```js
Node.prototype.assign = function (...params) {
    if (this.isStackNode !== true) {
        if (currentStack !== null) {
            currentStack.assign(this, ...params);  // Normal path
        } else {
            error('TSL: No stack defined for assign operation...');  // Warning
        }
        return this;
    }
};
```

The `currentStack` is set by `NodeBuilder.addStack()` → `setCurrentStack()`, which
happens inside `ShaderCallNodeInternal.setupOutput()`:
```js
setupOutput(builder) {
    builder.addStack();                           // Sets currentStack
    builder.stack.outputNode = this.call(builder); // Runs our Fn callback
    return builder.removeStack();                  // Restores previous stack
}
```

**So the stack SHOULD be set**. Possible explanations for the warning:

1. **Type mismatch** (Issue #1): Assigning vec3 to float storage element may cause
   the assign node to be created in an unexpected context during type resolution.

2. **Deferred evaluation**: The `select()` inside `.assign()` may create sub-nodes
   that get evaluated outside the stack context during optimization passes.

3. **Multiple build phases**: Three.js builds shaders in 3 phases (setup, analyze,
   generate). The callback is only called during setup (cached after), but the
   resulting node tree is traversed in all phases. If assign nodes are re-evaluated
   during analyze/generate without the stack, warnings would appear.

**Most likely fix**: Resolving Issue #1 (type mismatch) should eliminate most or
all warnings. If not, switching to the `attributeArray()` pattern ensures correct
internal wiring.

---

## Issue #6: `unpackSplatEncoding()` as Plain Function vs `Fn()`

**Current code** (`tslHelpers.ts:158`):
```ts
export function unpackSplatEncoding(packed, rgbMinMaxLnScaleMinMax) {
    // Creates TSL nodes but is a plain JS function, not Fn()
    const r = add(mul(div(float(uR), float(255.0)), sub(rgbMax, rgbMin)), rgbMin);
    // ...
    return { center, scales, quaternion, rgba };
}
```

**Analysis**: This is actually fine. Plain JS functions that create TSL nodes are
acceptable when called inside a `Fn()` context. The nodes are created within the
active stack scope. This is equivalent to inlining the code.

However, `Fn()`-wrapped functions (`splatTexCoord`, `quatVec`, `quatQuat`,
`decodeQuatOctXy88R8`) are defined as shader-level functions that get compiled to
separate WGSL functions. This means they can be called from multiple places without
code duplication.

**Consistency issue**: The `unpackSplatEncoding` function calls `decodeQuatOctXy88R8`
(which is `Fn()`-wrapped). This cross-boundary call should work, but mixing patterns
adds complexity.

**Recommendation**: Keep as-is. The plain function pattern is valid and
causes no issues. If code duplication becomes a concern, it could be wrapped in
`Fn()` later.

---

## Issue #7: Constructor Builds Compute Node Prematurely

**Current flow**:
```ts
constructor(renderer, maxSplats) {
    // Create buffers, uniforms, placeholder texture
    this.buildComputeNode(); // Builds with placeholder texture and no sorted indices
}

async update(params) {
    if (this.currentTexture !== params.packedSplatsTexture) {
        this.buildComputeNode(); // Rebuilds with real texture
    }
    await this.renderer.computeAsync(this.computeNode);
}
```

**Problem**: The first `buildComputeNode()` in the constructor:
- Uses a placeholder 1×1×1 texture
- Has `useSortedIndices = false` (sorted indices not yet connected)
- Creates a compute node that's immediately discarded on first `update()`

**Recommendation**: Remove `this.buildComputeNode()` from the constructor.
Let the first `update()` call handle the build (it already does via texture change detection).

---

## Issue #8: Sorted Indices Closure Capture

**Current code** (`RenderComputePass.ts:237-238`):
```ts
private buildComputeNode(): void {
    const sortedIndicesStorage = this.sortedIndicesStorage; // Captured by closure
    const useSorted = this.useSortedIndices;                // Captured by closure
    this.computeNode = Fn(() => {
        const actualIdx = useSorted && sortedIndicesStorage
            ? sortedIndicesStorage.element(splatIdx)
            : splatIdx;
        // ...
    })().compute(this.maxSplats);
}
```

**Analysis**: The `useSorted` and `sortedIndicesStorage` are captured at build time.
Since `setSortedIndicesStorage()` is called before `update()` in the pipeline flow,
and the first texture change triggers a rebuild, the values ARE correct.

However, the `useSorted` boolean is a JS-level conditional (not a TSL node). This means
the generated shader either always uses sorted indices or never does — it can't switch
at runtime. Since sorting is always enabled in the pipeline, this is acceptable.

**Minor risk**: If `setSortedIndicesStorage(null)` is ever called to disable sorting,
a rebuild would be needed but wouldn't be triggered (only texture changes trigger rebuilds).

---

## Proposed Action Plan

### Phase 1: Fix Critical Issues

1. **Fix position storage type** (`RenderComputePass.ts:178`):
   ```ts
   // Before:
   this.positionStorage = storage(this.positionAttr, "float", vertexCount * 3);
   // After:
   this.positionStorage = storage(this.positionAttr, "vec3", vertexCount);
   ```

2. **Remove premature constructor build** (`RenderComputePass.ts:216`):
   Remove `this.buildComputeNode()` from constructor.

3. **Test**: Run the pipeline and verify the 13 warnings are resolved.

### Phase 2: Adopt Official Patterns (If Phase 1 Doesn't Resolve)

4. **Switch to `attributeArray()`** pattern:
   ```ts
   import { attributeArray } from "three/tsl";

   // Replace manual buffer creation:
   this.positionBuffer = attributeArray(vertexCount, 'vec3');
   this.colorBuffer = attributeArray(vertexCount, 'vec4');
   this.uvBuffer = attributeArray(vertexCount, 'vec2');

   // Get underlying BufferAttribute for geometry:
   this.geometry.setAttribute("position", this.positionBuffer.value);
   this.geometry.setAttribute("color", this.colorBuffer.value);
   this.geometry.setAttribute("uv", this.uvBuffer.value);
   ```

5. **Use property assignment** for position writes:
   ```ts
   const pos = positionBuffer.element(vertexIdx);
   pos.x = select(isValid, validX, 0.0);
   pos.y = select(isValid, validY, 0.0);
   pos.z = select(isValid, validZ, 2.0);
   ```

### Phase 3: Material Safety

6. **Guard the `If()` call** in `WebGPUSplatMaterial.ts`:
   Test if `If` is non-null at runtime; if null, use a `select()`-based fallback
   for discard logic.

---

## Reference: Official Three.js Patterns

### Pattern A: Particles (instancedArray + property assignment)
```js
const positions = instancedArray(particleCount, 'vec3');
const computeUpdate = Fn(() => {
    const position = positions.element(instanceIndex);
    position.addAssign(vec3(0, gravity, 0));
    If(position.y.lessThan(0), () => {
        position.y = 0;
    });
})().compute(particleCount);
```

### Pattern B: Bitonic Sort (StorageInstancedBufferAttribute + assign)
```js
const buffer = new StorageInstancedBufferAttribute(array, 1);
const storageNode = storage(buffer, 'uint', size).setPBO(true);
const computeSort = Fn(() => {
    If(storageNode.element(idxAfter).lessThan(storageNode.element(idxBefore)), () => {
        tempStorage.element(idxBefore).assign(storageNode.element(idxAfter));
    });
})().compute(size);
```

### Pattern C: Our Pattern (StorageBufferAttribute + storage + assign)
```ts
const attr = new StorageBufferAttribute(count, 3);
const storageNode = storage(attr, "vec3", count);  // Must match element type!
const computeNode = Fn(() => {
    storageNode.element(idx).assign(vec3(...));
})().compute(count);
```

All three patterns are valid. The key requirements are:
- Storage type must match the element access type
- `.assign()` must be called inside a `Fn()` context
- Geometry attributes must be the same `BufferAttribute` instances used by storage
