import { EntityComponentTypes, EntityDamageCause } from "@minecraft/server";
import { inCircle, inCone, inLine, inRing, normalizeXZ } from "./geometry.js";

function participantEntity(context, id) {
  try {
    const entity = context.world.getEntity(id);
    return entity?.typeId === "minecraft:player" && entity.isValid !== false ? entity : undefined;
  } catch {
    return undefined;
  }
}

export function combatParticipants(context) {
  return context.participantIds
    .map((id) => participantEntity(context, id))
    .filter((player) => player && player.dimension.id === context.dimension.id);
}

export function damagePlayer(player, boss, amount, cause = EntityDamageCause.entityAttack) {
  try {
    return player.applyDamage(Math.max(0, Number(amount) || 0), { cause, damagingEntity: boss });
  } catch {
    return false;
  }
}

export function applyShapeDamage(context, predicate, amount) {
  let dealt = 0;
  for (const player of combatParticipants(context)) {
    if (!predicate(player.location, player)) continue;
    if (damagePlayer(player, context.boss, amount)) dealt += Number(amount) || 0;
  }
  return dealt;
}

export function damageCircle(context, center, radius, amount) {
  return applyShapeDamage(context, (point) => inCircle(point, center, radius), amount);
}

export function damageRing(context, center, innerRadius, outerRadius, amount) {
  return applyShapeDamage(context, (point) => inRing(point, center, innerRadius, outerRadius), amount);
}

export function damageLine(context, origin, direction, length, width, amount) {
  return applyShapeDamage(context, (point) => inLine(point, origin, direction, length, width), amount);
}

export function damageCone(context, origin, direction, range, angle, amount) {
  return applyShapeDamage(context, (point) => inCone(point, origin, direction, range, angle), amount);
}

export function pushFromPoint(player, center, strength, vertical = 0.08) {
  try {
    const direction = normalizeXZ({ x: player.location.x - center.x, z: player.location.z - center.z });
    player.applyImpulse({ x: direction.x * strength, y: vertical, z: direction.z * strength });
  } catch {}
}

export function pullTowardPoint(player, center, strength) {
  try {
    const direction = normalizeXZ({ x: center.x - player.location.x, z: center.z - player.location.z });
    player.applyImpulse({ x: direction.x * strength, y: 0.03, z: direction.z * strength });
  } catch {}
}

export function healBoss(boss, amount) {
  try {
    const health = boss.getComponent(EntityComponentTypes.Health);
    if (!health) return 0;
    const before = health.currentValue;
    const target = Math.min(health.effectiveMax, before + Math.max(0, amount));
    health.setCurrentValue(target);
    return Math.max(0, target - before);
  } catch {
    return 0;
  }
}
