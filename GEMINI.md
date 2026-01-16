# GEMINI.md

This file provides guidance to Gemini Code (gemini.ai/code) when working with code in this repository.

## Project Overview

Spark is an advanced 3D Gaussian Splatting (3DGS) renderer for THREE.js. It enables rendering of Gaussian splats alongside traditional mesh-based 3D objects in WebGL2/WebXR applications. The library treats splats as first-class THREE.js scene objects with full transform support, correct multi-object sorting, and dynamic modification.

## Build Commands

```bash
npm install            # Install deps and build Rust WASM component
npm run build          # Build both production (minified) and dev builds
npm run build:dev      # Build dev only (faster)
npm build:wasm     # Rebuild only the Rust WASM component
npm start              # Run dev server with hot reload at localhost:8080
npm run lint           # Run Biome linter
npm run lint:fix       # Auto-fix lint issues
npm run format:fix     # Auto-format code
npm run test           # Run tests
```

### Asset Management

```bash
npm run assets:download    # Download example assets for offline dev
npm run assets:clean       # Remove cached assets
npm run assets:compress <file>  # Compress a splat file to .spz format
```

### Documentation

```bash
npm run docs           # Serve documentation locally (requires mkdocs-material)
npm run site:build     # Build static site with docs
```

## Architecture

### Core Rendering Pipeline

The rendering pipeline handles splat sorting (required for correct alpha blending) across multiple splat objects:

1. **SparkRenderer** - Scene graph traverser that collects all splats from `SplatMesh` instances and issues a single instanced draw call per frame
2. **SparkViewpoint** - Manages GPU readback of splat distances and triggers CPU sorting via `SplatWorker` (runs in Web Worker)
3. **SplatAccumulator** - Aggregates splats from multiple `SplatMesh` objects into a unified `PackedSplats` buffer

### Splat Object Hierarchy

```
THREE.Object3D
  └── SplatGenerator (base class - procedural splat generation via dyno)
        └── SplatMesh (loads from file, applies transforms/edits)
```

- **SplatGenerator**: Abstract base that generates splats via a `dyno` shader function mapping `index → Gsplat`
- **SplatMesh**: Concrete implementation that loads splat files (.ply, .spz, .splat, .ksplat, .sog) and provides transform/editing features
- **SplatModifier/SplatTransformer**: Inject custom `dyno` code to modify splats before rendering

### Dyno Shader Graph System

The `dyno` system (`src/dyno/`) enables GPU computation graphs written in TypeScript that compile to GLSL:

- `DynoVal<T>` - Typed value in the computation graph (T = "int", "float", "vec4", custom types like `Gsplat`)
- `Dyno<InTypes, OutTypes>` - Function block with typed inputs/outputs
- `DynoBlock` - Composable subgraph created via `dyno.dynoBlock()`

Key custom types: `Gsplat` (splat struct with center, scales, quaternion, rgba), `TPackedSplats` (16-byte packed format)

Usage: Instead of `x + y`, use `dyno.add(x, y)`. All dyno operations are composable and type-checked.

### File Loaders

- `SplatLoader` - Unified loader supporting multiple formats
- `PlyReader` - PLY format (compressed and uncompressed)
- `SpzReader/SpzWriter` - SPZ format (Niantic's compressed format)
- Format detection via `getSplatFileType()`

### Rust/WASM Component

`rust/spark-internal-rs/` contains performance-critical operations:
- `sort.rs` - Efficient splat sorting algorithms
- `raycast.rs` - Ray-splat intersection

Built via `npm run build:wasm`, produces `spark-internal-rs/pkg/`.

## Code Style

- Uses Biome for linting/formatting (double quotes, space indent, LF line endings)
- Pre-commit hooks via Lefthook run lint and test
- GLSL shaders are in `.glsl` files, processed by vite-plugin-glsl
- THREE.js is a peer dependency (externalized in builds)

## Testing

```bash
npm run test    # Run all tests
node --no-warnings --loader ts-node/esm --test test/utils.test.ts  # Single test
```

Tests use Node's built-in test runner with ts-node for TypeScript.
