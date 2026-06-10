import { describe, it, expect } from "vitest";
import { generateMaterialList, generateLayerGuide, VoxelPlan } from "../src/index.js";

describe("Metadata Generators (Materials & Layers)", () => {
  const mockPlan: VoxelPlan = {
    version: "0.1",
    name: "Mock Plan",
    size: [5, 5, 5],
    origin: [0, 0, 0],
    blocks: [
      { pos: [0, 0, 0], block: { name: "minecraft:stone" } },
      { pos: [1, 0, 0], block: { name: "minecraft:stone" } },
      { pos: [0, 2, 0], block: { name: "minecraft:oak_planks" } },
      { pos: [1, 2, 0], block: { name: "minecraft:oak_stairs", properties: { facing: "north" } } },
      { pos: [2, 2, 0], block: { name: "minecraft:oak_stairs", properties: { facing: "north" } } },
      { pos: [0, 1, 0], block: { name: "minecraft:air" } }, // Should be ignored
    ],
  };

  it("should generate correct material counts ignoring air", () => {
    const list = generateMaterialList(mockPlan);
    expect(list.length).toBe(3);

    const stone = list.find(m => m.block.name === "minecraft:stone");
    expect(stone?.count).toBe(2);

    const planks = list.find(m => m.block.name === "minecraft:oak_planks");
    expect(planks?.count).toBe(1);

    const stairs = list.find(m => m.block.name === "minecraft:oak_stairs");
    expect(stairs?.count).toBe(2);
    expect(stairs?.block.properties).toEqual({ facing: "north" });
  });

  it("should generate layer guides sorted ascending and omitting empty layers (like Y=1)", () => {
    const layers = generateLayerGuide(mockPlan);
    
    // We have blocks at Y=0 and Y=2. Y=1 only has air, so it should be omitted.
    expect(layers.length).toBe(2);
    
    expect(layers[0].y).toBe(0);
    expect(layers[0].blocks.length).toBe(2);

    expect(layers[1].y).toBe(2);
    expect(layers[1].blocks.length).toBe(3);
  });
});
