import { VoxelBlock, VoxelPlan } from "../types.js";

export interface LayerGuide {
  y: number;
  blocks: VoxelBlock[];
}

/**
 * Generates a layer guide from a VoxelPlan.
 * Groups blocks by Y coordinate, sorts Y ascending, and filters out air blocks.
 * Empty layers are omitted.
 */
export function generateLayerGuide(plan: VoxelPlan): LayerGuide[] {
  const layersMap = new Map<number, VoxelBlock[]>();

  for (const blockObj of plan.blocks) {
    if (blockObj.block.name === "minecraft:air") {
      continue;
    }

    const y = blockObj.pos[1];
    const layerBlocks = layersMap.get(y) || [];
    layerBlocks.push(blockObj);
    layersMap.set(y, layerBlocks);
  }

  // Get and sort Y coordinates ascending
  const sortedYs = Array.from(layersMap.keys()).sort((a, b) => a - b);

  const guides: LayerGuide[] = [];
  for (const y of sortedYs) {
    const blocks = layersMap.get(y)!;
    if (blocks.length > 0) {
      guides.push({
        y,
        // Sort blocks inside the layer by Z then X for stable ordering
        blocks: blocks.sort((a, b) => {
          if (a.pos[2] !== b.pos[2]) return a.pos[2] - b.pos[2];
          return a.pos[0] - b.pos[0];
        }),
      });
    }
  }

  return guides;
}
