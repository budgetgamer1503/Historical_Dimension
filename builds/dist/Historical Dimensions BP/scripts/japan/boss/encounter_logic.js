export function participantPressureCount(value) {
  const count = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 1;
  return Math.max(1, Math.min(4, count));
}

export function resolveLocalPosition(local, terrainOrigin = { x: 0, z: 0 }) {
  return {
    x: Number(local.x) + Number(terrainOrigin.x ?? 0),
    y: Number(local.y),
    z: Number(local.z) + Number(terrainOrigin.z ?? 0),
  };
}

export function targetCountForAbility(ability, participantCount) {
  const count = participantPressureCount(participantCount);
  const table = ability?.targetCounts ?? ability?.shape?.targetCounts ?? ability?.shape?.counts;
  if (!Array.isArray(table) || table.length === 0) return 1;
  return Math.max(1, Math.floor(Number(table[Math.min(count - 1, table.length - 1)]) || 1));
}

export function clampPointToZone(point, worldZone, inset = 0) {
  const radius = Math.max(1, Number(worldZone.participantRadius) - Math.max(0, Number(inset) || 0));
  const dx = Number(point.x) - Number(worldZone.center.x);
  const dz = Number(point.z) - Number(worldZone.center.z);
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance) || distance <= radius)
    return { x: Number(point.x), y: Number(point.y), z: Number(point.z) };
  const scale = radius / Math.max(distance, 1e-9);
  return {
    x: Number(worldZone.center.x) + dx * scale,
    y: Number(point.y),
    z: Number(worldZone.center.z) + dz * scale,
  };
}

export function directionToPoint(origin, target, fallback = { x: 0, z: -1 }) {
  const dx = Number(target?.x) - Number(origin?.x);
  const dz = Number(target?.z) - Number(origin?.z);
  const length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length <= 1e-9) {
    const fx = Number(fallback?.x) || 0;
    const fz = Number(fallback?.z) || 0;
    const fallbackLength = Math.hypot(fx, fz);
    return fallbackLength <= 1e-9 ? { x: 0, z: -1 } : { x: fx / fallbackLength, z: fz / fallbackLength };
  }
  return { x: dx / length, z: dz / length };
}

export function isPointInsideZone(point, worldZone, radiusOverride = undefined, yTolerance = 8) {
  const radius = Number.isFinite(Number(radiusOverride)) ? Number(radiusOverride) : Number(worldZone.participantRadius);
  const dx = Number(point?.x) - Number(worldZone.center.x);
  const dz = Number(point?.z) - Number(worldZone.center.z);
  return Math.hypot(dx, dz) <= radius
    && Math.abs(Number(point?.y) - Number(worldZone.center.y)) <= Math.max(0, Number(yTolerance) || 0);
}

export function zoneExitPoint(worldZone, margin = 3) {
  const direction = directionToPoint(worldZone.center, worldZone.approach, { x: 0, z: -1 });
  const distance = Number(worldZone.resetRadius) + Math.max(1, Number(margin) || 0);
  return {
    x: Number(worldZone.center.x) + direction.x * distance,
    y: Number(worldZone.center.y) + 1,
    z: Number(worldZone.center.z) + direction.z * distance,
  };
}
