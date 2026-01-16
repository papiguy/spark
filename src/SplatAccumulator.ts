import * as THREE from "three";

import { PackedSplats } from "./PackedSplats";
import type {
  GsplatGenerator,
  SplatGenerator,
  SplatModifier,
} from "./SplatGenerator";

// SplatAccumulator helps manage the generation of splats from multiple
// SplatGenerators, keeping track of the splat mapping, coordinate system,
// and reference count.

// A GeneratorMapping describes a Gsplat range that was generated, including
// which generator and its version number.
export type GeneratorMapping = {
  node: SplatGenerator;
  generator?: GsplatGenerator;
  version: number;
  base: number;
  count: number;
};

export class SplatAccumulator {
  splats = new PackedSplats();
  // The transform from Accumulator coordinate system to world coordinates.
  toWorld = new THREE.Matrix4();
  // An array of all Gsplat mappings that were used for generation
  mapping: GeneratorMapping[] = [];
  // Number of SparkViewpoints (or other) that reference this accumulator, used
  // to figure out when it can be recycled for use
  refCount = 0;

  // Incremented every time the splats are updated/generated.
  splatsVersion = -1;
  // Incremented every time the splat mapping/layout is updated.
  // Splat sort order can be reused between equivalent mapping versions.
  mappingVersion = -1;

  ensureGenerate(maxSplats: number) {
    if (this.splats.ensureGenerate(maxSplats)) {
      // If we had to resize our PackedSplats then clear all previous mappings
      this.mapping = [];
    }
  }

  // Generate all Gsplats from an array of generators
  generateSplats({
    renderer,
    modifier,
    generators,
    forceUpdate,
    originToWorld,
  }: {
    renderer: THREE.WebGLRenderer;
    modifier: SplatModifier;
    generators: GeneratorMapping[];
    forceUpdate?: boolean;
    originToWorld: THREE.Matrix4;
  }) {
    // Create a lookup from last SplatGenerator
    const mapping = this.mapping.reduce((map, record) => {
      map.set(record.node, record);
      return map;
    }, new Map<SplatGenerator, GeneratorMapping>());

    // Run generators that are different from existing mapping
    let updated = 0;
    let numSplats = 0;
    for (const { node, generator, version, base, count } of generators) {
      const current = mapping.get(node);
      if (
        forceUpdate ||
        generator !== current?.generator ||
        version !== current?.version ||
        base !== current?.base ||
        count !== current?.count
      ) {
        // Something is different from before so we should generate these Gsplats
        if (generator && count > 0) {
          const modGenerator = modifier.apply(generator);
          try {
            this.splats.generate({
              generator: modGenerator,
              base,
              count,
              renderer,
            });
          } catch (error) {
            node.generator = undefined;
            node.generatorError = error;
          }
          updated += 1;
        }
      }
      numSplats = Math.max(numSplats, base + count);
    }

    this.splats.numSplats = numSplats;
    this.toWorld.copy(originToWorld);
    this.mapping = generators;
    return updated !== 0;
  }

  // Check if this accumulator has exactly the same generator mapping as
  // the previous one. If so, we can reuse the Gsplat sort order.
  hasCorrespondence(other: SplatAccumulator) {
    if (this.mapping.length !== other.mapping.length) {
      return false;
    }
    return this.mapping.every(({ node, base, count }, i) => {
      const {
        node: otherNode,
        base: otherBase,
        count: otherCount,
      } = other.mapping[i];
      return node === otherNode && base === otherBase && count === otherCount;
    });
  }

  // CPU fallback for WebGPU: directly copy packed splat data from each generator.
  // This bypasses the GPU generation pipeline (dyno shaders) and copies raw data.
  // Note: This does NOT apply transforms - splats will be in their original
  // object-space coordinates. For full transform support, TSL compute shaders
  // would be needed.
  generateSplatsCpu({
    generators,
    originToWorld,
  }: {
    generators: GeneratorMapping[];
    originToWorld: THREE.Matrix4;
  }) {
    // Calculate total splats needed
    let numSplats = 0;
    for (const { base, count } of generators) {
      numSplats = Math.max(numSplats, base + count);
    }

    // Ensure we have enough space in the packedArray
    this.splats.ensureSplats(numSplats);

    // Copy packed data from each generator's source PackedSplats
    for (const { node, base, count } of generators) {
      if (count <= 0) continue;

      // Get the source PackedSplats from the node
      // SplatMesh has packedSplats, SplatGenerator may have different sources
      const sourcePackedSplats = (node as { packedSplats?: PackedSplats })
        .packedSplats;
      if (!sourcePackedSplats?.packedArray) continue;

      const sourceArray = sourcePackedSplats.packedArray;
      const targetArray = this.splats.packedArray;
      if (!targetArray) continue;

      // Copy the packed data (4 uint32 per splat)
      const copyCount = Math.min(count, sourcePackedSplats.numSplats);
      for (let i = 0; i < copyCount; i++) {
        const srcOffset = i * 4;
        const dstOffset = (base + i) * 4;
        targetArray[dstOffset] = sourceArray[srcOffset];
        targetArray[dstOffset + 1] = sourceArray[srcOffset + 1];
        targetArray[dstOffset + 2] = sourceArray[srcOffset + 2];
        targetArray[dstOffset + 3] = sourceArray[srcOffset + 3];
      }
    }

    this.splats.numSplats = numSplats;
    this.splats.needsUpdate = true;
    this.toWorld.copy(originToWorld);
    this.mapping = generators;
    return true;
  }

  // Ensure we have enough space for CPU-based generation (uses packedArray, not render target)
  ensureGenerateCpu(maxSplats: number) {
    this.splats.ensureSplats(maxSplats);
    if (this.splats.maxSplats !== maxSplats) {
      // If we had to resize, clear all previous mappings
      this.mapping = [];
    }
  }
}
