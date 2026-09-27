# `@i365dev/craftdag-adapter-mesh`

Stage 0 adapter from a small deterministic OBJ subset to CraftDAG's existing `VoxelPlan`. It has no runtime dependency beyond `@i365dev/craftdag-core`; it does not use Blender, Three.js, or a model API.

```ts
import { readFileSync } from "node:fs";
import { objToVoxelPlan } from "@i365dev/craftdag-adapter-mesh";

const plan = objToVoxelPlan(readFileSync("model.obj", "utf8"), {
  targetHeight: 32,
  maxBlocks: 100_000,
  voxelMode: "solid",
  defaultBlock: "minecraft:stone",
});
```

## Deterministic rules

- OBJ `v` and `f` records are parsed; polygon faces are fan-triangulated in file order. Positive and relative negative vertex indices are supported. Texture/normal references after the vertex index are ignored.
- The complete input bounds are translated to `(0,0,0)`. Vertical Y extent is scaled to `targetHeight`; X/Z preserve aspect ratio and round up to enclosing integer dimensions. No rotation, centering heuristic, external transform, or model-dependent step is applied.
- Triangle/cell intersection uses the triangle-box separating-axis test with a fixed `1e-9` tolerance. A set deduplicates face overlap. Output blocks are sorted Y, then Z, then X.
- `surface` emits every cell intersecting a triangle. `solid` adds cells whose centers have odd ray-intersection parity. Solid mode assumes a closed, consistently bounded mesh; non-manifold/open meshes can produce ambiguous fills. Surface mode works for open meshes.
- `maxBlocks` caps both normalized bounding-box volume and final occupied cells, so sparse oversized inputs fail before rasterization. Very thin features can disappear if they do not intersect a voxel cell.
- OBJ `usemtl` / MTL, normals, UVs, textures, groups, and scene transforms are not preserved. A single `defaultBlock` is used.

Errors are thrown for malformed indices, missing faces, zero extent on any axis, invalid options, and exceeded bounds/block budgets. Only OBJ is included in Stage 0. GLB would add a glTF parser and require explicit handling of scene-node transforms and mesh primitives; it is a contained follow-up, but not necessary to establish this frontend boundary.
