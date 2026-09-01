import { DIMENSION_ID } from "../config.js";

const DIRECTION_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function normalizeXZ(vector) {
  const x = Number(vector?.x) || 0;
  const z = Number(vector?.z) || 0;
  const length = Math.hypot(x, z);
  if (length < 1e-9) return { x: 0, z: -1 };
  return { x: x / length, z: z / length };
}

export function quantizeRelativeDirection(playerForward, targetVector) {
  const forward = normalizeXZ(playerForward);
  const target = normalizeXZ(targetVector);
  const right = { x: -forward.z, z: forward.x };
  const forwardAmount = target.x * forward.x + target.z * forward.z;
  const rightAmount = target.x * right.x + target.z * right.z;
  let degrees = Math.atan2(rightAmount, forwardAmount) * 180 / Math.PI;
  if (degrees < 0) degrees += 360;
  const index = Math.round(degrees / 45) % 8;
  return DIRECTION_LABELS[index];
}

export function waypointDistance(from, to) {
  return Math.round(Math.hypot(
    Number(to.x) - Number(from.x),
    Number(to.y ?? 0) - Number(from.y ?? 0),
    Number(to.z) - Number(from.z),
  ));
}

export function formatWaypointPayload(direction, bossName, distance) {
  return `HJW1:${direction} ${bossName} ${Math.max(0, Math.round(Number(distance) || 0))}m`;
}

export function buildWaypointPayload({ dimensionId, step, bossName, distance, direction }) {
  if (dimensionId !== DIMENSION_ID || Number(step) >= 5 || !bossName) return "";
  return formatWaypointPayload(direction, bossName, distance);
}

export function formatWaypointActionBar(bossName, distance) {
  return `§6${bossName} §7- §f${Math.max(0, Math.round(Number(distance) || 0))}m`;
}

export function buildWaypointActionBar({ dimensionId, step, bossName, distance }) {
  if (dimensionId !== DIMENSION_ID || Number(step) >= 5 || !bossName) return "";
  return formatWaypointActionBar(bossName, distance);
}

const CARDINAL_LABELS = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];

export function cardinalDirectionLabel(from, to) {
  const dx = Number(to?.x) - Number(from?.x);
  const dz = Number(to?.z) - Number(from?.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9))
    return "Here";
  let degrees = Math.atan2(dx, -dz) * 180 / Math.PI;
  if (degrees < 0) degrees += 360;
  return CARDINAL_LABELS[Math.round(degrees / 45) % 8];
}

export function formatBossApproachFallback(distance, direction) {
  return `§6Samurai Duel: §f${Math.max(0, Math.round(Number(distance) || 0))} blocks §e→ ${direction}`;
}
