import { describe, expect, it } from "vitest";
import {
  analyzeComponentPlanSupport,
  compileComponentPlan,
  ComponentPlanDocument,
  expandComponentPlan,
  validateComponentPlan,
  ValidationError,
} from "../src/index.js";

describe("EllipseRing and ellipse PathRepeat", () => {
  it("compiles a true hollow ellipse shell rather than a stadium", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Ellipse Shell Fixture",
      policy: { sizeTier: "medium" },
      bounds: { width: 33, height: 8, length: 17 },
      palette: { wall: "minecraft:stone_bricks" },
      components: [{
        id: "ellipse_shell",
        type: "EllipseRing",
        placement: { center: { x: 16, z: 8 }, y: 1, radiusX: 8, radiusZ: 4 },
        options: { thickness: 1, height: 3 },
        materials: { main: "wall" },
      }],
    };

    const expanded = expandComponentPlan(plan);
    const voxel = compileComponentPlan(plan);
    const positions = new Set(voxel.blocks.map(({ pos }) => pos.join(",")));

    expect(expanded.nodes.length).toBeGreaterThan(0);
    expect(voxel.blocks.length).toBe(expanded.nodes.length);
    expect(positions.has("23,1,9")).toBe(true); // Ellipse boundary.
    expect(positions.has("22,1,11")).toBe(false); // Inside a radius-4 stadium cap, outside this ellipse.
    expect(positions.has("16,1,8")).toBe(false); // Hollow center.
    expect(voxel.blocks.every(({ pos }) => pos[0] >= 8 && pos[0] <= 24 && pos[2] >= 4 && pos[2] <= 12)).toBe(true);
    expect(voxel.blocks.every(({ sourceNodeId }) => sourceNodeId?.startsWith("ellipse_shell__ellipse_"))).toBe(true);
  });

  it("rejects the full declared ellipse when it exceeds component bounds", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Out of Bounds Ellipse Ring",
      bounds: { width: 7, height: 4, length: 7 },
      palette: { wall: "minecraft:stone" },
      components: [{
        id: "outer_ring",
        type: "EllipseRing",
        placement: { center: { x: 3, z: 3 }, y: 1, radiusX: 4, radiusZ: 2 },
      }],
    };

    expect(() => validateComponentPlan(plan)).toThrow(ValidationError);
    try {
      validateComponentPlan(plan);
    } catch (error) {
      expect((error as ValidationError).details).toEqual([
        expect.objectContaining({ code: "ELLIPSE_RING_OUT_OF_BOUNDS", componentId: "outer_ring" }),
      ]);
    }
  });

  it("repeats a two-level arcade assembly around a closed ellipse with tangent bays", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Two-Level Elliptical Arcade Fixture",
      policy: { sizeTier: "medium" },
      bounds: { width: 40, height: 8, length: 32 },
      palette: { trim: "minecraft:stone_bricks" },
      assemblies: [{
        id: "bay_module",
        bounds: { width: 5, height: 7, length: 3 },
        components: [
          { id: "left_post", type: "SupportPost", placement: { anchor: { x: 0, y: 0, z: 1 }, size: { width: 1, height: 7, length: 1 } }, materials: { main: "trim" } },
          { id: "right_post", type: "SupportPost", placement: { anchor: { x: 4, y: 0, z: 1 }, size: { width: 1, height: 7, length: 1 } }, materials: { main: "trim" } },
          { id: "lower_lintel", type: "Beam", placement: { anchor: { x: 0, y: 3, z: 1 }, size: { width: 5, height: 1, length: 1 } }, materials: { main: "trim" } },
          { id: "upper_lintel", type: "Beam", placement: { anchor: { x: 0, y: 6, z: 1 }, size: { width: 5, height: 1, length: 1 } }, materials: { main: "trim" } },
        ],
      }],
      components: [{
        id: "arcade",
        type: "PathRepeat",
        placement: {
          path: { type: "ellipse", center: { x: 20, z: 16 }, radiusX: 12, radiusZ: 8 },
          source: "bay_module",
          count: 24,
          startAngle: 0,
          endAngle: 360,
          closed: true,
          orientToTangent: true,
        },
      }],
    };

    const document = expandComponentPlan(plan);
    const voxel = compileComponentPlan(plan);
    const support = analyzeComponentPlanSupport(plan);
    const firstBayBlocks = voxel.blocks.filter(({ sourceNodeId }) => sourceNodeId?.startsWith("arcade__bay_module_0__"));
    const generatedBayIds = new Set(document.nodes.map(({ id }) => id.match(/^arcade__bay_module_(\d+)__/)?.[1]).filter(Boolean));

    expect(generatedBayIds.size).toBe(24); // Closed path has no sample at the duplicate 360° seam.
    expect(firstBayBlocks.some(({ pos }) => pos[0] === 32 && pos[2] === 14)).toBe(true);
    expect(firstBayBlocks.some(({ pos }) => pos[0] === 32 && pos[2] === 18)).toBe(true);
    expect(document.nodes.every(({ params }) => [...params.from, ...params.to].every(Number.isInteger))).toBe(true);
    expect(voxel.blocks.every(({ pos }) => pos.every(Number.isInteger))).toBe(true);
    expect(support.sourceSummaries.some(({ sourceNodeId }) => sourceNodeId.startsWith("arcade__bay_module_0__"))).toBe(true);
    expect(() => validateComponentPlan(plan)).not.toThrow();
  });

  it("includes both endpoints and exactly nine samples on an open half-ellipse", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Open Ellipse Path Fixture",
      grid: { unitBlocks: 2 },
      bounds: { width: 20, height: 2, length: 14 },
      palette: { floor: "minecraft:stone" },
      assemblies: [{
        id: "marker_module",
        bounds: { width: 1, height: 1, length: 1 },
        components: [{
          id: "marker",
          type: "Platform",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 1, height: 1, length: 1 } },
        }],
      }],
      components: [{
        id: "half_path",
        type: "PathRepeat",
        placement: {
          path: { type: "ellipse", center: { x: 10, z: 7 }, radiusX: 8, radiusZ: 5 },
          source: "marker_module",
          count: 9,
          startAngle: 0,
          endAngle: 180,
          closed: false,
          orientToTangent: true,
        },
      }],
    };

    const document = expandComponentPlan(plan);
    const voxel = compileComponentPlan(plan);
    const positions = voxel.blocks.map(({ pos }) => pos.join(","));
    const generatedSampleIds = new Set(document.nodes.map(({ id }) => id.match(/^half_path__marker_module_(\d+)__/)?.[1]).filter(Boolean));

    expect(generatedSampleIds.size).toBe(9);
    expect(positions).toHaveLength(72);
    expect(new Set(positions).size).toBe(72);
    expect(positions).toContain("36,0,14");
    expect(positions).toContain("4,0,14");
  });

  it("rejects a rotated bay envelope outside bounds with path and sample context", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Out of Bounds Ellipse Path",
      bounds: { width: 12, height: 2, length: 12 },
      palette: { trim: "minecraft:stone" },
      assemblies: [{
        id: "wide_module",
        bounds: { width: 7, height: 1, length: 7 },
        components: [{
          id: "corner",
          type: "SupportPost",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 1, height: 1, length: 1 } },
        }],
      }],
      components: [{
        id: "outer_path",
        type: "PathRepeat",
        placement: {
          path: { type: "ellipse", center: { x: 6, z: 6 }, radiusX: 5, radiusZ: 5 },
          source: "wide_module",
          count: 4,
          startAngle: 0,
          endAngle: 360,
          closed: true,
          orientToTangent: true,
        },
      }],
    };

    expect(() => validateComponentPlan(plan)).toThrow(ValidationError);
    try {
      validateComponentPlan(plan);
    } catch (error) {
      expect((error as ValidationError).details).toEqual([
        expect.objectContaining({
          code: "PATH_REPEAT_OUT_OF_BOUNDS",
          componentId: "outer_path",
          assemblyId: "wide_module",
          instanceId: "outer_path__wide_module_0",
          sourceNodeId: expect.stringContaining("outer_path__wide_module_0__"),
          message: expect.stringContaining("sample 0 emits voxel"),
        }),
      ]);
    }
  });

  it("checks the rotated declared assembly envelope even when its emitted voxel fits", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Declared Envelope Fixture",
      bounds: { width: 12, height: 2, length: 12 },
      palette: { trim: "minecraft:stone" },
      assemblies: [{
        id: "bay",
        bounds: { width: 7, height: 1, length: 7 },
        components: [{
          id: "center_post",
          type: "SupportPost",
          placement: { anchor: { x: 3, y: 0, z: 3 }, size: { width: 1, height: 1, length: 1 } },
          materials: { main: "trim" },
        }],
      }],
      components: [{
        id: "edge_path",
        type: "PathRepeat",
        placement: {
          path: { type: "ellipse", center: { x: 6, z: 6 }, radiusX: 3, radiusZ: 2 },
          source: "bay",
          count: 1,
          startAngle: 0,
          endAngle: 360,
          closed: true,
          orientToTangent: false,
        },
      }],
    };

    expect(() => validateComponentPlan(plan)).toThrow(ValidationError);
    try {
      validateComponentPlan(plan);
    } catch (error) {
      expect((error as ValidationError).details).toEqual([
        expect.objectContaining({
          code: "PATH_REPEAT_OUT_OF_BOUNDS",
          componentId: "edge_path",
          assemblyId: "bay",
          instanceId: "edge_path__bay_0",
          message: expect.stringContaining("rotated assembly envelope"),
        }),
      ]);
    }
  });

  it("keeps CircleRing and RadialRepeat circular output conventions stable", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Circular Regression Fixture",
      bounds: { width: 16, height: 4, length: 16 },
      palette: { wall: "minecraft:stone", trim: "minecraft:oak_log" },
      assemblies: [{
        id: "post_module",
        bounds: { width: 1, height: 1, length: 1 },
        components: [{
          id: "post",
          type: "SupportPost",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 1, height: 1, length: 1 } },
          materials: { main: "trim" },
        }],
      }],
      components: [
        { id: "ring", type: "CircleRing", placement: { center: { x: 4, z: 4 }, y: 0, radius: 2 }, options: { thickness: 1 }, materials: { main: "wall" } },
        { id: "seed", type: "Instance", placement: { assembly: "post_module", anchor: { x: 0, y: 0, z: 0 } } },
        { id: "radial", type: "RadialRepeat", placement: { center: { x: 10, z: 10 }, radius: 2, source: "seed", count: 4, rotate: true } },
      ],
    };

    const voxel = compileComponentPlan(plan);
    const circleBlocks = voxel.blocks.filter(({ sourceNodeId }) => sourceNodeId?.startsWith("ring__ring_"));
    const radialBlocks = voxel.blocks.filter(({ sourceNodeId }) => sourceNodeId?.includes("radial__seed_"));
    expect(circleBlocks).toHaveLength(12);
    expect(circleBlocks.map(({ pos }) => pos.join(","))).toContain("6,0,4");
    expect(radialBlocks.map(({ pos }) => pos.join(","))).toEqual(expect.arrayContaining([
      [12, 0, 10].join(","), [10, 0, 12].join(","), [8, 0, 10].join(","), [10, 0, 8].join(","),
    ]));
  });

  it("uses conservative repeated-assembly envelope estimates for the block budget", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Ellipse Path Repeat Budget",
      bounds: { width: 32, height: 8, length: 32 },
      palette: { trim: "minecraft:stone" },
      assemblies: [{
        id: "large_envelope",
        bounds: { width: 32, height: 8, length: 32 },
        components: [{
          id: "center_post",
          type: "SupportPost",
          placement: { anchor: { x: 16, y: 0, z: 16 }, size: { width: 1, height: 1, length: 1 } },
          materials: { main: "trim" },
        }],
      }],
      components: [{
        id: "budgeted_path",
        type: "PathRepeat",
        placement: {
          path: { type: "ellipse", center: { x: 16, z: 16 }, radiusX: 1, radiusZ: 1 },
          source: "large_envelope",
          count: 5,
          startAngle: 0,
          endAngle: 180,
          closed: false,
        },
      }],
    };

    expect(() => validateComponentPlan(plan)).toThrow(/estimated expanded block count/);
  });
});
