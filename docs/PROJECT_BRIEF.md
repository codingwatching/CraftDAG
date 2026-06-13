# CraftDAG Project Brief

CraftDAG is a schema-first Minecraft build-plan compiler toolkit.

It is the open core behind MinePilot. MinePilot is the user-facing app; CraftDAG is the deterministic engine that turns structured building intent into target block state, metadata, and downstream outputs.

## Why this project exists

Most AI Minecraft experiments try to make a language model directly control a bot inside Minecraft. That path is impressive as a demo, but it is unstable for construction tasks. The model has to design the structure, remember the plan, reason about coordinates, handle block placement constraints, recover from errors, and interact with a live game environment.

CraftDAG takes a different approach:

```text
Natural language idea / product config
→ optional architectural brief
→ ComponentPlan
→ ComponentPlan validation
→ deterministic expansion
→ CraftDAG IR
→ CraftDAG schema + graph validation
→ voxel compilation
→ VoxelPlan
→ preview / material list / layer guide / file output / future executor
```

The model should not directly write Mineflayer code, WorldEdit commands, raw block placement commands, or arbitrary JavaScript. For most agent workflows, the model should produce a constrained, inspectable, repairable `ComponentPlan`. The deterministic engine expands that plan to low-level `CraftDAG` IR and compiles it to `VoxelPlan`.

## Core philosophy

1. LLMs are for intent translation, style selection, and plan generation.
2. `ComponentPlan` is the preferred agent-authored architectural DSL.
3. `CraftDAG` is the low-level deterministic compiler IR for structure, validation, determinism, and repeatability.
4. `VoxelPlan` is the compiled target-state IR.
5. Exporters and executors consume `VoxelPlan`, not raw model output.
6. The first version should be small, boring, and reliable.

This is closer to Terraform or Kubernetes desired-state thinking than to an autonomous game bot.

## Terminology

| Term | Role | Primary author | Purpose |
| --- | --- | --- | --- |
| `BuildIntent` | Product/input layer | User, UI, model adapter | Captures natural language, controls, references, or future vision-derived briefs. |
| `ComponentPlan` | High-level architectural DSL | LLMs, agents, templates, humans | Describes components such as rooms, doors, windows, roofs, and supports using semantic placement. |
| `CraftDAG` | Low-level compiler IR | Engine, templates, advanced tests | Represents deterministic primitive nodes and graph dependencies used for validation and compilation. |
| `VoxelPlan` | Target-state IR | Compiler output | Stores final block positions/states for preview, materials, layers, schematic export, and future executors. |

`DAG` is the dependency-graph discipline used inside `ComponentPlan` and low-level `CraftDAG`. It is not the entire project identity by itself.

## What CraftDAG is

CraftDAG is:

- a build-plan compiler toolkit for Minecraft-oriented construction workflows
- an agent-friendly `ComponentPlan` DSL and validation contract
- a deterministic expansion pipeline from `ComponentPlan` to low-level `CraftDAG` IR
- a schema-validated low-level graph IR of semantic building primitives
- a compiler from semantic primitives to voxel target state
- a source of material counts and layer-by-layer construction guides
- a foundation for file exporters and future executors

## What CraftDAG is not

CraftDAG is not:

- a general Minecraft agent
- a Mineflayer replacement
- a redstone generator
- a city generator
- a survival automation bot
- a Bedrock-first platform
- a free-form JavaScript execution environment
- a direct WorldEdit command generator

## Product relationship

CraftDAG and MinePilot should be separated:

```text
CraftDAG = open core build-plan compiler toolkit
MinePilot = user-facing product / playground / hosted app
```

CraftDAG should be usable without MinePilot. MinePilot should depend on CraftDAG as a library or package.

## Initial target

The first useful target is not a giant castle or full game automation. The first target is:

> Generate small, survival-friendly Java Edition builds that can be previewed, explained, and exported.

Good first build types:

- starter house
- watchtower
- small bridge
- mine entrance
- nether portal room
- storage room shell

Avoid first:

- large castles
- cities
- organic sculptures
- complex redstone
- pathfinding construction bot
- automatic survival resource gathering

## Recommended architecture

```text
ComponentPlan document
  ↓ component schema validation
  ↓ deterministic expansion
CraftDAG document
  ↓ CraftDAG schema validation
Validated document
  ↓ graph validation + topological sort
Semantic DAG
  ↓ primitive compilation
VoxelPlan
  ↓ derived outputs
Material list
Layer guide
Preview mesh data
Schematic-compatible file output
Future Litematica output
Future build queue
Future bot executor
```

## Main packages

Recommended TypeScript monorepo:

```text
packages/core
packages/cli
packages/exporter-schem
packages/renderer-data
examples
docs
```

### packages/core

Owns the domain model:

- `ComponentPlan` schema and expansion when enabled
- low-level `CraftDAG` schema
- primitive types
- graph validation
- topological sorting
- `VoxelPlan` IR
- primitive compilers
- material list generation
- layer guide generation

This package must not depend on MinePilot UI or Mineflayer.

### packages/cli

A developer-facing tool for local validation and compilation:

- validate a ComponentPlan or low-level CraftDAG file
- expand ComponentPlan to CraftDAG when supported
- compile to VoxelPlan JSON
- print material counts
- print layer data
- call exporters when available

### packages/exporter-schem

Converts VoxelPlan into a schematic-compatible output for Minecraft Java workflows.

This package should depend on VoxelPlan, not on ComponentPlan or CraftDAG nodes directly.

### packages/renderer-data

Optional later package. Converts VoxelPlan into a simple renderable data shape for web preview.

## Low-level CraftDAG document model

Low-level CraftDAG is the deterministic compiler IR. It should describe semantic primitives, not every final block, but it is still more coordinate-oriented than the agent-facing ComponentPlan layer.

For LLM authoring guidance, start with `docs/COMPONENT_PLAN_SPEC.md` and `docs/LLM_AUTHORING_CONTRACT.md`. Use raw CraftDAG generation only for low-level tests, fixtures, fallback templates, and advanced debugging.

Initial shape:

```ts
type CraftDagDocument = {
  version: "0.1"
  name: string
  size: Vec3
  palette?: Record<string, string>
  nodes: CraftDagNode[]
}
```

`size` defines the bounding box of the build in relative coordinates. Keep builds bounded from the start.

## Node model

Every node should have:

- `id`: unique stable identifier
- `type`: primitive type
- `inputs`: optional dependency references
- `params`: type-specific parameters

Example:

```json
{
  "id": "foundation",
  "type": "SolidBox",
  "params": {
    "from": [0, 0, 0],
    "to": [8, 0, 8],
    "block": "minecraft:stone_bricks"
  }
}
```

Dependencies should use references:

```json
"inputs": [{ "ref": "foundation" }]
```

Do not inline nodes inside inputs.

## Initial primitives

Start with a small primitive set:

- `SolidBox`
- `HollowBox`
- `Wall`
- `Floor`
- `Column`
- `Doorway`
- `Window`
- `GableRoof`

## Early success criteria

A build plan should be considered useful only if it can:

1. validate against schema
2. validate references and graph order
3. compile to bounded VoxelPlan
4. produce material list
5. produce layer guide
6. preview in MinePilot or a simple renderer
7. export through a tested file exporter when available
