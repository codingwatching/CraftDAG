import { describe, it, expect } from "vitest";
import { validateDocument, ValidationError } from "../src/index.js";

describe("Schema Validation", () => {
  const validDoc = {
    version: "0.1",
    name: "Starter House",
    size: [10, 8, 10],
    palette: {
      stone: "minecraft:stone_bricks",
    },
    nodes: [
      {
        id: "foundation",
        type: "SolidBox",
        params: {
          from: [0, 0, 0],
          to: [9, 0, 9],
          block: "stone",
        },
      },
      {
        id: "walls",
        type: "HollowBox",
        inputs: [{ ref: "foundation" }],
        params: {
          from: [0, 1, 0],
          to: [9, 4, 9],
          block: "minecraft:oak_planks",
        },
      },
    ],
  };

  it("should validate a correct document structure", () => {
    const result = validateDocument(validDoc);
    expect(result.name).toBe("Starter House");
    expect(result.nodes.length).toBe(2);
  });

  it("should reject documents with incorrect version", () => {
    const invalidDoc = { ...validDoc, version: "0.2" };
    expect(() => validateDocument(invalidDoc)).toThrow(ValidationError);
  });

  it("should reject documents with invalid coordinates (negative size)", () => {
    const invalidDoc = { ...validDoc, size: [10, -8, 10] };
    expect(() => validateDocument(invalidDoc)).toThrow(ValidationError);
  });

  it("should reject documents with extra root fields", () => {
    const invalidDoc = { ...validDoc, extraField: "invalid" };
    expect(() => validateDocument(invalidDoc)).toThrow(ValidationError);
  });

  it("should reject unknown node types", () => {
    const invalidDoc = {
      ...validDoc,
      nodes: [
        {
          id: "node1",
          type: "SuperFancyFeature",
          params: { from: [0, 0, 0], to: [1, 1, 1] },
        },
      ],
    };
    expect(() => validateDocument(invalidDoc)).toThrow(ValidationError);
  });

  it("should reject duplicate node IDs", () => {
    const invalidDoc = {
      ...validDoc,
      nodes: [
        {
          id: "node1",
          type: "SolidBox",
          params: { from: [0, 0, 0], to: [1, 0, 1], block: "stone" },
        },
        {
          id: "node1",
          type: "SolidBox",
          params: { from: [2, 0, 2], to: [3, 0, 3], block: "stone" },
        },
      ],
    };
    expect(() => validateDocument(invalidDoc)).toThrow(ValidationError);
    expect(() => validateDocument(invalidDoc)).toThrow("Duplicate node ID found");
  });

  it("should reject missing input references", () => {
    const invalidDoc = {
      ...validDoc,
      nodes: [
        {
          id: "walls",
          type: "HollowBox",
          inputs: [{ ref: "non_existent_node" }],
          params: { from: [0, 1, 0], to: [9, 4, 9], block: "minecraft:oak_planks" },
        },
      ],
    };
    expect(() => validateDocument(invalidDoc)).toThrow(ValidationError);
    expect(() => validateDocument(invalidDoc)).toThrow("references non-existent node");
  });
});
