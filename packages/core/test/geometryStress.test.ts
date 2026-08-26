import { describe, expect, it } from "vitest";
import {
  compileComponentPlan,
  ComponentPlanDocument,
  expandComponentPlan,
  validateComponentPlan,
} from "../src/index.js";

interface StressRow {
  family: string;
  size: number;
  craftDagNodes: number;
  voxelBlocks: number;
  expandMs: number;
  compileMs: number;
}

describe("geometry stress benchmark", () => {
  // Circular authoring (CircleRing) versus rectangular and curved-square
  // authoring (RectRing flat / RectRing cornerRise) at matching footprints.
  // Determinism and structural scaling are asserted; timings are informational.
  const sizes = [8, 12, 16];

  function circlePlan(size: number): ComponentPlanDocument {
    return {
      version: "0.1",
      name: `Stress Circle ${size}`,
      bounds: { width: 32, height: 12, length: 32 },
      palette: { wall: "minecraft:stone_bricks" },
      components: [
        {
          id: "drum_ring",
          type: "CircleRing",
          placement: { center: { x: 16, z: 16 }, y: 4, radius: Math.floor(size / 2) },
          options: { thickness: 2, height: 2 },
          materials: { main: "wall" },
        },
      ],
    };
  }

  function rectRingPlan(size: number, cornerRise?: number): ComponentPlanDocument {
    return {
      version: "0.1",
      name: `Stress ${cornerRise ? "Curved" : "Flat"} Ring ${size}`,
      bounds: { width: 32, height: 12, length: 32 },
      palette: { roof: "minecraft:green_concrete" },
      components: [
        {
          id: "eave",
          type: "RectRing",
          placement: { anchor: { x: 4, y: 4, z: 4 }, size: { width: size, height: 6, length: size } },
          options: {
            bandWidth: 2,
            height: 2,
            ...(cornerRise ? { cornerRise, riseSpan: 5 } : {}),
          },
          materials: { main: "roof" },
        },
      ],
    };
  }

  it("compiles circular and curved landmark authoring deterministically with bounded growth", () => {
    const families: Array<{ family: string; build: (size: number) => ComponentPlanDocument }> = [
      { family: "circle_ring", build: circlePlan },
      { family: "rect_ring_flat", build: (size) => rectRingPlan(size) },
      { family: "rect_ring_curved", build: (size) => rectRingPlan(size, 3) },
    ];
    const rows: StressRow[] = [];

    for (const { family, build } of families) {
      let previousBlocks = -1;
      for (const size of sizes) {
        const plan = build(size);
        expect(() => validateComponentPlan(plan)).not.toThrow();

        const expandStart = performance.now();
        const craftDag = expandComponentPlan(plan);
        const expandMs = performance.now() - expandStart;

        const compileStart = performance.now();
        const voxel = compileComponentPlan(plan);
        const compileMs = performance.now() - compileStart;
        const recompiled = compileComponentPlan(plan);

        expect(JSON.stringify(voxel)).toEqual(JSON.stringify(recompiled));
        expect(voxel.blocks.length).toBeGreaterThanOrEqual(previousBlocks);
        previousBlocks = voxel.blocks.length;

        rows.push({
          family,
          size,
          craftDagNodes: craftDag.nodes.length,
          voxelBlocks: voxel.blocks.length,
          expandMs: Math.round(expandMs * 100) / 100,
          compileMs: Math.round(compileMs * 100) / 100,
        });
      }
    }

    console.table(rows);
  });
});
