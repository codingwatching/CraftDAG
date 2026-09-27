# Complex Build Authoring Workflow

This guide helps an Agent choose and execute the right CraftDAG authoring route for a complex build. It complements [`LLM_AUTHORING_CONTRACT.md`](LLM_AUTHORING_CONTRACT.md), which remains the source of truth for ComponentPlan JSON and its schema.

## Mental model

Choose a representation for the shape and edits the build needs. Build size alone does not choose the route. All routes end at the ordinary `VoxelPlan` consumed by preview, material, layer, and schematic tools.

```text
semantic architecture
brief → ComponentPlan → CraftDAG → VoxelPlan

freeform geometry
brief/reference → source-controlled 3D source → deterministic OBJ
  → @i365dev/craftdag-adapter-mesh → VoxelPlan

bounded hybrid
semantic ComponentPlan → VoxelPlan A ─┐
geometry subsystem → adapter → VoxelPlan B ─┴→ deterministic final VoxelPlan
```

Do not convert a mesh back into ComponentPlan. Do not add a landmark-specific primitive to force a route to fit.

## Route selection

Before authoring, write a short route record. Score the pressures as `low`, `medium`, or `high`, with one sentence of evidence for each non-low score.

| Route | Select when |
| --- | --- |
| **Semantic** | Architectural decomposition is meaningful; repeated bays, levels, rooms, doors, circulation, or later semantic repair matter; current ComponentPlan vocabulary expresses the form without coordinate tables or one-off hacks. |
| **Mesh/freeform** | Silhouette or continuous form dominates; compound curvature or sculptural geometry matters; semantic parts would mainly describe approximation mechanics; a procedural 3D source is substantially clearer; and the shape remains recognizable at the target voxel scale. |
| **Hybrid** | Most of the build is naturally semantic and one bounded subsystem is geometry-heavy; that subsystem has a clear spatial boundary and can be compiled independently; final composition can use an explicit deterministic placement and overlap contract. |

Use this compact record outside strict ComponentPlan JSON:

```yaml
route: semantic | mesh | hybrid
intent: <what must read correctly>
semantic_pressure: <low|medium|high> — <evidence>
geometry_pressure: <low|medium|high> — <evidence>
hybrid_boundary: <none or bounded subsystem + boundary>
target_scale: <bounds or target height and why>
stop_condition: <observable reason to switch or downscope>
```

Choose the route with the clearest representation and cheapest reliable repair. A large conventional castle may remain semantic; a small organic statue may be mesh-first. A pagoda or palace can be semantic overall and hybrid only if a roof/eave subsystem is independently bounded and demonstrably cheaper as geometry. These are examples, not type rules.

Evidence already supports keeping ordinary houses, towers, and the Roman Colosseum semantic, while the mesh frontend is a narrow option for freeform, organic, and sculptural forms. The MinePilot Roman Colosseum work also showed that useful ellipse and repeated-arcade architecture can remain semantic; complexity alone is not a reason to switch.

## Semantic route

1. Read [`LLM_AUTHORING_CONTRACT.md`](LLM_AUTHORING_CONTRACT.md) and the nearest example under `examples/component-plans`.
2. Keep the route record separate from strict ComponentPlan JSON. Author named sections, assemblies, and instances where they express real architectural structure.
3. Build and use the ComponentPlan CLI commands from [`AGENT_TOOLKIT.md`](AGENT_TOOLKIT.md): validate, compile, inspect materials/layers/support, then preview and repair.
4. Repair the smallest diagnosed component or downscope. Do not replace semantic authoring with hundreds of coordinates merely to pass validation.

Use semantic authoring when interiors, openings, circulation, repeated architectural modules, or source-aware repair are part of the intent. See [`LARGE_BUILDS.md`](LARGE_BUILDS.md) for sections and assemblies.

## Mesh/freeform route

