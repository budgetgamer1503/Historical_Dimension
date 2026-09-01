const SAFE_FLOORS = new Set([
  "minecraft:grass_block",
  "minecraft:dirt",
  "minecraft:coarse_dirt",
  "minecraft:stone",
  "minecraft:andesite",
  "minecraft:cobblestone",
  "minecraft:gravel",
  "minecraft:packed_mud",
  "minecraft:mud",
  "minecraft:podzol",
  "minecraft:sand",
  "minecraft:clay",
  "minecraft:spruce_planks",
]);

function candidateOffsets(radius) {
  const points = [{ x: 0, z: 0 }];
  for (let r = 2; r <= radius; r += 2) {
    for (let x = -r; x <= r; x += 2)
      points.push({ x, z: -r }, { x, z: r });
    for (let z = -r + 2; z <= r - 2; z += 2)
      points.push({ x: -r, z }, { x: r, z });
  }
  return points;
}

function groundBelowTop(top) {
  let block = top;
  for (let depth = 0; block && depth <= 5; depth++) {
    if (SAFE_FLOORS.has(block.typeId)) return block;
    if (block.isLiquid || block.isWaterlogged) return undefined;
    if (block.typeId === "minecraft:barrier"
      || block.typeId.endsWith("_leaves")
      || block.typeId.endsWith("_log")
      || block.typeId.endsWith("_wood"))
      return undefined;
    try { block = block.below(); } catch { return undefined; }
  }
  return undefined;
}

function hasTwoAirBlocks(dimension, x, floorY, z) {
  const feet = dimension.getBlock({ x, y: floorY + 1, z });
  const head = dimension.getBlock({ x, y: floorY + 2, z });
  return feet?.isAir === true && head?.isAir === true;
}

export function findSafeSurfaceNear(dimension, desired, searchRadius = 12) {
  for (const offset of candidateOffsets(Math.max(0, Math.floor(searchRadius)))) {
    const x = Math.floor(Number(desired.x) + offset.x);
    const z = Math.floor(Number(desired.z) + offset.z);
    try {
      if (!dimension.isChunkLoaded({ x, y: Number(desired.y ?? 80), z })) continue;
      const top = dimension.getTopmostBlock({ x, z });
      const floor = top ? groundBelowTop(top) : undefined;
      if (!floor) continue;
      if (!hasTwoAirBlocks(dimension, x, floor.location.y, z)) continue;
      return { x: x + 0.5, y: floor.location.y + 1, z: z + 0.5 };
    } catch {}
  }
  return undefined;
}

export function surfaceSnapshot(dimension, desired, searchRadius = 12) {
  const location = findSafeSurfaceNear(dimension, desired, searchRadius);
  return location
    ? { ready: true, location }
    : { ready: false, location: undefined };
}
