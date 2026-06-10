import { CompileError } from "../../errors.js";
import { CraftDagDocument, WallNode } from "../../types.js";
import { VoxelGrid } from "../../voxel/VoxelGrid.js";
import { resolveBlock } from "../resolveBlock.js";

export function compileWall(
  node: WallNode,
  grid: VoxelGrid,
  doc: CraftDagDocument
): void {
  const { from, to, block } = node.params;

  if (from[0] !== to[0] && from[2] !== to[2]) {
    throw new CompileError(
      `Wall node "${node.id}" must have either constant X or constant Z coordinate. Got from=${from.join(",")}, to=${to.join(",")}.`
    );
  }

  const blockState = resolveBlock(block, doc.palette);

  const minX = Math.min(from[0], to[0]);
  const maxX = Math.max(from[0], to[0]);
  const minY = Math.min(from[1], to[1]);
  const maxY = Math.max(from[1], to[1]);
  const minZ = Math.min(from[2], to[2]);
  const maxZ = Math.max(from[2], to[2]);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        grid.setBlock([x, y, z], blockState, node.id);
      }
    }
  }
}
