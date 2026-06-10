import { CompileError } from "../../errors.js";
import { CraftDagDocument, FloorNode } from "../../types.js";
import { VoxelGrid } from "../../voxel/VoxelGrid.js";
import { resolveBlock } from "../resolveBlock.js";

export function compileFloor(
  node: FloorNode,
  grid: VoxelGrid,
  doc: CraftDagDocument
): void {
  const { from, to, block } = node.params;
  
  if (from[1] !== to[1]) {
    throw new CompileError(
      `Floor node "${node.id}" must have a constant Y coordinate. Got from Y=${from[1]}, to Y=${to[1]}.`
    );
  }

  const blockState = resolveBlock(block, doc.palette);
  const y = from[1];

  const minX = Math.min(from[0], to[0]);
  const maxX = Math.max(from[0], to[0]);
  const minZ = Math.min(from[2], to[2]);
  const maxZ = Math.max(from[2], to[2]);

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      grid.setBlock([x, y, z], blockState, node.id);
    }
  }
}
