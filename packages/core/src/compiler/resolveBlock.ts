import { BlockState } from "../types.js";

/**
 * Resolves a block string (possibly a palette key) into a BlockState.
 * Supports parsing block properties defined in brackets, e.g. "stone[facing=north]".
 */
export function resolveBlock(
  blockStr: string,
  palette?: Record<string, string>
): BlockState {
  let resolvedStr = blockStr;

  if (palette && palette[blockStr]) {
    resolvedStr = palette[blockStr];
  } else if (palette) {
    const braceIdx = blockStr.indexOf("[");
    if (braceIdx !== -1) {
      const base = blockStr.slice(0, braceIdx);
      const props = blockStr.slice(braceIdx);
      if (palette[base]) {
        resolvedStr = palette[base] + props;
      }
    }
  }

  const braceIdx = resolvedStr.indexOf("[");
  if (braceIdx === -1) {
    return { name: resolvedStr };
  }

  const name = resolvedStr.slice(0, braceIdx);
  const propsStr = resolvedStr.slice(braceIdx + 1, resolvedStr.length - 1);
  const properties: Record<string, string> = {};

  for (const pair of propsStr.split(",")) {
    const [k, v] = pair.split("=");
    if (k && v) {
      properties[k.trim()] = v.trim();
    }
  }

  return { name, properties };
}
