import { describe, it, expect } from "vitest";
import { compileDocument, CompileError, CraftDagDocument } from "../src/index.js";

describe("Comprehensive Primitive Compilers", () => {
  const baseDoc: Omit<CraftDagDocument, "nodes"> = {
    version: "0.1",
    name: "Primitive Test Suite",
    size: [10, 10, 10],
    palette: {
      stone: "minecraft:stone_bricks",
      wood: "minecraft:oak_planks",
      glass: "minecraft:glass",
      door: "minecraft:oak_door",
    },
  };

  describe("SolidBox", () => {
    it("should compile a 3x3x3 SolidBox with exact block counts and coordinates", () => {
      const doc: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "box",
            type: "SolidBox",
            params: {
              from: [1, 1, 1],
              to: [3, 3, 3], // 3x3x3 = 27 blocks
              block: "stone",
            },
          },
        ],
      };
      const plan = compileDocument(doc);
      expect(plan.blocks.length).toBe(27);
      
      // Verify all coordinates are in range [1..3]
      for (const block of plan.blocks) {
        expect(block.pos[0]).toBeGreaterThanOrEqual(1);
        expect(block.pos[0]).toBeLessThanOrEqual(3);
        expect(block.pos[1]).toBeGreaterThanOrEqual(1);
        expect(block.pos[1]).toBeLessThanOrEqual(3);
        expect(block.pos[2]).toBeGreaterThanOrEqual(1);
        expect(block.pos[2]).toBeLessThanOrEqual(3);
        expect(block.block.name).toBe("minecraft:stone_bricks");
        expect(block.sourceNodeId).toBe("box");
      }
    });
  });

  describe("Floor", () => {
    it("should compile a 5x5 Floor and enforce constant Y constraint", () => {
      const validDoc: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "floor",
            type: "Floor",
            params: {
              from: [0, 2, 0],
              to: [4, 2, 4], // 5x5 = 25 blocks at Y=2
              block: "wood",
            },
          },
        ],
      };
      const plan = compileDocument(validDoc);
      expect(plan.blocks.length).toBe(25);
      expect(plan.blocks.every(b => b.pos[1] === 2)).toBe(true);

      const invalidDoc: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "floor-invalid",
            type: "Floor",
            params: {
              from: [0, 2, 0],
              to: [4, 3, 4], // Y varies, invalid
              block: "wood",
            },
          },
        ],
      };
      expect(() => compileDocument(invalidDoc)).toThrow(CompileError);
    });
  });

  describe("Wall", () => {
    it("should compile a Wall with constant X or constant Z, and reject others", () => {
      const validWallZ: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "wall-z",
            type: "Wall",
            params: {
              from: [0, 1, 3],
              to: [4, 3, 3], // constant Z=3, length 5, height 3 = 15 blocks
              block: "stone",
            },
          },
        ],
      };
      const planZ = compileDocument(validWallZ);
      expect(planZ.blocks.length).toBe(15);
      expect(planZ.blocks.every(b => b.pos[2] === 3)).toBe(true);

      const invalidWall: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "wall-invalid",
            type: "Wall",
            params: {
              from: [0, 1, 0],
              to: [4, 3, 4], // varying X and Z, invalid
              block: "stone",
            },
          },
        ],
      };
      expect(() => compileDocument(invalidWall)).toThrow(CompileError);
    });
  });

  describe("Column", () => {
    it("should compile a Column with constant X and Z, and reject others", () => {
      const validColumn: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "col",
            type: "Column",
            params: {
              from: [5, 1, 5],
              to: [5, 5, 5], // height 5
              block: "wood",
            },
          },
        ],
      };
      const plan = compileDocument(validColumn);
      expect(plan.blocks.length).toBe(5);
      expect(plan.blocks.every(b => b.pos[0] === 5 && b.pos[2] === 5)).toBe(true);

      const invalidColumn: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "col-invalid",
            type: "Column",
            params: {
              from: [5, 1, 5],
              to: [6, 5, 5], // X varies, invalid
              block: "wood",
            },
          },
        ],
      };
      expect(() => compileDocument(invalidColumn)).toThrow(CompileError);
    });
  });

  describe("HollowBox", () => {
    it("should compile a 5x5x5 HollowBox with floor and ceiling by default (98 blocks)", () => {
      const doc: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "hollow",
            type: "HollowBox",
            params: {
              from: [0, 0, 0],
              to: [4, 4, 4], // 5x5x5. Total 125. Interior 3x3x3 = 27 empty. 125 - 27 = 98 blocks.
              block: "stone",
            },
          },
        ],
      };
      const plan = compileDocument(doc);
      expect(plan.blocks.length).toBe(98);

      // Verify that interior [1..3, 1..3, 1..3] contains zero blocks
      const interiorBlocks = plan.blocks.filter(
        b =>
          b.pos[0] >= 1 &&
          b.pos[0] <= 3 &&
          b.pos[1] >= 1 &&
          b.pos[1] <= 3 &&
          b.pos[2] >= 1 &&
          b.pos[2] <= 3
      );
      expect(interiorBlocks.length).toBe(0);
    });

    it("should omit the floor when includeFloor is false (89 blocks)", () => {
      const doc: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "hollow-no-floor",
            type: "HollowBox",
            params: {
              from: [0, 0, 0],
              to: [4, 4, 4],
              block: "stone",
              includeFloor: false,
            },
          },
        ],
      };
      const plan = compileDocument(doc);
      // Floor interior (3x3 = 9 blocks at y=0) omitted. Total = 98 - 9 = 89.
      expect(plan.blocks.length).toBe(89);

      // Check that at y=0, only borders are populated
      const floorBlocks = plan.blocks.filter(b => b.pos[1] === 0);
      expect(floorBlocks.length).toBe(16); // 5x5 outer ring has 16 blocks (25 - 9)
      expect(floorBlocks.every(b => b.pos[0] === 0 || b.pos[0] === 4 || b.pos[2] === 0 || b.pos[2] === 4)).toBe(true);
    });

    it("should omit the ceiling when includeCeiling is false (89 blocks)", () => {
      const doc: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "hollow-no-ceiling",
            type: "HollowBox",
            params: {
              from: [0, 0, 0],
              to: [4, 4, 4],
              block: "stone",
              includeCeiling: false,
            },
          },
        ],
      };
      const plan = compileDocument(doc);
      expect(plan.blocks.length).toBe(89);

      const ceilingBlocks = plan.blocks.filter(b => b.pos[1] === 4);
      expect(ceilingBlocks.length).toBe(16); // 5x5 outer ring at y=4
    });

    it("should omit both when includeFloor and includeCeiling are false (80 blocks)", () => {
      const doc: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "hollow-no-floor-no-ceiling",
            type: "HollowBox",
            params: {
              from: [0, 0, 0],
              to: [4, 4, 4],
              block: "stone",
              includeFloor: false,
              includeCeiling: false,
            },
          },
        ],
      };
      const plan = compileDocument(doc);
      // Omit 9 from floor and 9 from ceiling. Total = 98 - 18 = 80.
      expect(plan.blocks.length).toBe(80);
    });
  });

  describe("Doorway & Window", () => {
    it("should carve doorways and windows out of a SolidBox according to topological order", () => {
      const doc: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "wall",
            type: "SolidBox",
            params: {
              from: [0, 0, 0],
              to: [4, 2, 0], // 5x3x1 = 15 blocks
              block: "stone",
            },
          },
          {
            id: "door",
            type: "Doorway",
            inputs: [{ ref: "wall" }],
            params: {
              from: [2, 0, 0],
              to: [2, 1, 0], // carves y=0 and y=1 at x=2, z=0 (2 blocks)
              block: "door",
            },
          },
          {
            id: "win",
            type: "Window",
            inputs: [{ ref: "wall" }],
            params: {
              from: [0, 1, 0],
              to: [0, 1, 0], // replaces (0,1,0) with glass (1 block)
            },
          },
        ],
      };
      const plan = compileDocument(doc);
      expect(plan.blocks.length).toBe(15); // 15 blocks total (stone replaced by door/glass)

      // Doorway block at (2,0,0) and (2,1,0) should be minecraft:oak_door
      const doorBottom = plan.blocks.find(b => b.pos[0] === 2 && b.pos[1] === 0 && b.pos[2] === 0);
      const doorTop = plan.blocks.find(b => b.pos[0] === 2 && b.pos[1] === 1 && b.pos[2] === 0);
      expect(doorBottom?.block.name).toBe("minecraft:oak_door");
      expect(doorBottom?.sourceNodeId).toBe("door");
      expect(doorTop?.block.name).toBe("minecraft:oak_door");

      // Window block at (0,1,0) should be minecraft:glass
      const windowBlock = plan.blocks.find(b => b.pos[0] === 0 && b.pos[1] === 1 && b.pos[2] === 0);
      expect(windowBlock?.block.name).toBe("minecraft:glass");
      expect(windowBlock?.sourceNodeId).toBe("win");
    });
  });

  describe("GableRoof", () => {
    it("should compile a solid GableRoof along X axis", () => {
      const doc: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "roof",
            type: "GableRoof",
            params: {
              from: [0, 0, 0],
              to: [4, 2, 4], // width 5, height 3, length 5
              block: "wood",
              direction: "x",
            },
          },
        ],
      };
      const plan = compileDocument(doc);
      // For each X in [0..4]:
      // z=0,4 -> peak=0 -> y=0..0 (1 block) -> 2 * 1 = 2 blocks
      // z=1,3 -> peak=1 -> y=0..1 (2 blocks) -> 2 * 2 = 4 blocks
      // z=2   -> peak=2 -> y=0..2 (3 blocks) -> 1 * 3 = 3 blocks
      // Total per X = 9 blocks. Total for 5 X = 45 blocks.
      expect(plan.blocks.length).toBe(45);
      
      // Verify block at (0, 2, 2) is present, and check source ID
      const peakBlock = plan.blocks.find(b => b.pos[0] === 0 && b.pos[1] === 2 && b.pos[2] === 2);
      expect(peakBlock?.block.name).toBe("minecraft:oak_planks");
      expect(peakBlock?.sourceNodeId).toBe("roof");
    });

    it("should compile a solid GableRoof along Z axis", () => {
      const doc: CraftDagDocument = {
        ...baseDoc,
        nodes: [
          {
            id: "roof",
            type: "GableRoof",
            params: {
              from: [0, 0, 0],
              to: [4, 2, 4],
              block: "wood",
              direction: "z",
            },
          },
        ],
      };
      const plan = compileDocument(doc);
      expect(plan.blocks.length).toBe(45);
    });
  });
});
