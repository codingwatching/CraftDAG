import { BlockState, VoxelPlan } from "../types.js";

export interface MaterialCount {
  block: BlockState;
  count: number;
}

/**
 * Serializes a BlockState into a stable string key for grouping.
 * Sorts properties alphabetically.
 */
export function stringifyBlockState(block: BlockState): string {
  if (!block.properties || Object.keys(block.properties).length === 0) {
    return block.name;
  }
  const propsStr = Object.entries(block.properties)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${block.name}[${propsStr}]`;
}

/**
 * Generates a list of material counts from a VoxelPlan.
 * Ignores minecraft:air and empty blocks.
 */
export function generateMaterialList(plan: VoxelPlan): MaterialCount[] {
  const countsMap = new Map<string, MaterialCount>();

  for (const blockObj of plan.blocks) {
    const { block } = blockObj;
    if (block.name === "minecraft:air") {
      continue;
    }

    const key = stringifyBlockState(block);
    const existing = countsMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      countsMap.set(key, {
        block: { ...block },
        count: 1,
      });
    }
  }

  // Sort by count descending or name ascending? Let's return them in alphabetical order of the key
  return Array.from(countsMap.values()).sort((a, b) =>
    stringifyBlockState(a.block).localeCompare(stringifyBlockState(b.block))
  );
}
