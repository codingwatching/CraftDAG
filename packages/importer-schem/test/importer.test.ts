import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import nbt from "prismarine-nbt";
import { describe, it, expect } from "vitest";
import { exportToSchematic } from "../../exporter-schem/src/index.js";
import { importFromSchematic, importerVersion } from "../src/index.js";
import { compileComponentPlan } from "../../core/src/index.js";

const samplePlan = {
  version: "0.1" as const,
  name: "test",
  bounds: { width: 32, height: 24, length: 32 },
  palette: {
    foundation: "minecraft:stone",
    wall: "minecraft:stone_bricks",
    floor: "minecraft:oak_planks",
    roof: "minecraft:spruce_planks",
    trim: "minecraft:deepslate_bricks",
    glass: "minecraft:glass",
    door: "minecraft:dark_oak_door",
  },
  policy: { sizeTier: "small" as const },
  components: [
    {
      id: "base",
      type: "Foundation" as const,
      placement: { anchor: { x: 0, y: 0, z: 0 }, size: { width: 32, height: 1, length: 32 } },
    },
    {
      id: "walls",
      type: "RoomShell" as const,
      inputs: [{ ref: "base" }],
      placement: { anchor: { x: 4, y: 1, z: 4 }, size: { width: 24, height: 6, length: 24 } },
      options: { includeFloor: false, includeCeiling: false },
    },
    {
      id: "roof",
      type: "GableRoof" as const,
      inputs: [{ ref: "walls" }],
      placement: { over: "walls", direction: "x" as const },
    },
  ],
};

const probeB512Fixture = readFileSync(new URL("./fixtures/probe-b-512.schem", import.meta.url));
const probeBColumns = 512 * 512;
const probeBTargetOccupied = 1_000_000;
const probeBExtraColumns = probeBTargetOccupied % probeBColumns;

function probeBHash2(x: number, z: number): number {
  let n = (Math.imul(x >> 3, 0x45d9f3b) ^ Math.imul(z >> 3, 0x119de1f3) ^ 0x5f3759df) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0;
  return (n ^ (n >>> 16)) >>> 0;
}

function probeBExpectedBlock(x: number, y: number, z: number): string | undefined {
  const hash = probeBHash2(x, z);
  const landHeight = 5 + ((hash >>> 8) % 28);
  const layerCount = 3 + (hash % probeBColumns < probeBExtraColumns ? 1 : 0);
  const layer = y - (landHeight - layerCount);
  if (layer < 0 || layer >= layerCount) return undefined;
  if (layer === layerCount - 1) return landHeight > 23 ? "minecraft:stone" : "minecraft:grass_block";
  if (layer === layerCount - 2) return "minecraft:dirt";
  return "minecraft:stone";
}

function expectedProbeBOccupiedCount(): number {
  let count = 0;
  for (let z = 0; z < 512; z++) {
    for (let x = 0; x < 512; x++) {
      const hash = probeBHash2(x, z);
      count += 3 + (hash % probeBColumns < probeBExtraColumns ? 1 : 0);
    }
  }
  return count;
}

function makeSchematic(size: [number, number, number], blockData: number[] = [0], withEmptyBlockEntitiesList = false): Buffer {
  const [width, height, length] = size;
  const raw = nbt.writeUncompressed({
    type: "compound",
    name: "Schematic",
    value: {
      Version: { type: "int", value: 2 },
      DataVersion: { type: "int", value: 3463 },
      Width: { type: "short", value: width },
      Height: { type: "short", value: height },
      Length: { type: "short", value: length },
      Offset: { type: "intArray", value: [0, 0, 0] },
      PaletteMax: { type: "int", value: 1 },
      Palette: { type: "compound", value: { "minecraft:air": { type: "int", value: 0 } } },
      BlockData: { type: "byteArray", value: blockData },
      ...(withEmptyBlockEntitiesList ? { BlockEntities: { type: "list", value: { type: "compound", value: [] } } } : {}),
    },
  } as any);
  return zlib.gzipSync(raw);
}

describe("Schematic Importer metadata", () => {
  it("reports the current package version", () => {
    expect(importerVersion).toBe("0.2.6");
  });
});