The mesh adapter currently consumes a deterministic OBJ subset and returns a regular `VoxelPlan`. Blender is an optional upstream authoring tool, never a CraftDAG runtime dependency. Prefer code-native procedural source or a headless Blender script over GUI-only edits because source and export settings can be reviewed and rerun.

### Source and artifact layout

Keep inputs with the MinePilot build or its source repository, not in CraftDAG core. A repeatable per-build layout can be:

```text
builds/<build-id>/mesh/
  source/                 # procedural source or .blend + headless export script
  generated/model.obj     # deterministic generated artifact
  generated/voxel-plan.json
  evidence.json           # route, tool versions, options, dimensions, counts, hashes
```

The source/script is the source of truth. Treat OBJ and VoxelPlan as generated artifacts. Preserve generated OBJ and evidence with a review when they are needed to reproduce a production result; do not commit large generated geometry as an unrelated CraftDAG benchmark.

Pin the Blender or procedural-tool version, generator dependencies, seed, coordinate convention, scale, and export settings. The same committed source and settings must regenerate the same OBJ bytes. Do not rely on GUI state, ambient scene objects, current selection, machine-specific paths, or unseeded randomness.

### Convert OBJ reproducibly

Pin `@i365dev/craftdag-adapter-mesh` in the consuming build repository's package manifest and lockfile. Call its current API from a source-controlled Node script there:

```bash
node builds/<build-id>/mesh/source/voxelize.mjs
```

The wrapper imports `objToVoxelPlan` from the pinned package, reads `generated/model.obj`, and writes stable JSON. When validating changes to the adapter itself from a CraftDAG checkout, build that package with `pnpm --filter @i365dev/craftdag-adapter-mesh build` before running the same wrapper against the local package output. Make every conversion option explicit:

```js
const plan = objToVoxelPlan(objText, {
  targetHeight: 64,
  maxBlocks: 100_000,
  voxelMode: "surface",
  defaultBlock: "minecraft:stone",
  name: "<build-id> mesh subsystem",
});
```

Choose the smallest `targetHeight` that preserves the required silhouette. Start around 32 or 64 blocks high and compare a preview; increase resolution only when a named important feature disappears. `maxBlocks` is a hard cap on both normalized bounding-box volume and occupied blocks, so choose it from the MinePilot build budget and pass it explicitly. Use `surface` for open meshes and thin shells, including organic forms where a solid fill fuses limbs or wings. Use `solid` only for a bounded, closed mesh when the filled interior is wanted. The adapter uses one explicit `defaultBlock`; OBJ materials, groups, transforms, and textures are not carried through.

Run the complete source generator and voxelizer twice from a clean checkout. Compare source hashes, OBJ hashes, and VoxelPlan hashes; byte differences are a reproducibility failure to investigate, not something to hand-edit in the OBJ. Hash the exact source files and exact output bytes with SHA-256. Record the command, tool and adapter versions, seed, all conversion options, `plan.size`, `plan.blocks.length`, and all three hashes in `evidence.json`.

### Review and repair

Inspect the VoxelPlan through MinePilot preview and downstream material/layer/schematic paths. Repair only the source geometry, deterministic generator, scale, voxel mode, or palette; keep every attempt and its hashes in the evidence record.

Use a bounded loop:

1. One Luna-class authoring attempt.
2. At most two evidence-driven source/parameter repairs, changing one cause at a time.
3. If the failure appears to be an authoring/tool misunderstanding, allow one fresh Luna retry with the evidence and route constraints.
4. Stop mesh work if the result is still unrecognizable at the allowed block budget, the source remains nondeterministic, repair cost exceeds a semantic plan, or important structure is lost at practical scale. Switch to ComponentPlan when semantics fit, otherwise simplify the requested form.
5. Use a stronger model only when a concrete remaining failure points to a capability gap in the ordinary model. Record that failure and why code or a fresh Luna attempt cannot address it first.

Do not ask a model to emit block lists or repeatedly inspect huge VoxelPlan JSON. Keep voxelization, bounds, budgets, sorting, and hashing deterministic.

