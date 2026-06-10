import { CompileError } from "../../errors.js";
import { CraftDagDocument, ColumnNode } from "../../types.js";
import { VoxelGrid } from "../../voxel/VoxelGrid.js";
import { resolveBlock } from "../resolveBlock.js";

export function compileColumn(
  node: ColumnNode,
  grid: VoxelGrid,
  doc: CraftDagDocument
): void {
  const { from, to, block } = node.params;

  if (from[0] !== to[0] || from[2] !== to[2]) {
    throw new CompileError(
      `Column node "${node.id}" must have constant X and Z coordinates. Got from=${from.join(",")}, to=${to.join(",")}.`
    );
  }

  const blockState = resolveBlock(block, doc.palette);

  const minY = Math.min(from[1], to[1]);
  const maxY = Math.max(from[1], to[1]);
  const x = from[0];
  const z = from[2];

  for (let y = minY; y <= maxY; y++) {
    grid.setBlock([x, y, z], blockState, node.id);
  }
}
