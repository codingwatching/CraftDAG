import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { importFromSchematic } from "../packages/importer-schem/dist/index.js";

const fixturePath = new URL("../packages/importer-schem/test/fixtures/probe-b-512.schem", import.meta.url);
const fixture = await readFile(fixturePath);

function hash2(x, z) {
  let n = (Math.imul(x >> 3, 0x45d9f3b) ^ Math.imul(z >> 3, 0x119de1f3) ^ 0x5f3759df) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0;
  return (n ^ (n >>> 16)) >>> 0;
}

function expectedBlock(x, y, z) {
  const hash = hash2(x, z);
  const landHeight = 5 + ((hash >>> 8) % 28);
  const columns = 512 * 512;
  const extraColumns = 1_000_000 % columns;
  const layers = 3 + (hash % columns < extraColumns ? 1 : 0);
  const layer = y - (landHeight - layers);
  if (layer < 0 || layer >= layers) return undefined;
  if (layer === layers - 1) return landHeight > 23 ? "minecraft:stone" : "minecraft:grass_block";
  if (layer === layers - 2) return "minecraft:dirt";
  return "minecraft:stone";
}

const importStart = performance.now();
const plan = importFromSchematic(fixture, { name: "Probe B deterministic wide landscape 512" });
const importMs = performance.now() - importStart;
const peakRssBytesAfterImport = process.resourceUsage().maxRSS * 1024;

if (JSON.stringify(plan.size) !== JSON.stringify([512, 64, 512])) throw new Error(`unexpected dimensions: ${plan.size}`);
if (plan.blocks.length !== 997_632) throw new Error(`unexpected occupied count: ${plan.blocks.length}`);

const validationStart = performance.now();
for (const block of plan.blocks) {
  const expected = expectedBlock(...block.pos);
  if (expected !== block.block.name) {
    throw new Error(`unexpected block ${block.block.name} at ${block.pos}; expected ${expected ?? "air"}`);
  }
}
const exactPositionValidationMs = performance.now() - validationStart;

console.log(JSON.stringify({
  fixtureBytes: fixture.byteLength,
  dimensions: plan.size,
  occupiedBlocks: plan.blocks.length,
  exactPositionAndMaterialMatch: true,
  importMs,
  exactPositionValidationMs,
  peakRssBytesAfterImport,
  peakRssBytesAfterValidation: process.resourceUsage().maxRSS * 1024,
}));
