import zlib from "node:zlib";
import nbt from "prismarine-nbt";
import { VoxelPlan, VoxelBlock, BlockState, Vec3 } from "@i365dev/craftdag-core";

interface SchematicData {
  version: number;
  dataVersion: number;
  width: number;
  height: number;
  length: number;
  offset: Vec3;
  paletteMax: number;
  palette: Map<number, BlockState>;
  blockIds: number[];
}

// Probe B establishes a concrete supported large-schematic envelope. Keep
// the larger parser path bounded to that volume and a modest NBT payload.
const MAX_COMPRESSED_SCHEMATIC_BYTES = 16 * 1024 * 1024;
const MAX_UNCOMPRESSED_NBT_BYTES = 32 * 1024 * 1024;
const MAX_SCHEMATIC_VOLUME = 16_777_216;
const MAX_BLOCK_DATA_BYTES = 24 * 1024 * 1024;
const MAX_OTHER_COLLECTION_ITEMS = 1_000_000;
const MAX_TOTAL_COLLECTION_ITEMS = 1_000_000;
const MAX_NBT_TAGS = 100_000;
const MAX_NBT_DEPTH = 64;
const MAX_LARGE_IMPORT_OCCUPIED_BLOCKS = 1_000_000;

interface SchematicPreflight {
  width: number;
  height: number;
  length: number;
  blockDataLength: number;
}

/**
 * Walk NBT tag headers and lengths without allocating tag arrays. This runs
 * before opting out of ProtoDef's array guard, so only the bounded root
 * BlockData byte array may exceed the ordinary collection limits.
 */
