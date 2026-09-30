# Issue #128: bounded large schematic import evidence

## Root cause

MinePilot Probe B's Sponge schematic is 512×64×512 with 997,632 occupied blocks. Its gzip file is 107,799 bytes and its NBT `BlockData` byte array is exactly 16,777,216 bytes. `prismarine-nbt@2.8.0` delegates to `protodef@1.19.0`, whose default array reader rejects counts above `0xffffff` (16,777,215). The default parser rejection is covered by the importer regression test.

## Safety boundary

The importer now bounds work before using Prismarine's supported `parseUncompressed(data, "big", { noArraySizeCheck: true })` option:

- compressed schematic input: at most 16 MiB;
- uncompressed NBT: at most 32 MiB, enforced by `gunzipSync({ maxOutputLength })`;
- dimensions: positive and at most 16,777,216 total cells;
- root `BlockData`: at most 24 MiB and at least one encoded byte per cell;
- all other NBT lists and arrays: at most 1,000,000 elements total, no more than 100,000 tags, and at most 64 levels deep;
- large-array imports: at most 1,000,000 decoded non-air blocks.

A no-allocation NBT preflight validates tag structure, declared collection lengths, dimensions, and the single permitted large array before the large-array parser option is enabled. The parser option is only used when the top-level `BlockData` exceeds the default `0xffffff` limit and the preflight passes. These limits intentionally bound the supported large-schematic envelope to the measured Probe B case and nearby inputs; larger volumes, larger BlockData, or over one million occupied blocks remain rejected.

## Probe B result

Exact MinePilot artifact: `packages/importer-schem/test/fixtures/probe-b-512.schem`.

| Dimensions | Bounding volume | Occupied | BlockData bytes | Compressed bytes | Import | Peak RSS after import | Exact position check |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 512×64×512 | 16,777,216 | 997,632 | 16,777,216 | 107,799 | 540.9 ms | 902,381,568 B (860.6 MiB) | Pass; all occupied coordinates and block names match the deterministic source geometry |

The separate exact-position verification took 17.0 ms and did not raise the process high-water mark beyond 902,381,568 B (860.6 MiB). This is a successful but memory-heavy import (`PASS_HEAVY`), not a comfortable-scale claim.

Environment: macOS 27.0 arm64, Node.js v22.22.3, pnpm 8.15.0. Reproduce after building the workspace:

```sh
pnpm build
node scripts/bench-probe-b-512.mjs
```

The benchmark script checks dimensions, occupied count, every occupied position, and material against the deterministic MinePilot Probe B generator formula without allocating a second million-position set.
