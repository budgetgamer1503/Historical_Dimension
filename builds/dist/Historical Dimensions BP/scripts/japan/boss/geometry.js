const EPSILON = 1e-9;

export function distanceSquaredXZ(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dz = Number(a.z) - Number(b.z);
  return dx * dx + dz * dz;
}

export function normalizeXZ(vector) {
  const x = Number(vector.x) || 0;
  const z = Number(vector.z) || 0;
  const length = Math.hypot(x, z);
  if (length <= EPSILON) return { x: 0, z: -1 };
  return { x: x / length, z: z / length };
}

export function inCircle(point, center, radius) {
  const r = Math.max(0, Number(radius) || 0);
  return distanceSquaredXZ(point, center) <= r * r + EPSILON;
}

export function inRing(point, center, innerRadius, outerRadius) {
  const inner = Math.max(0, Number(innerRadius) || 0);
  const outer = Math.max(inner, Number(outerRadius) || 0);
  const distanceSquared = distanceSquaredXZ(point, center);
  return distanceSquared + EPSILON >= inner * inner && distanceSquared <= outer * outer + EPSILON;
}

export function inLine(point, origin, direction, length, width) {
  const forward = normalizeXZ(direction);
  const dx = Number(point.x) - Number(origin.x);
  const dz = Number(point.z) - Number(origin.z);
  const along = dx * forward.x + dz * forward.z;
  if (along < -EPSILON || along > Number(length) + EPSILON) return false;

  const rightX = -forward.z;
  const rightZ = forward.x;
  const across = Math.abs(dx * rightX + dz * rightZ);
  return across <= Number(width) / 2 + EPSILON;
}

export function inCone(point, origin, direction, range, angleDegrees) {
  const dx = Number(point.x) - Number(origin.x);
  const dz = Number(point.z) - Number(origin.z);
  const distance = Math.hypot(dx, dz);
  const maxRange = Math.max(0, Number(range) || 0);
  if (distance > maxRange + EPSILON) return false;
  if (distance <= EPSILON) return true;

  const forward = normalizeXZ(direction);
  const target = { x: dx / distance, z: dz / distance };
  const dot = Math.max(-1, Math.min(1, forward.x * target.x + forward.z * target.z));
  if (dot < -EPSILON) return false;
  const halfAngle = Math.max(0, Number(angleDegrees) || 0) * Math.PI / 360;
  return dot + EPSILON >= Math.cos(halfAngle);
}

export function rotateXZ(vector, degrees) {
  const radians = Number(degrees) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: Number(vector.x) * cosine - Number(vector.z) * sine,
    z: Number(vector.x) * sine + Number(vector.z) * cosine,
  };
}