describe("schematic importer", () => {
  it("round-trips export → import with matching block count", () => {
    const voxel = compileComponentPlan(samplePlan);
    const schematic = exportToSchematic(voxel);
    const imported = importFromSchematic(schematic, { name: voxel.name });

    expect(imported.blocks.length).toBe(voxel.blocks.length);
    expect(imported.size).toEqual(voxel.size);
    expect(imported.name).toBe(voxel.name);
  });

  it("preserves non-air block state names", () => {
    const voxel = compileComponentPlan(samplePlan);
    const schematic = exportToSchematic(voxel);
    const imported = importFromSchematic(schematic);

    const names = new Set(imported.blocks.map((b) => b.block.name));
    expect(names.has("minecraft:air")).toBe(false);
    expect(names.has("minecraft:stone")).toBe(true);
  });

  it("handles empty schematic (all air)", () => {
    const emptyPlan = {
      version: "0.1" as const,
      name: "empty",
      size: [4, 4, 4] as [number, number, number],
      origin: [0, 0, 0] as [number, number, number],
      blocks: [],
    };
    const schematic = exportToSchematic(emptyPlan);
    const imported = importFromSchematic(schematic);
    expect(imported.blocks.length).toBe(0);
    expect(imported.size).toEqual([4, 4, 4]);
  });

  it("reproduces the prismarine-nbt default 0xffffff array guard on the Probe B fixture", () => {
    const uncompressed = zlib.gunzipSync(probeB512Fixture);
    expect(() => nbt.parseUncompressed(uncompressed)).toThrow(/array size is abnormally large.*16777216/);
  });

  it("imports and exactly matches the Probe B 512×64×512 occupied coordinates", () => {
    const imported = importFromSchematic(probeB512Fixture, { name: "Probe B 512" });
    expect(imported.size).toEqual([512, 64, 512]);
    expect(imported.blocks).toHaveLength(997_632);
    expect(imported.blocks).toHaveLength(expectedProbeBOccupiedCount());

    // The importer emits each voxel position at most once from the full grid.
    // Matching every output position/material plus the expected count proves
    // the exact expected occupied set without keeping a second million-key Set.
    for (const block of imported.blocks) {
      const expectedBlock = probeBExpectedBlock(...block.pos);
      if (expectedBlock !== block.block.name) {
        throw new Error(`unexpected block ${block.block.name} at ${block.pos}; expected ${expectedBlock ?? "air"}`);
      }
    }
  }, 120_000);

  it("rejects a schematic volume above the measured safety bound", () => {
    const tooLarge = makeSchematic([512, 64, 513]);
    expect(() => importFromSchematic(tooLarge)).toThrow(/volume .* exceeds 16777216 cells/);
  });

  it("rejects compressed schematics above the input safety bound before gunzip", () => {
    const tooLarge = Buffer.alloc(16 * 1024 * 1024 + 1);
    expect(() => importFromSchematic(tooLarge)).toThrow(/compressed input exceeds 16777216 bytes/);
  });

  it("rejects uncompressed NBT above the gunzip safety bound", () => {
    const tooLarge = zlib.gzipSync(Buffer.alloc(32 * 1024 * 1024 + 1));
    expect(() => importFromSchematic(tooLarge)).toThrow(/uncompressed NBT exceeds 33554432 bytes/);
  });

  it("rejects oversized BlockData even when the compressed payload is small", () => {
    const uncompressed = zlib.gunzipSync(probeB512Fixture);
    const blockDataName = Buffer.from("BlockData");
    const nameIndex = uncompressed.indexOf(blockDataName);
    expect(nameIndex).toBeGreaterThan(0);
    uncompressed.writeInt32BE(24 * 1024 * 1024 + 1, nameIndex + blockDataName.length);
    const malformed = zlib.gzipSync(uncompressed);
    expect(() => importFromSchematic(malformed)).toThrow(/BlockData exceeds 25165824 bytes/);
  });

  it("does not lift the normal list bound when allowing large BlockData", () => {
    const uncompressed = zlib.gunzipSync(makeSchematic([1, 1, 1], [0], true));
    const listName = Buffer.from("BlockEntities");
    const nameIndex = uncompressed.indexOf(listName);
    expect(nameIndex).toBeGreaterThan(0);
    // NBT list layout is element type byte followed by signed 32-bit length.
    uncompressed.writeInt32BE(1_000_001, nameIndex + listName.length + 1);
    const malformed = zlib.gzipSync(uncompressed);
    expect(() => importFromSchematic(malformed)).toThrow(/NBT list exceeds 1000000 items/);
  });

  it("rejects large schematics whose decoded occupied count exceeds the safety bound", () => {
    const uncompressed = zlib.gunzipSync(probeB512Fixture);
    const blockDataName = Buffer.from("BlockData");
    const blockDataNameIndex = uncompressed.indexOf(blockDataName);
    const blockDataLength = uncompressed.readInt32BE(blockDataNameIndex + blockDataName.length);
    const payloadOffset = blockDataNameIndex + blockDataName.length + 4;
    let changed = 0;
    const additionalBlocks = 1_000_001 - 997_632;
    for (let i = payloadOffset; i < payloadOffset + blockDataLength && changed < additionalBlocks; i++) {
      if (uncompressed[i] === 0) {
        uncompressed[i] = 1;
        changed += 1;
      }
    }
    expect(changed).toBe(additionalBlocks);
    const overOccupiedLimit = zlib.gzipSync(uncompressed);
    expect(() => importFromSchematic(overOccupiedLimit)).toThrow(/at most 1000000 occupied blocks/);
  }, 120_000);

});
