import { describe, it, expect } from "vitest";
import { compileDocument, CompileError, CraftDagDocument } from "../src/index.js";

describe("Compilers Batch 1 (SolidBox, Floor, Wall, Column)", () => {
  const baseDoc: Omit<CraftDagDocument, "nodes"> = {
    version: "0.1",
    name: "Batch 1 Test",
    size: [10, 10, 10],
    palette: {
      stone: "minecraft:stone_bricks",
      wood: "minecraft:oak_planks",
    },
  };

  it("should compile SolidBox correctly with exact block counts", () => {
    const doc: CraftDagDocument = {
      ...baseDoc,
      nodes: [
        {
          id: "box",
          type: "SolidBox",
          params: {
            from: [0, 0, 0],
            to: [2, 2, 2], // 3x3x3 = 27 blocks
            block: "stone",
          },
        },
      ],
    };
    const plan = compileDocument(doc);
    expect(plan.blocks.length).toBe(27);
    expect(plan.blocks.every(b => b.block.name === "minecraft:stone_bricks")).toBe(true);
    expect(plan.blocks.every(b => b.sourceNodeId === "box")).toBe(true);
  });

  it("should compile Floor correctly and validate constant Y constraint", () => {
    const validDoc: CraftDagDocument = {
      ...baseDoc,
      nodes: [
        {
          id: "floor",
          type: "Floor",
          params: {
            from: [0, 1, 0],
            to: [4, 1, 4], // 5x5 = 25 blocks at Y=1
            block: "wood",
          },
        },
      ],
    };
    const plan = compileDocument(validDoc);
    expect(plan.blocks.length).toBe(25);
    expect(plan.blocks.every(b => b.pos[1] === 1)).toBe(true);

    const invalidDoc: CraftDagDocument = {
      ...baseDoc,
      nodes: [
        {
          id: "floor-invalid",
          type: "Floor",
          params: {
            from: [0, 1, 0],
            to: [4, 2, 4], // Changing Y, should fail
            block: "wood",
          },
        },
      ],
    };
    expect(() => compileDocument(invalidDoc)).toThrow(CompileError);
  });

  it("should compile Wall correctly and validate constant X or Z constraint", () => {
    const validWallX: CraftDagDocument = {
      ...baseDoc,
      nodes: [
        {
          id: "wall-x",
          type: "Wall",
          params: {
            from: [2, 0, 0],
            to: [2, 4, 9], // constant X=2, height 5, length 10 = 50 blocks
            block: "stone",
          },
        },
      ],
    };
    const planX = compileDocument(validWallX);
    expect(planX.blocks.length).toBe(50);
    expect(planX.blocks.every(b => b.pos[0] === 2)).toBe(true);

    const invalidWall: CraftDagDocument = {
      ...baseDoc,
      nodes: [
        {
          id: "wall-invalid",
          type: "Wall",
          params: {
            from: [0, 0, 0],
            to: [2, 4, 9], // X and Z both vary, should fail
            block: "stone",
          },
        },
      ],
    };
    expect(() => compileDocument(invalidWall)).toThrow(CompileError);
  });

  it("should compile Column correctly and validate constant X and Z constraint", () => {
    const validColumn: CraftDagDocument = {
      ...baseDoc,
      nodes: [
        {
          id: "col",
          type: "Column",
          params: {
            from: [3, 0, 3],
            to: [3, 4, 3], // constant X=3, Z=3, height 5 = 5 blocks
            block: "wood",
          },
        },
      ],
    };
    const plan = compileDocument(validColumn);
    expect(plan.blocks.length).toBe(5);
    expect(plan.blocks.every(b => b.pos[0] === 3 && b.pos[2] === 3)).toBe(true);

    const invalidColumn: CraftDagDocument = {
      ...baseDoc,
      nodes: [
        {
          id: "col-invalid",
          type: "Column",
          params: {
            from: [3, 0, 3],
            to: [4, 4, 3], // X varies, should fail
            block: "wood",
          },
        },
      ],
    };
    expect(() => compileDocument(invalidColumn)).toThrow(CompileError);
  });

  it("should support block properties mapping", () => {
    const doc: CraftDagDocument = {
      ...baseDoc,
      nodes: [
        {
          id: "col",
          type: "Column",
          params: {
            from: [0, 0, 0],
            to: [0, 0, 0],
            block: "minecraft:oak_stairs[facing=north,half=bottom]",
          },
        },
      ],
    };
    const plan = compileDocument(doc);
    expect(plan.blocks[0].block).toEqual({
      name: "minecraft:oak_stairs",
      properties: {
        facing: "north",
        half: "bottom",
      },
    });
  });
});
