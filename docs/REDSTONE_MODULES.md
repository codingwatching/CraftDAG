# Redstone Modules

## Status

This document defines the first implementation boundary for functional redstone builds after CraftDAG v0.2.0.

Redstone support is a deterministic module system, not arbitrary circuit synthesis. Agents select and configure verified modules; module expanders own exact block positions and states.

## First target

- Edition: Minecraft Java Edition
- Version target: `java_1_21`
- First module: `ItemSorterSlice`
- First operating mode: manual filter initialization
- Output path: module config -> validated module -> VoxelPlan -> schematic

Bedrock behavior, cross-version equivalence, and free-form redstone generation are out of scope.

## Why modules are separate

Architectural ComponentPlan components describe bounded shape and composition. Redstone modules additionally require:

- exact directional block states;
- stable signal input and output locations;
- required air and clearance cells;
- module-specific connectivity invariants;
- version-specific behavior;
- initialization and troubleshooting metadata;
- real-game verification evidence.

These rules should not be spread across general architectural component validation.

## Proposed public contract

```ts
type RedstoneFacing = "north" | "east" | "south" | "west";
type RedstoneVersionTarget = "java_1_21";

type RedstoneModulePlan = {
  version: "0.1";
  name: string;
  versionTarget: RedstoneVersionTarget;
  bounds: { width: number; height: number; length: number };
  modules: RedstoneModuleInstance[];
};

type RedstoneModuleInstance = {
  id: string;
  type: "ItemSorterSlice";
  placement: {
    anchor: { x: number; y: number; z: number };
    facing: RedstoneFacing;
  };
  options: {
    filterItem: string;
    fillerItem?: string;
    initializeFilter?: false;
  };
};
```

`initializeFilter: true` is intentionally unsupported until VoxelPlan and the schematic exporter have an explicit block-entity contract.

## Expansion rules

Each module has one canonical south-facing local layout. Expansion must:

1. validate the module config;
2. rotate local coordinates and directional block states for the requested facing;
3. shift the layout to the anchor;
4. validate global bounds and clearance;
5. emit ordinary VoxelPlan blocks;
6. attach module metadata, initialization steps, and diagnostics.

Rotation must use explicit state transforms. Coordinate rotation without updating properties such as `facing`, repeater delay, hopper direction, or comparator mode is invalid.

## Module metadata

The compiled result needs metadata alongside VoxelPlan:

```ts
type CompiledRedstoneModule = {
  plan: VoxelPlan;
  moduleId: string;
  moduleType: "ItemSorterSlice";
  versionTarget: "java_1_21";
  verified: boolean;
  requiresManualInitialization: boolean;
  ports: Array<{
    id: string;
    kind: "item_input" | "item_output" | "overflow_output" | "signal_output";
    pos: Vec3;
    facing: RedstoneFacing;
  }>;
  criticalBlocks: Array<{ role: string; pos: Vec3 }>;
  initializationSteps: string[];
  troubleshooting: string[];
};
```

This metadata must not be encoded as decorative blocks or inferred again from the compiled voxel set.

## Validation stages

### Schema validation

- known module type and version target;
- integer, non-negative anchor;
- supported facing;
- valid namespaced item identifiers;
- unsupported initialization options rejected explicitly.

### Spatial validation

- rotated module bounds stay inside the plan;
- required air cells remain clear;
- module instances do not collide unless a declared port connection permits it;
- input, output, and maintenance clearance remain accessible.

### Static redstone validation

- filter hopper exists and faces the expected output direction;
- comparator reads the filter hopper;
- repeater/comparator properties match the rotated facing;
- torch lock path and dust path contain every required block;
- output hopper/container path exists;
- all critical positions contain the expected block and state.

### Verification status

Unit tests prove deterministic expansion and invariants. They do not prove Minecraft runtime behavior. A module becomes `verified: true` only after an in-game Java 1.21 smoke test is recorded with the fixture version.

## ItemSorterSlice stages

### Stage 0: Manual initialization fixture

- deterministic single-slice layout;
- exact hopper/comparator/repeater/torch/dust states;
- material and layer output;
- schematic export;
- initialization and troubleshooting instructions;
- static invariant tests;
- `requiresManualInitialization: true`.

### Stage 1: Block entities

Add a typed block-entity payload to VoxelPlan and schematic export before supporting initialized hopper inventories. The contract must preserve coordinates, NBT payloads, and version targeting through round trips.

### Stage 2: Arrays

Build `ItemSorterArray` by repeating verified slices through declared ports and spacing rules. Do not duplicate the single-slice layout by hand.

## Package layout

Start inside core while the API is experimental:

```text
packages/core/src/redstone/
  types.ts
  schema.ts
  compileRedstoneModulePlan.ts
  orientation.ts
  modules/itemSorterSlice.ts
  validation/itemSorterSlice.ts
```

Split a package only when versioning or dependency pressure justifies it.

## Required tests for the first fixture

- all four facings produce rotated coordinates and block states;
- repeated compilation is byte-for-byte deterministic;
- every critical invariant has a failing negative test;
- bounds and clearance failures return structured diagnostics;
- material and layer guides include redstone blocks correctly;
- schematic export/import preserves directional block states;
- unsupported automatic initialization fails clearly;
- the fixture includes a documented Java 1.21 in-game smoke-test checklist.

## Non-goals

- arbitrary redstone coordinates authored by an LLM;
- a browser tick simulator;
- Bedrock redstone;
- automatic support for every Java version;
- block-entity initialization hidden behind untyped objects;
- claims of working behavior without an in-game verification record.
