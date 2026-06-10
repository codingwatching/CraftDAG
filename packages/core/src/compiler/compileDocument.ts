import { CompileError } from "../errors.js";
import { sortNodes } from "../graph.js";
import { validateDocument } from "../schema.js";
import { CraftDagDocument, VoxelPlan } from "../types.js";
import { VoxelGrid } from "../voxel/VoxelGrid.js";
import { compileSolidBox } from "./primitives/solidBox.js";
import { compileFloor } from "./primitives/floor.js";
import { compileWall } from "./primitives/wall.js";
import { compileColumn } from "./primitives/column.js";

/**
 * Validates, topologically sorts, and compiles a CraftDAG document into a VoxelPlan.
 */
export function compileDocument(doc: CraftDagDocument): VoxelPlan {
  // Validate schema and references first
  const validatedDoc = validateDocument(doc);

  // Order nodes by dependency graph
  const sortedNodes = sortNodes(validatedDoc);

  // Initialize voxel grid
  const grid = new VoxelGrid(validatedDoc.size, [0, 0, 0], validatedDoc.name);

  // Compile each node in topological order
  for (const node of sortedNodes) {
    switch (node.type) {
      case "SolidBox":
        compileSolidBox(node, grid, validatedDoc);
        break;
      case "Floor":
        compileFloor(node, grid, validatedDoc);
        break;
      case "Wall":
        compileWall(node, grid, validatedDoc);
        break;
      case "Column":
        compileColumn(node, grid, validatedDoc);
        break;
      default:
        throw new CompileError(`Node type "${node.type}" compiler is not implemented yet.`);
    }
  }

  return grid.toVoxelPlan();
}
