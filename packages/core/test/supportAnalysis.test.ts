import { describe, expect, it } from "vitest";
import {
  analyzeComponentPlanSupport,
  analyzeVoxelSupport,
  ComponentPlanDocument,
  validateComponentPlan,
  ValidationError,
  VoxelBlock,
  VoxelPlan,
} from "../src/index.js";

describe("support analysis", () => {
  const basePlan = (components: ComponentPlanDocument["components"]): ComponentPlanDocument => ({
    version: "0.1",
    name: "Support Analysis Plan",
    bounds: { width: 12, height: 12, length: 12 },
    palette: {
      foundation: "minecraft:stone",
      wall: "minecraft:stone",
      floor: "minecraft:oak_planks",
      roof: "minecraft:stone",
      glass: "minecraft:glass",
      door: "minecraft:oak_door",
      trim: "minecraft:oak_log",
    },
    components,
  });

  it("accepts optional structural intent metadata on ComponentPlan nodes", () => {
    const plan = basePlan([
      {
        id: "base",
        type: "Foundation",
        placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 4, height: 1, length: 4 } },
        structural: { supportPolicy: "must_connect_to_ground", maxCantilever: 0 },
      },
      {
        id: "floating_lantern",
        type: "SupportPost",
        placement: { anchor: { x: 8, y: 5, z: 8 }, size: { width: 1, height: 2, length: 1 } },
        structural: { supportPolicy: "decorative", supportRoots: ["base"] },
      },
    ]);

    expect(() => validateComponentPlan(plan)).not.toThrow();
  });

  it("reports disconnected unannotated components", () => {
    const plan = basePlan([
      {
        id: "base",
        type: "Foundation",
        placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 4, height: 1, length: 4 } },
      },
      {
        id: "floating_platform",
        type: "Platform",
        placement: { anchor: { x: 8, y: 5, z: 8 }, size: { width: 3, height: 1, length: 3 } },
      },
    ]);

    const result = analyzeComponentPlanSupport(plan);

    expect(result.disconnectedBlocks).toBe(9);
    expect(result.summary.qualityGate.status).toBe("block");
    expect(result.summary.diagnostics.blockingDiagnostics).toBe(2);
    expect(result.summary.diagnostics.reviewDiagnostics).toBe(0);
    expect(result.summary.qualityGate.blockingReasons).toEqual([
      "DISCONNECTED_COMPONENT",
      "FLOATING_SOURCE_NODE",
    ]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "DISCONNECTED_COMPONENT",
      sourceNodeId: "floating_platform__platform",
      componentId: "floating_platform",
      supportPolicy: "must_connect_to_input",
    }));
  });

  it("validates input before collecting structural entries", () => {
    expect(() => analyzeComponentPlanSupport(undefined)).toThrow(ValidationError);
  });

  it("allows intentional floating components by structural intent", () => {
    const plan = basePlan([
      {
        id: "base",
        type: "Foundation",
        placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 4, height: 1, length: 4 } },
      },
      {
        id: "floating_banner",
        type: "Platform",
        placement: { anchor: { x: 8, y: 5, z: 8 }, size: { width: 3, height: 1, length: 3 } },
        structural: { supportPolicy: "may_float" },
      },
    ]);

    const result = analyzeComponentPlanSupport(plan);
    const withAllowed = analyzeComponentPlanSupport(plan, { includeAllowed: true });

    expect(result.disconnectedBlocks).toBe(9);
    expect(result.diagnostics).toEqual([]);
    expect(result.summary.qualityGate.status).toBe("pass");
    expect(result.summary.diagnostics.allowedDiagnostics).toBe(0);
    expect(withAllowed.diagnostics).toContainEqual(expect.objectContaining({
      code: "ALLOWED_DISCONNECTED_COMPONENT",
      sourceNodeId: "floating_banner__platform",
      supportPolicy: "may_float",
    }));
    expect(withAllowed.summary.qualityGate.status).toBe("pass");
    expect(withAllowed.summary.diagnostics.allowedDiagnostics).toBe(2);
  });

  it("inherits instance structural policy for assembly children", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Floating Assembly",
      bounds: { width: 12, height: 12, length: 12 },
      palette: {
        foundation: "minecraft:stone",
        wall: "minecraft:stone",
        floor: "minecraft:oak_planks",
        roof: "minecraft:stone",
        glass: "minecraft:glass",
        door: "minecraft:oak_door",
        trim: "minecraft:oak_log",
      },
      assemblies: [{
        id: "lantern_module",
        bounds: { width: 3, height: 3, length: 3 },
        components: [{
          id: "body",
          type: "Platform",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 3, height: 1, length: 3 } },
        }],
      }],
      components: [
        {
          id: "base",
          type: "Foundation",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 4, height: 1, length: 4 } },
        },
        {
          id: "floating_lantern",
          type: "Instance",
          placement: { assembly: "lantern_module", anchor: { x: 8, y: 5, z: 8 } },
          structural: { supportPolicy: "decorative" },
        },
      ],
    };

    const result = analyzeComponentPlanSupport(plan);
    const withAllowed = analyzeComponentPlanSupport(plan, { includeAllowed: true });

    expect(result.disconnectedBlocks).toBe(9);
    expect(result.diagnostics).toEqual([]);
    expect(withAllowed.diagnostics).toContainEqual(expect.objectContaining({
      code: "ALLOWED_DISCONNECTED_COMPONENT",
      sourceNodeId: "floating_lantern__body__platform",
      supportPolicy: "decorative",
    }));
  });

  it("merges instance structural metadata with assembly child intent", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Merged Structural Metadata",
      bounds: { width: 12, height: 12, length: 12 },
      palette: {
        foundation: "minecraft:stone",
        wall: "minecraft:stone",
        floor: "minecraft:oak_planks",
        roof: "minecraft:stone",
        glass: "minecraft:glass",
        door: "minecraft:oak_door",
        trim: "minecraft:oak_log",
      },
      assemblies: [{
        id: "floating_module",
        bounds: { width: 3, height: 3, length: 3 },
        components: [{
          id: "body",
          type: "Platform",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 3, height: 1, length: 3 } },
          structural: { supportPolicy: "may_float" },
        }],
      }],
      components: [
        {
          id: "base",
          type: "Foundation",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 4, height: 1, length: 4 } },
        },
        {
          id: "floating_instance",
          type: "Instance",
          placement: { assembly: "floating_module", anchor: { x: 8, y: 5, z: 8 } },
          structural: { supportRoots: ["base"], maxCantilever: 3 },
        },
      ],
    };

    const result = analyzeComponentPlanSupport(plan, { includeAllowed: true });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "ALLOWED_DISCONNECTED_COMPONENT",
      sourceNodeId: "floating_instance__body__platform",
      supportPolicy: "may_float",
      supportRoots: ["base"],
      maxCantilever: 3,
    }));
  });

  it("keeps truly floating nested sub-parts blocking even when a sibling input is connected", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Partial Subpart Disconnection",
      bounds: { width: 12, height: 16, length: 12 },
      palette: {
        foundation: "minecraft:stone",
        wall: "minecraft:stone",
        floor: "minecraft:oak_planks",
        roof: "minecraft:stone",
        glass: "minecraft:glass",
        door: "minecraft:oak_door",
        trim: "minecraft:oak_log",
      },
      assemblies: [{
        id: "tiered_module",
        bounds: { width: 3, height: 8, length: 3 },
        components: [
          {
            id: "slab",
            type: "Platform",
            placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 3, height: 1, length: 3 } },
          },
          {
            id: "spire",
            type: "SupportPost",
            inputs: [{ ref: "slab" }],
            placement: { anchor: { x: 1, y: 5, z: 1 }, size: { width: 1, height: 2, length: 1 } },
          },
        ],
      }],
      components: [
        {
          id: "base",
          type: "Foundation",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 4, height: 1, length: 4 } },
        },
        {
          id: "tower",
          type: "Instance",
          placement: { assembly: "tiered_module", anchor: { x: 0, y: 1, z: 0 } },
        },
      ],
    };

    const result = analyzeComponentPlanSupport(plan);

    expect(result.summary.qualityGate.status).toBe("block");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "FLOATING_SOURCE_NODE",
      sourceNodeId: "tower__spire__post",
    }));
    expect(result.diagnostics.filter((diagnostic) => diagnostic.sourceNodeId === "tower__slab__platform")).toEqual([]);
  });

  it("keeps a floating Repeat clone blocking when a sibling clone is grounded", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Repeat Clone Isolation",
      bounds: { width: 12, height: 12, length: 16 },
      palette: {
        foundation: "minecraft:stone",
        floor: "minecraft:oak_planks",
      },
      components: [
        {
          id: "pier_a",
          type: "Foundation",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 4, height: 1, length: 8 } },
        },
        {
          id: "pier_b",
          type: "Foundation",
          placement: { anchor: { x: 0, y: 0, z: 8 }, size: { width: 4, height: 1, length: 4 } },
        },
        {
          id: "ledge",
          type: "Platform",
          inputs: [{ ref: "pier_a" }],
          placement: { anchor: { x: 0, y: 1, z: 6 }, size: { width: 2, height: 1, length: 1 } },
        },
        {
          id: "ledge_row",
          type: "Repeat",
          inputs: [{ ref: "pier_b" }],
          placement: { source: "ledge", axis: "z", step: 3, count: 3 },
        },
      ],
    };

    const result = analyzeComponentPlanSupport(plan);

    expect(result.diagnostics.filter((diagnostic) => diagnostic.sourceNodeId === "ledge_row__ledge_1__platform")).toEqual([]);
    expect(result.summary.qualityGate.status).toBe("block");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "FLOATING_SOURCE_NODE",
      sourceNodeId: "ledge_row__ledge_2__platform",
    }));
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED",
      sourceNodeId: "ledge_row__ledge_2__platform",
    }));
  });

  it("keeps floating nested children of a Repeat(Instance) clone blocking when a sibling child is grounded", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Repeat Instance Clone Isolation",
      bounds: { width: 12, height: 16, length: 16 },
      palette: {
        foundation: "minecraft:stone",
        floor: "minecraft:oak_planks",
        trim: "minecraft:oak_log",
      },
      assemblies: [{
        id: "tiered_module",
        bounds: { width: 3, height: 8, length: 3 },
        components: [
          {
            id: "slab",
            type: "Platform",
            placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 3, height: 1, length: 3 } },
          },
          {
            id: "spire",
            type: "SupportPost",
            inputs: [{ ref: "slab" }],
            placement: { anchor: { x: 1, y: 5, z: 1 }, size: { width: 1, height: 2, length: 1 } },
          },
        ],
      }],
      components: [
        {
          id: "base",
          type: "Foundation",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 4, height: 1, length: 4 } },
        },
        {
          id: "base_b",
          type: "Foundation",
          placement: { anchor: { x: 6, y: 0, z: 0 }, size: { width: 4, height: 1, length: 4 } },
        },
        {
          id: "tower",
          type: "Instance",
          placement: { assembly: "tiered_module", anchor: { x: 0, y: 1, z: 0 } },
        },
        {
          id: "row",
          type: "Repeat",
          placement: { source: "tower", axis: "x", step: 6, count: 2 },
        },
      ],
    };

    const result = analyzeComponentPlanSupport(plan);

    expect(result.diagnostics.some((diagnostic) => diagnostic.sourceNodeId === "row__tower_1__slab__platform")).toBe(false);
    expect(result.summary.qualityGate.status).toBe("block");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "FLOATING_SOURCE_NODE",
      sourceNodeId: "row__tower_1__spire__post",
    }));
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED",
      sourceNodeId: "row__tower_1__spire__post",
    }));
  });

  it("keeps floating nested children of RadialRepeat(Instance) clones blocking when sibling children are grounded", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "RadialRepeat Instance Clone Isolation",
      bounds: { width: 12, height: 16, length: 16 },
      palette: {
        foundation: "minecraft:stone",
        wall: "minecraft:stone",
        floor: "minecraft:oak_planks",
        trim: "minecraft:oak_log",
      },
      assemblies: [{
        id: "tiered_module",
        bounds: { width: 3, height: 8, length: 3 },
        components: [
          {
            id: "slab",
            type: "Platform",
            placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 3, height: 1, length: 3 } },
          },
          {
            id: "spire",
            type: "SupportPost",
            inputs: [{ ref: "slab" }],
            placement: { anchor: { x: 1, y: 5, z: 1 }, size: { width: 1, height: 2, length: 1 } },
          },
        ],
      }],
      components: [
        {
          id: "base",
          type: "Foundation",
          placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 4, height: 1, length: 4 } },
        },
        {
          id: "pad_a",
          type: "Foundation",
          placement: { anchor: { x: 9, y: 0, z: 6 }, size: { width: 3, height: 1, length: 3 } },
        },
        {
          id: "pad_b",
          type: "Foundation",
          placement: { anchor: { x: 3, y: 0, z: 6 }, size: { width: 3, height: 1, length: 3 } },
        },
        {
          id: "tower",
          type: "Instance",
          placement: { assembly: "tiered_module", anchor: { x: 0, y: 1, z: 0 } },
        },
        {
          id: "ring",
          type: "RadialRepeat",
          placement: { source: "tower", center: { x: 6, z: 6 }, radius: 3, count: 2 },
        },
      ],
    };

    const result = analyzeComponentPlanSupport(plan);

    expect(result.diagnostics.some((diagnostic) => diagnostic.sourceNodeId === "ring__tower_0__slab__platform")).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.sourceNodeId === "ring__tower_1__slab__platform")).toBe(false);
    expect(result.summary.qualityGate.status).toBe("block");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "FLOATING_SOURCE_NODE",
      sourceNodeId: "ring__tower_0__spire__post",
    }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "FLOATING_SOURCE_NODE",
      sourceNodeId: "ring__tower_1__spire__post",
    }));
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED",
      sourceNodeId: "ring__tower_0__spire__post",
    }));
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED",
      sourceNodeId: "ring__tower_1__spire__post",
    }));
  });

  it("distinguishes connected side-supported spans from disconnected components", () => {
    const plan = basePlan([
      {
        id: "left_pier",
        type: "Foundation",
        placement: { anchor: { x: 1, y: 0, z: 1 }, size: { width: 2, height: 4, length: 2 } },
      },
      {
        id: "right_pier",
        type: "Foundation",
        placement: { anchor: { x: 7, y: 0, z: 1 }, size: { width: 2, height: 4, length: 2 } },
      },
      {
        id: "bridge_span",
        type: "Platform",
        inputs: [{ ref: "left_pier" }, { ref: "right_pier" }],
        placement: { anchor: { x: 1, y: 4, z: 1 }, size: { width: 8, height: 1, length: 2 } },
      },
    ]);

    const result = analyzeComponentPlanSupport(plan);

    expect(result.disconnectedBlocks).toBe(0);
    expect(result.summary.qualityGate.status).toBe("review");
    expect(result.summary.diagnostics.reviewDiagnostics).toBe(1);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED",
      sourceNodeId: "bridge_span__platform",
    }));
  });

  it("treats blocks at or below groundY as connected roots", () => {
    const result = analyzeVoxelSupport({
      version: "0.1",
      name: "Subsurface Plan",
      size: [4, 4, 4],
      origin: [0, 0, 0],
      blocks: [{
        pos: [1, -1, 1],
        block: { name: "minecraft:stone" },
        sourceNodeId: "basement",
      }],
    }, { groundY: 0 });

    expect(result.disconnectedBlocks).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });

  it("filters decorative railing diagnostics by default", () => {
    const plan = basePlan([
      {
        id: "base",
        type: "Foundation",
        placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 8, height: 1, length: 8 } },
      },
      {
        id: "deck",
        type: "Platform",
        inputs: [{ ref: "base" }],
        placement: { anchor: { x: 0, y: 1, z: 0 }, size: { width: 8, height: 1, length: 8 } },
      },
      {
        id: "rail",
        type: "RailingRun",
        inputs: [{ ref: "deck" }],
        placement: { anchor: { x: 0, y: 2, z: 0 }, size: { width: 8, height: 3, length: 1 } },
        options: { axis: "x", includeMidRail: true },
      },
    ]);

    const result = analyzeComponentPlanSupport(plan);
    const withAllowed = analyzeComponentPlanSupport(plan, { includeAllowed: true });

    expect(result.diagnostics.some((diagnostic) => diagnostic.sourceNodeId?.startsWith("rail__"))).toBe(false);
    expect(withAllowed.diagnostics.some((diagnostic) => diagnostic.code === "ALLOWED_NOT_VERTICALLY_SUPPORTED_BUT_CONNECTED")).toBe(true);
  });

  it("reports no floating diagnostics for a strict-policy rail on its declared input deck", () => {
    const plan = basePlan([
      {
        id: "base",
        type: "Foundation",
        placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 8, height: 1, length: 8 } },
      },
      {
        id: "post_a",
        type: "SupportPost",
        inputs: [{ ref: "base" }],
        placement: { anchor: { x: 1, y: 1, z: 1 }, size: { width: 1, height: 4, length: 1 } },
      },
      {
        id: "post_b",
        type: "SupportPost",
        inputs: [{ ref: "base" }],
        placement: { anchor: { x: 6, y: 1, z: 6 }, size: { width: 1, height: 4, length: 1 } },
      },
      {
        id: "deck",
        type: "Platform",
        inputs: [{ ref: "post_a" }, { ref: "post_b" }],
        placement: { anchor: { x: 0, y: 5, z: 0 }, size: { width: 8, height: 1, length: 8 } },
      },
      {
        id: "rail",
        type: "RailingRun",
        inputs: [{ ref: "deck" }],
        placement: { anchor: { x: 0, y: 6, z: 0 }, size: { width: 8, height: 3, length: 1 } },
        options: { axis: "x" },
        structural: { supportPolicy: "must_connect_to_input" },
      },
    ]);

    const result = analyzeComponentPlanSupport(plan);

    expect(result.disconnectedBlocks).toBe(0);
    expect(result.diagnostics.some((diagnostic) =>
      diagnostic.code === "FLOATING_SOURCE_NODE" || diagnostic.code === "DISCONNECTED_COMPONENT"
    )).toBe(false);
    expect(result.summary.qualityGate.status).toBe("review");
  });

  it("reports no floating diagnostics for a rail on an eave platform of a multi-level SteppedDome", () => {
    const plan = basePlan([
      {
        id: "base",
        type: "Foundation",
        placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 12, height: 1, length: 12 } },
      },
      {
        id: "dome",
        type: "SteppedDome",
        inputs: [{ ref: "base" }],
        placement: { anchor: { x: 2, y: 1, z: 2 }, size: { width: 8, height: 6, length: 8 } },
        options: { levels: 3, insetPerLevel: 1 },
      },
      {
        id: "eave",
        type: "Platform",
        inputs: [{ ref: "dome" }],
        placement: { anchor: { x: 0, y: 3, z: 0 }, size: { width: 12, height: 1, length: 12 } },
      },
      {
        id: "erail",
        type: "RailingRun",
        inputs: [{ ref: "eave" }],
        placement: { anchor: { x: 0, y: 4, z: 0 }, size: { width: 12, height: 3, length: 1 } },
        options: { axis: "x" },
        structural: { supportPolicy: "must_connect_to_input" },
      },
    ]);

    const result = analyzeComponentPlanSupport(plan);

    expect(result.disconnectedBlocks).toBe(0);
    expect(result.diagnostics.some((diagnostic) =>
      diagnostic.code === "FLOATING_SOURCE_NODE" || diagnostic.code === "DISCONNECTED_COMPONENT"
    )).toBe(false);
    for (const level of [0, 1, 2]) {
      expect(result.sourceSummaries.find((summary) => summary.sourceNodeId === `dome__dome_${level}`)?.disconnectedBlocks ?? 0).toBe(0);
    }
  });

  it("preserves true floating detection for a rail detached above its declared input", () => {
    const plan = basePlan([
      {
        id: "base",
        type: "Foundation",
        placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 12, height: 1, length: 12 } },
      },
      {
        id: "deck",
        type: "Platform",
        inputs: [{ ref: "base" }],
        placement: { anchor: { x: 0, y: 1, z: 0 }, size: { width: 12, height: 1, length: 12 } },
      },
      {
        id: "frail",
        type: "RailingRun",
        inputs: [{ ref: "deck" }],
        placement: { anchor: { x: 0, y: 9, z: 0 }, size: { width: 12, height: 3, length: 1 } },
        options: { axis: "x" },
        structural: { supportPolicy: "must_connect_to_input" },
      },
    ]);

    const result = analyzeComponentPlanSupport(plan);

    expect(result.summary.qualityGate.status).toBe("block");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "FLOATING_SOURCE_NODE",
      sourceNodeId: "frail__top_rail",
    }));
    expect(result.summary.qualityGate.blockingReasons).toEqual(["DISCONNECTED_COMPONENT", "FLOATING_SOURCE_NODE"]);
  });

  it("keeps fully floating section-scoped platforms and rails as blocking diagnostics", () => {
    const plan: ComponentPlanDocument = {
      version: "0.1",
      name: "Sectioned Float Plan",
      bounds: { width: 24, height: 24, length: 24 },
      palette: {
        foundation: "minecraft:stone",
        wall: "minecraft:stone",
        floor: "minecraft:oak_planks",
        roof: "minecraft:stone",
        glass: "minecraft:glass",
        door: "minecraft:oak_door",
        trim: "minecraft:oak_log",
      },
      sections: [
        {
          id: "tower_sec",
          origin: { x: 0, y: 0, z: 0 },
          bounds: { width: 24, height: 24, length: 24 },
          components: [
            {
              id: "sbase",
              type: "Foundation",
              placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 8, height: 1, length: 8 } },
            },
            {
              id: "sdeck",
              type: "Platform",
              inputs: [{ ref: "sbase" }],
              placement: { anchor: { x: 0, y: 4, z: 0 }, size: { width: 8, height: 1, length: 8 } },
            },
            {
              id: "srail",
              type: "RailingRun",
              inputs: [{ ref: "sdeck" }],
              placement: { anchor: { x: 0, y: 5, z: 0 }, size: { width: 8, height: 3, length: 1 } },
              options: { axis: "x" },
              structural: { supportPolicy: "must_connect_to_input" },
            },
          ],
        },
      ],
    };

    const result = analyzeComponentPlanSupport(plan);

    expect(result.summary.qualityGate.status).toBe("block");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "DISCONNECTED_COMPONENT",
      sourceNodeId: "tower_sec__sdeck__platform",
    }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "FLOATING_SOURCE_NODE",
      sourceNodeId: "tower_sec__srail__top_rail",
    }));
  });

  it("returns no diagnostics for a fully supported voxel build", () => {
    const result = analyzeVoxelSupport(voxelPlan([
      block([0, 0, 0], "base"),
      block([0, 1, 0], "wall"),
      block([0, 2, 0], "wall"),
    ]));

    expect(result.totalBlocks).toBe(3);
    expect(result.disconnectedBlocks).toBe(0);
    expect(result.verticalUnsupportedBlocks).toBe(0);
    expect(result.largeCantileverBlocks).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.summary).toMatchObject({
      totalBlocks: 3,
      disconnectedBlocks: 0,
      verticalUnsupportedBlocks: 0,
      largeCantileverBlocks: 0,
      diagnostics: {
        totalDiagnostics: 0,
        blockingDiagnostics: 0,
        reviewDiagnostics: 0,
        allowedDiagnostics: 0,
        byCode: {},
      },
      qualityGate: {
        status: "pass",
        blockingReasons: [],
        reviewReasons: [],
      },
    });
  });

  it("reports a disconnected floating voxel platform", () => {
    const result = analyzeVoxelSupport(voxelPlan([
      block([0, 0, 0], "base"),
      block([4, 4, 4], "floating_platform"),
      block([5, 4, 4], "floating_platform"),
      block([4, 4, 5], "floating_platform"),
      block([5, 4, 5], "floating_platform"),
    ]));

    expect(result.disconnectedBlocks).toBe(4);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "DISCONNECTED_COMPONENT",
      sourceNodeId: "floating_platform",
      count: 4,
    }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "FLOATING_SOURCE_NODE",
      sourceNodeId: "floating_platform",
      count: 4,
    }));
  });

  it("ignores intentional source patterns", () => {
    const result = analyzeVoxelSupport(voxelPlan([
      block([0, 0, 0], "base"),
      block([8, 5, 8], "decor_lantern"),
    ]), { ignoredSourceNodeIdPrefixes: ["decor_"] });

    expect(result.disconnectedBlocks).toBe(1);
    expect(result.diagnostics).toEqual([]);
    expect(result.sourceSummaries.some((summary) => summary.sourceNodeId === "decor_lantern")).toBe(false);
  });

  it("aggregates source-node support counts for agent feedback", () => {
    const result = analyzeVoxelSupport(voxelPlan([
      block([0, 0, 0], "base"),
      block([4, 4, 4], "floating_platform"),
      block([5, 4, 4], "floating_platform"),
      block([6, 4, 4], "floating_platform"),
    ]));

    expect(result.sourceSummaries).toContainEqual(expect.objectContaining({
      sourceNodeId: "floating_platform",
      count: 3,
      disconnectedBlocks: 3,
      verticalUnsupportedBlocks: 3,
      bounds: { min: [4, 4, 4], max: [6, 4, 4] },
    }));
  });

  it("treats explicit root boxes as configured support roots", () => {
    const result = analyzeVoxelSupport(voxelPlan([
      block([4, 4, 4], "elevated_root"),
      block([4, 5, 4], "tower"),
    ]), { rootBoxes: [{ min: [4, 4, 4], max: [4, 4, 4] }] });

    expect(result.disconnectedBlocks).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports large cantilevers beyond the configured threshold", () => {
    const blocks: VoxelBlock[] = [];
    for (let x = 0; x < 8; x++) {
      blocks.push(block([x, 2, 0], "bridge_span"));
    }
    blocks.push(block([0, 0, 0], "left_pier"));
    blocks.push(block([0, 1, 0], "left_pier"));
    blocks.push(block([7, 0, 0], "right_pier"));
    blocks.push(block([7, 1, 0], "right_pier"));

    const result = analyzeVoxelSupport(voxelPlan(blocks), { maxCantilever: 2 });

    expect(result.largeCantileverBlocks).toBeGreaterThan(0);
    expect(result.summary.qualityGate.status).toBe("review");
    expect(result.summary.qualityGate.reviewReasons).toContain("LARGE_CANTILEVER");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "LARGE_CANTILEVER",
      sourceNodeId: "bridge_span",
    }));
  });

  it("limits noisy diagnostics per source", () => {
    const result = analyzeVoxelSupport(voxelPlan([
      block([0, 0, 0], "base"),
      block([8, 4, 8], "floating_platform"),
    ]), { maxDiagnosticsPerSource: 1 });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.sourceNodeId === "floating_platform")).toHaveLength(1);
  });

  it("captures a large sample-style hull side shelf as disconnected source nodes", () => {
    const blocks: VoxelBlock[] = [];
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 3; y++) {
        blocks.push(block([x, y, 0], "hull_core"));
      }
    }
    for (let z = 2; z < 18; z++) {
      blocks.push(block([2, 5, z], "port_lifeboat_shelf__beam"));
    }

    const result = analyzeVoxelSupport(voxelPlan(blocks));

    expect(result.disconnectedBlocks).toBe(16);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "DISCONNECTED_COMPONENT",
      sourceNodeId: "port_lifeboat_shelf__beam",
      count: 16,
      bounds: { min: [2, 5, 2], max: [2, 5, 17] },
    }));
  });
});

function block(pos: [number, number, number], sourceNodeId: string): VoxelBlock {
  return {
    pos,
    block: { name: "minecraft:stone" },
    sourceNodeId,
  };
}

function voxelPlan(blocks: VoxelBlock[]): VoxelPlan {
  return {
    version: "0.1",
    name: "Voxel Support Test",
    size: [32, 32, 32],
    origin: [0, 0, 0],
    blocks,
  };
}