## Hybrid route

Keep each frontend independent:

```text
semantic ComponentPlan → VoxelPlan A
geometry source → OBJ → adapter → VoxelPlan B
A + B → final VoxelPlan
```

Use this only for a real spatial boundary, such as an otherwise semantic building with one independently authored sculpture. Specify each part's stable ID, input plan hash, translation/alignment in one shared coordinate frame, final bounds and block budget, deterministic part order, and an explicit overlap rule before composing. A safe first contract is **reject all overlapping occupied positions**; move or reshape parts if they collide. Do not let iteration order silently decide which block wins.

The core exposes `VoxelPlan` (`version`, `name`, `size`, `origin`, `blocks`) and `VoxelGrid`. The grid bounds-checks positions and `setBlock` replaces an existing block at the same position; there is no reusable checked composition API that handles transforms, overlap policy, budgets, and provenance together. For a one-off hybrid, a consuming workflow can translate each input block into a chosen final frame, preflight bounds and total unique positions, reject collisions, then insert blocks in stable part/coordinate order. Preserve `sourceNodeId` with a part prefix where present and record part IDs, transforms, and input/output hashes in the evidence manifest. Keep the final object an ordinary VoxelPlan.

This PR documents that manual bounded contract; it does not add a core composition helper. If MinePilot needs repeated hybrid composition, the precise future helper is a deterministic `composeVoxelPlans(parts, { bounds, maxBlocks, overlap: "reject" })` that accepts stable part IDs, VoxelPlans, and integer translations; validates translated bounds and unique occupied positions before emission; sorts output deterministically; and preserves/prefixes source identity. Add other overlap policies only for a demonstrated product case.

Do not build a scene graph, CAD boolean system, generic CSG, arbitrary transforms, or mesh-to-ComponentPlan reconstruction.

## Evidence and MinePilot handoff

For every complex build retain:

- the route record and short reason for the selected representation;
- source commit and tool/dependency versions;
- exact deterministic regeneration command and all mesh conversion options;
- source, OBJ, and VoxelPlan SHA-256 hashes;
- target scale, bounds, voxel mode, block budget, material policy, actual dimensions, and block count;
- bounded repair attempts, route switches, or model escalations and their concrete evidence;
- fixed-view preview, support/material/layer review, and schematic round-trip evidence when applicable;
- final VoxelPlan and its source/part identity manifest.

Hand MinePilot one candidate containing the final VoxelPlan, route record, and artifact manifest. For a hybrid, include part IDs, per-part source hashes/versions and transforms, plus the final composed digest. Do not introduce a second target format or publish an unreviewed repair automatically. MinePilot #84 should use this handoff in its existing local `BuildPreview`, six fixed views, digest binding, visual review, and artifact-verification flow; its normal quality gates and human publication boundary stay authoritative. The local review bridge belongs in MinePilot, not this CraftDAG workflow PR.

## Anti-patterns

- Choosing mesh because the build is large, or choosing semantic because it is called a castle or temple.
- Forcing sculptural forms into a long coordinate table or forcing ordinary architecture through a mesh.
- Treating a generated OBJ as the only source when a procedural generator exists.
- Using uncontrolled Blender scene state or an unseeded procedural model.
- Leaving `targetHeight`, `voxelMode`, `maxBlocks`, or `defaultBlock` to an implicit default in a production record.
- Repairing meshes indefinitely, increasing block budgets without visual evidence, or escalating to a frontier model before one fresh Luna attempt.
- Silently overwriting overlaps when composing hybrid plans.
- Adding a landmark primitive, Blender dependency, mesh reverse-compiler, or generic scene/CAD framework for one build.

## Repository skill convention

This repository currently has no `.agents/` or `.codex/skills/` repository-local Agent skill convention. Its supported authoring surface is documentation plus the CLI/API in `AGENT_TOOLKIT.md`. Keep this workflow canonical here; do not add a new skill infrastructure for this task.
