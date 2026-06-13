# CraftDAG

CraftDAG is a schema-first Minecraft build-plan compiler toolkit.

It provides an agent-friendly `ComponentPlan` DSL, lowers it into deterministic `CraftDAG` compiler IR, and compiles that into `VoxelPlan` for preview, material lists, layer guides, schematic export, and future executors.

CraftDAG is the open core engine behind MinePilot.

## What this repo contains

```text
BuildIntent
→ ComponentPlan DSL       agent-authored architectural plan
→ CraftDAG IR             deterministic low-level compiler graph
→ VoxelPlan               final target block-state representation
→ preview / materials / layers / schematic export / future executor
```

The repository is not just one JSON format. It is the compiler pipeline and supporting packages for validating, expanding, compiling, inspecting, and exporting Minecraft-oriented build plans.

## Terminology

| Term | Role | Primary author | Purpose |
| --- | --- | --- | --- |
| `BuildIntent` | Product/input layer | User, UI, model adapter | Captures natural language, controls, references, or future vision-derived briefs. |
| `ComponentPlan` | High-level architectural DSL | LLMs, agents, templates, humans | Describes components such as rooms, doors, windows, roofs, and supports using semantic placement. |
| `CraftDAG` | Low-level compiler IR | Engine, templates, advanced tests | Represents deterministic primitive nodes and graph dependencies used for validation and compilation. |
| `VoxelPlan` | Target-state IR | Compiler output | Stores final block positions/states for preview, materials, layers, schematic export, and future executors. |

`DAG` describes the dependency-graph discipline used by both `ComponentPlan` and low-level `CraftDAG`. It is not the whole product identity by itself.

## Mental model

```text
Natural language idea or product config
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

CraftDAG is not a general Minecraft agent. It is a deterministic build-plan engine.

For LLM and agent workflows, prefer `ComponentPlan`. Raw low-level `CraftDAG` should mainly be used for fixtures, tests, debugging, fallback template generation, and advanced compiler work.

## Key docs

Start here:

- [Project Brief](docs/PROJECT_BRIEF.md)
- [ComponentPlan v0.1 Spec](docs/COMPONENT_PLAN_SPEC.md)
- [LLM Authoring Contract](docs/LLM_AUTHORING_CONTRACT.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)

## Relationship with MinePilot

```text
CraftDAG = open core build-plan compiler toolkit
MinePilot = user-facing app, playground, model workflow, and hosted product
```

MinePilot should consume CraftDAG. CraftDAG should not depend on MinePilot.

## Early non-goals

- no live Minecraft bot
- no survival automation
- no redstone generation
- no Bedrock support
- no large city generation
- no free-form JavaScript execution

## Initial goal

The first useful version should validate and compile small, bounded Minecraft build plans into Voxel Plans, material lists, layer guides, and schematic-compatible exports.
