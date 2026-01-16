# WebGPU Implementation Investigation

## Goal
Make Gaussian splat rendering work with Three.js WebGPU renderer.

## Current Symptoms
- White screen when using `?webgpu` URL parameter
- No "WebGPU material created:" log appears
- No "Spark: WebGPU mode enabled..." log appears
- No errors in console
- WebGPU renderer IS being created ("Using WebGPU renderer" log shows)
- Splat files ARE being loaded (butterfly.spz loads successfully)

## Key Question
**Why isn't SparkRenderer detecting the WebGPU renderer and creating the WebGPU material?**

## Code Path to Investigate

### 1. Renderer Creation (examples/js/create-renderer.js)
- Creates WebGPURenderer with `?webgpu` param
- Sets `renderer._sparkRendererType = "webgpu"`
- Calls `await renderer.init()`

### 2. SplatMesh Creation (src/SplatMesh.ts)
- User creates `new SplatMesh({ url: ... })`
- SplatMesh adds a detection mesh as child
- Detection mesh's `onBeforeRender` checks for SparkRenderer in scene
- If no SparkRenderer, auto-injects one

### 3. SparkRenderer Creation (src/SparkRenderer.ts)
- Constructor receives `{ renderer }` options
- Calls `isWebGPURenderer(options.renderer)` to detect type
- If WebGPU: calls `createWebGPUSplatMaterial()`
- Logs "Spark: WebGPU mode enabled..."

### 4. WebGPU Detection (src/utils.ts)
- `isWebGPURenderer()` checks:
  - `renderer.isWebGPURenderer === true` (Three.js native)
  - OR `renderer._sparkRendererType === "webgpu"` (our custom flag)

## Investigation Steps

1. **Verify SparkRenderer is being created**
   - Add log in SplatMesh detection mesh's onBeforeRender
   - Check if scene.traverse finds/doesn't find SparkRenderer

2. **Verify renderer is passed correctly**
   - Log the renderer object in detection mesh
   - Log result of isWebGPURenderer() call

3. **Verify SparkRenderer constructor is called with WebGPU**
   - Add log at start of SparkRenderer constructor
   - Log the renderer type detection result

4. **Verify material creation**
   - Add log in createWebGPUSplatMaterial
   - Check if function is even being called

## Hypotheses

### H1: SparkRenderer detection mesh never fires
The detection mesh's `onBeforeRender` might not be called because:
- The mesh isn't being rendered
- The mesh is being removed before render
- Something else is preventing the callback

### H2: Renderer object isn't the WebGPU renderer
The `renderer` passed to `onBeforeRender` might not be the same renderer:
- Three.js passes a different renderer object
- The WebGPU renderer doesn't pass itself correctly

### H3: SparkRenderer IS created but with wrong renderer
The detection might be working but:
- The renderer passed to SparkRenderer constructor isn't the WebGPU one
- The isWebGPURenderer check fails for some reason

### H4: Material is created but not used
The material might be created but:
- Not assigned to the mesh
- Overwritten by something else
- Not compatible with the geometry

## Files to Investigate
- `src/SplatMesh.ts` - Detection mesh creation and onBeforeRender
- `src/SparkRenderer.ts` - Constructor and material creation
- `src/utils.ts` - isWebGPURenderer function
- `src/webgpu/createSplatMaterial.ts` - Material factory
- `examples/js/create-renderer.js` - Renderer creation