function preflightSchematic(uncompressed: Buffer): SchematicPreflight {
  let offset = 0;
  let tagCount = 0;
  let collectionItems = 0;
  let width: number | undefined;
  let height: number | undefined;
  let length: number | undefined;
  let blockDataLength: number | undefined;

  function requireBytes(count: number, description: string): void {
    if (!Number.isSafeInteger(count) || count < 0 || offset + count > uncompressed.length) {
      throw new Error(`Invalid schematic NBT: truncated ${description}`);
    }
  }

  function readByte(description: string): number {
    requireBytes(1, description);
    return uncompressed.readUInt8(offset++);
  }

  function readShort(description: string): number {
    requireBytes(2, description);
    const value = uncompressed.readInt16BE(offset);
    offset += 2;
    return value;
  }

  function readInt(description: string): number {
    requireBytes(4, description);
    const value = uncompressed.readInt32BE(offset);
    offset += 4;
    return value;
  }

  function readName(): string {
    const byteLength = readUnsignedShort("tag name length");
    requireBytes(byteLength, "tag name");
    const name = uncompressed.toString("utf8", offset, offset + byteLength);
    offset += byteLength;
    return name;
  }

  function readUnsignedShort(description: string): number {
    requireBytes(2, description);
    const value = uncompressed.readUInt16BE(offset);
    offset += 2;
    return value;
  }

  function consumeItems(count: number, description: string): void {
    if (count < 0 || count > MAX_OTHER_COLLECTION_ITEMS) {
      throw new Error(`Schematic safety limit exceeded: ${description} exceeds ${MAX_OTHER_COLLECTION_ITEMS} items`);
    }
    collectionItems += count;
    if (collectionItems > MAX_TOTAL_COLLECTION_ITEMS) {
      throw new Error(`Schematic safety limit exceeded: NBT collections exceed ${MAX_TOTAL_COLLECTION_ITEMS} total items`);
    }
  }

  function scanPayload(type: number, name: string | undefined, isRootTag: boolean, depth: number): void {
    if (depth > MAX_NBT_DEPTH) {
      throw new Error(`Schematic safety limit exceeded: NBT nesting exceeds ${MAX_NBT_DEPTH}`);
    }

    switch (type) {
      case 1: // byte
        requireBytes(1, "byte tag");
        offset += 1;
        return;
      case 2: { // short
        const value = readShort("short tag");
        if (isRootTag && name === "Width") width = value;
        if (isRootTag && name === "Height") height = value;
        if (isRootTag && name === "Length") length = value;
        return;
      }
      case 3: // int
      case 5: // float
        requireBytes(4, "32-bit tag");
        offset += 4;
        return;
      case 4: // long
      case 6: // double
        requireBytes(8, "64-bit tag");
        offset += 8;
        return;
      case 7: { // byte array
        const count = readInt("byte-array length");
        if (count < 0) throw new Error("Invalid schematic NBT: negative byte-array length");
        if (isRootTag && name === "BlockData") {
          if (blockDataLength !== undefined) throw new Error("Invalid schematic NBT: duplicate BlockData tag");
          if (count > MAX_BLOCK_DATA_BYTES) {
            throw new Error(`Schematic safety limit exceeded: BlockData exceeds ${MAX_BLOCK_DATA_BYTES} bytes`);
          }
          blockDataLength = count;
        } else {
          consumeItems(count, "non-BlockData byte array");
        }
        requireBytes(count, "byte-array payload");
        offset += count;
        return;
      }
      case 8: { // string
        const byteLength = readUnsignedShort("string length");
        requireBytes(byteLength, "string payload");
        offset += byteLength;
        return;
      }
      case 9: { // list
        const elementType = readByte("list element type");
        const count = readInt("list length");
        consumeItems(count, "NBT list");
        if (elementType < 0 || elementType > 12 || (elementType === 0 && count > 0)) {
          throw new Error("Invalid schematic NBT: invalid list element type or length");
        }
        for (let i = 0; i < count; i++) scanPayload(elementType, undefined, false, depth + 1);
        return;
      }
      case 10: { // compound
        for (;;) {
          const childType = readByte("compound tag type");
          if (childType === 0) return;
          if (childType < 1 || childType > 12) throw new Error("Invalid schematic NBT: unknown tag type");
          const childName = readName();
          tagCount += 1;
          if (tagCount > MAX_NBT_TAGS) {
            throw new Error(`Schematic safety limit exceeded: NBT contains more than ${MAX_NBT_TAGS} tags`);
          }
          scanPayload(childType, childName, false, depth + 1);
        }
      }
      case 11: // int array
      case 12: { // long array
        const count = readInt("numeric-array length");
        consumeItems(count, "NBT numeric array");
        const elementBytes = type === 11 ? 4 : 8;
        const byteLength = count * elementBytes;
        requireBytes(byteLength, "numeric-array payload");
        offset += byteLength;
        return;
      }
      default:
        throw new Error(`Invalid schematic NBT: unsupported tag type ${type}`);
    }
  }

  if (readByte("root tag type") !== 10) throw new Error("Invalid schematic NBT: root tag must be a compound");
  readName();
  for (;;) {
    const type = readByte("root tag type");
    if (type === 0) break;
    if (type < 1 || type > 12) throw new Error("Invalid schematic NBT: unknown root tag type");
    const name = readName();
    tagCount += 1;
    if (tagCount > MAX_NBT_TAGS) {
      throw new Error(`Schematic safety limit exceeded: NBT contains more than ${MAX_NBT_TAGS} tags`);
    }
    scanPayload(type, name, true, 1);
  }

  if (offset !== uncompressed.length) throw new Error("Invalid schematic NBT: unexpected trailing bytes");
  if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(length) || width! <= 0 || height! <= 0 || length! <= 0) {
    throw new Error("Invalid schematic: Width, Height, and Length must be positive short values");
  }
  const volume = width! * height! * length!;
  if (volume > MAX_SCHEMATIC_VOLUME) {
    throw new Error(`Schematic safety limit exceeded: volume ${volume} exceeds ${MAX_SCHEMATIC_VOLUME} cells`);
  }
  if (blockDataLength === undefined) throw new Error("Invalid schematic NBT: missing BlockData byte array");
  if (blockDataLength < volume) throw new Error(`Invalid schematic: BlockData has ${blockDataLength} bytes for ${volume} cells`);

  return { width: width!, height: height!, length: length!, blockDataLength };
}

function parseBlockState(str: string): BlockState {
  const bracketIdx = str.indexOf("[");
  if (bracketIdx === -1) return { name: str };
  const name = str.slice(0, bracketIdx);
  const propsStr = str.slice(bracketIdx + 1, -1);
  const properties: Record<string, string> = {};
  for (const pair of propsStr.split(",")) {
    const [key, value] = pair.split("=");
    if (key && value) properties[key.trim()] = value.trim();
  }
  return { name, properties };
}

