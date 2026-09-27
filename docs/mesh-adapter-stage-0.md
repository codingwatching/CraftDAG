# Mesh adapter Stage 0 audit

## Architecture audit

- Issue #29 defines adapters around the deterministic core and allows direct `VoxelPlan` output when semantic recovery is not useful. Issues #28/#107 establish the existing `packages/importer-schem` precedent: source-specific parser package, core types as target, downstream metadata/export reuse.
- Core exports `VoxelPlan { version, name, size, origin, blocks }`. The current compiler, metadata helpers, CLI layers, and `packages/exporter-schem` consume it directly. Core currently validates CraftDAG/ComponentPlan inputs but exposes no dedicated VoxelPlan validator. The schematic importer also produces the interface directly.
- The clean boundary is a new `packages/adapter-mesh`: parse OBJ, normalize bounds, voxelize, choose one palette block, and return VoxelPlan. It must not be core code and must not infer ComponentPlan.
- A package is justified: it isolates format parsing and rasterization while retaining zero runtime dependencies beyond core. Blender, Three.js, and any LLM remain upstream file producers, outside the dependency graph.

## Stage 0 design

OBJ is selected for a zero-extra-dependency vertical slice. GLB remains a small follow-up at the package level but entails a glTF parser and deterministic scene-node transform handling. The API accepts target height, block budget, surface/solid mode, one fallback block, and a name. It translates minimum mesh bounds to zero and scales vertical extent exactly to target height, retaining aspect ratio on X/Z.

Solid mode uses voxel-center ray parity and should only be used with closed meshes. Surface mode rasterizes triangle/cell intersections with SAT and is defined for open surfaces. Bounding-volume and emitted-cell limits fail explicitly. Shell thickness, per-material mapping, arbitrary textures, and generic CAD repair are out of scope.

## Downstream proof and evidence

Four checked-in fixtures cover a cube, square pyramid, octahedron, and gabled cabin. With target height 8 in solid mode, results are:

| Fixture | Dimensions | Surface blocks | Solid blocks |
| --- | ---: | ---: | ---: |
| Cube | 8×8×8 | 296 | 512 |
| Square pyramid | 8×8×8 | 260 | 300 |
| Octahedron | 8×8×8 | 248 | 256 |
| Gabled cabin | 8×8×6 | 240 | 360 |

Tests repeat each input byte-for-byte, assert exact dimensions and solid counts, identical serialized plans, unique bounded occupancy, and normalized origin. A filled 4×4×4 cube has 64 blocks; its surface has 56. The 8-high cube passes through existing material aggregation, all eight layer guides, Sponge schematic export and schematic import round-trip.

The package emits the same ordinary VoxelPlan consumed by the downstream preview/export workflow; no parallel IR or exporter change is required. CraftDAG itself contains the exporter and metadata consumers, while MinePilot provides the user-facing preview, so this repository-level spike verifies schematic compatibility but does not launch MinePilot's renderer. There is no standalone VoxelPlan validator in current core, so validation evidence is contract assertions plus successful existing downstream consumers and schematic round-trip.

## Limitations and next step

Input is a deliberately small OBJ subset: `v`/`f`, polygon fan triangulation, positive/negative indices. Materials/MTL, UVs, normals, hierarchy, transforms, non-manifold repair, and guaranteed solid semantics for open meshes are unsupported. Extremely thin details may vanish. `maxBlocks` caps bounding volume as well as occupancy.

This demonstrates a clean, low-cost mesh-to-VoxelPlan frontend without core/runtime coupling. It is worth a bounded Stage 1 only if consumers want model-generated assets: add GLB support or a real fixture producer separately, then assess recognizable output quality. It does not establish any LLM generation or Minecraft-native refinement claim.