function parseSchematic(buffer: Buffer): SchematicData {
  if (buffer.byteLength > MAX_COMPRESSED_SCHEMATIC_BYTES) {
    throw new Error(`Schematic safety limit exceeded: compressed input exceeds ${MAX_COMPRESSED_SCHEMATIC_BYTES} bytes`);
  }

  let uncompressed: Buffer;
  try {
    uncompressed = zlib.gunzipSync(buffer, { maxOutputLength: MAX_UNCOMPRESSED_NBT_BYTES });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
      throw new Error(`Schematic safety limit exceeded: uncompressed NBT exceeds ${MAX_UNCOMPRESSED_NBT_BYTES} bytes`);
    }
    throw error;
  }
  const preflight = preflightSchematic(uncompressed);
  const oversizedBlockData = preflight.blockDataLength > 0xffffff;
  let parsed: ReturnType<typeof nbt.parseUncompressed>;
  if (oversizedBlockData) {
    try {
      parsed = nbt.parseUncompressed(uncompressed, "big", { noArraySizeCheck: true });
    } catch (error) {
      throw new Error(`Unable to parse bounded large schematic NBT: ${(error as Error).message}`);
    }
  } else {
    parsed = nbt.parseUncompressed(uncompressed);
  }
  const root = (parsed as any).value;

  const version = root.Version?.value ?? 2;
  const dataVersion = root.DataVersion?.value ?? 0;
  const width = root.Width?.value ?? 0;
  const height = root.Height?.value ?? 0;
  const length = root.Length?.value ?? 0;
  const offset: Vec3 = root.Offset?.value ?? [0, 0, 0];
  const paletteMax = root.PaletteMax?.value ?? 0;

  const palette = new Map<number, BlockState>();
  const paletteCompound = root.Palette?.value ?? {};
  for (const [blockStr, entry] of Object.entries(paletteCompound)) {
    const id = (entry as any).value as number;
    palette.set(id, parseBlockState(blockStr));
  }

  const blockDataBytes: number[] = root.BlockData?.value ?? [];
  const blockIds: number[] = [];
  let occupiedBlockCount = 0;
  let i = 0;
  while (i < blockDataBytes.length) {
    let value = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = blockDataBytes[i++] & 0xff;
      value |= (byte & 0x7f) << shift;
      shift += 7;
    } while ((byte & 0x80) !== 0 && i < blockDataBytes.length);
    blockIds.push(value);
    const blockState = palette.get(value);
    if (oversizedBlockData && blockState && blockState.name !== "minecraft:air") {
      occupiedBlockCount += 1;
      if (occupiedBlockCount > MAX_LARGE_IMPORT_OCCUPIED_BLOCKS) {
        throw new Error(`Schematic safety limit exceeded: large imports may contain at most ${MAX_LARGE_IMPORT_OCCUPIED_BLOCKS} occupied blocks`);
      }
    }
  }

  const expectedCells = width * height * length;
  if (blockIds.length !== expectedCells) {
    throw new Error(`Invalid schematic: BlockData decoded to ${blockIds.length} cells; expected ${expectedCells}`);
  }

  return { version, dataVersion, width, height, length, offset, paletteMax, palette, blockIds };
}

export interface ImportOptions {
  name?: string;
}

export function importFromSchematic(schematicBuffer: Buffer, options?: ImportOptions): VoxelPlan {
  const data = parseSchematic(schematicBuffer);
  const { width, height, length, palette, blockIds, dataVersion } = data;

  const blocks: VoxelBlock[] = [];
  let blockIndex = 0;

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const id = blockIds[blockIndex++];
        const blockState = palette.get(id);
        if (blockState && blockState.name !== "minecraft:air") {
          blocks.push({
            pos: [x, y, z],
            block: blockState,
            sourceNodeId: `schem_import_${dataVersion}`,
          });
        }
      }
    }
  }

  return {
    version: "0.1",
    name: options?.name ?? "Imported Schematic",
    size: [width, height, length],
    origin: [0, 0, 0],
    blocks,
  };
}

export const importerVersion = "0.2.6";
