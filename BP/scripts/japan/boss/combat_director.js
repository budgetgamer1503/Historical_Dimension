import { system } from "@minecraft/server";
import { particlesForBossKey } from "./visual_identity.js";

const MOVEMENT_PROFILES = Object.freeze({
  jade_storm_ronin: Object.freeze({
    preferredMin: 3.2, preferredMax: 6.5,
    approach: 0.072, retreat: 0.070, strafe: 0.082,
    intervalMin: 10, intervalMax: 15,
  }),
  tsukikage_ghost_samurai: Object.freeze({
    preferredMin: 4.0, preferredMax: 7.5,
    approach: 0.064, retreat: 0.086, strafe: 0.105,
    intervalMin: 8, intervalMax: 13,
  }),
  oni_blood_warlord: Object.freeze({
    preferredMin: 1.8, preferredMax: 4.2,
    approach: 0.092, retreat: 0.042, strafe: 0.050,
    intervalMin: 10, intervalMax: 16,
  }),
  seiryu_dragon_daimyo: Object.freeze({
    preferredMin: 4.8, preferredMax: 8.8,
    approach: 0.060, retreat: 0.072, strafe: 0.086,
    intervalMin: 11, intervalMax: 17,
  }),
  kurogane_shogun: Object.freeze({
    preferredMin: 3.0, preferredMax: 6.0,
    approach: 0.060, retreat: 0.055, strafe: 0.060,
    intervalMin: 13, intervalMax: 19,
  }),
});

const DEFAULT_PROFILE = MOVEMENT_PROFILES.jade_storm_ronin;

const CLOSE_TYPES = new Set(["cone", "circle", "ring", "ring_then_circle", "combo", "counter_cone"]);
const MID_TYPES = new Set(["fan", "fan_rays", "cross_lines", "alternating_lines", "tether", "expanding_rings"]);
const RANGE_TYPES = new Set([
  "line", "advancing_lines", "target_circle", "target_circles",
  "arena_hazard_circles", "persistent_circle", "feint_lines", "rotating_sectors",
]);
const MULTI_TARGET_TYPES = new Set([
  "target_circle", "target_circles", "arena_hazard_circles",
  "persistent_circle", "fan_rays", "expanding_rings", "rotating_sectors",
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeXZ(vector, fallback = { x: 0, z: -1 }) {
  const x = Number(vector?.x) || 0;
  const z = Number(vector?.z) || 0;
  const length = Math.hypot(x, z);
  if (length > 1e-6) return { x: x / length, z: z / length };
  const fx = Number(fallback?.x) || 0;
  const fz = Number(fallback?.z) || -1;
  const fallbackLength = Math.hypot(fx, fz) || 1;
  return { x: fx / fallbackLength, z: fz / fallbackLength };
}

function participantEntity(context, id) {
  try {
    const entity = context.world.getEntity(id);
    if (entity?.typeId !== "minecraft:player" || entity.isValid === false) return undefined;
    if (entity.dimension.id !== context.dimension.id) return undefined;
    return entity;
  } catch {
    return undefined;
  }
}

function particle(context, particleId, point) {
  if (!particleId) return;
  try {
    context.dimension.spawnParticle(particleId, {
      x: Number(point.x),
      y: Number(point.y) + 0.12,
      z: Number(point.z),
    });
  } catch {}
}

function profileFor(context) {
  return MOVEMENT_PROFILES[context.def.key] ?? DEFAULT_PROFILE;
}

function randomInterval(profile) {
  const min = Math.max(1, Math.floor(profile.intervalMin));
  const max = Math.max(min, Math.floor(profile.intervalMax));
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pairwiseSpread(players) {
  let maximum = 0;
  for (let a = 0; a < players.length; a += 1) {
    for (let b = a + 1; b < players.length; b += 1) {
      maximum = Math.max(
        maximum,
        Math.hypot(
          players[a].location.x - players[b].location.x,
          players[a].location.z - players[b].location.z,
        ),
      );
    }
  }
  return maximum;
}

export function combatSnapshot(context) {
  const bossLocation = context.boss.location;
  const players = context.participantIds
    .map((id) => participantEntity(context, id))
    .filter(Boolean)
    .map((player) => ({
      player,
      distance: Math.hypot(
        player.location.x - bossLocation.x,
        player.location.z - bossLocation.z,
      ),
    }))
    .sort((a, b) => a.distance - b.distance);

  const distances = players.map((entry) => entry.distance);
  return {
    players: players.map((entry) => entry.player),
    nearest: players[0]?.player,
    nearestDistance: players[0]?.distance ?? Number.POSITIVE_INFINITY,
    averageDistance: distances.length > 0
      ? distances.reduce((sum, distance) => sum + distance, 0) / distances.length
      : Number.POSITIVE_INFINITY,
    spread: pairwiseSpread(players.map((entry) => entry.player)),
  };
}

export function tacticalAbilityWeight(context, ability, snapshot = combatSnapshot(context)) {
  const shape = ability?.shape ?? {};
  const type = shape.type ?? "";
  const distance = snapshot.nearestDistance;
  let multiplier = 1;

  if (Number.isFinite(distance)) {
    if (distance <= 3.2) {
      if (CLOSE_TYPES.has(type)) multiplier *= 1.35;
      if (shape.dash) multiplier *= 0.62;
      if (RANGE_TYPES.has(type)) multiplier *= 0.84;
    } else if (distance >= 9) {
      if (RANGE_TYPES.has(type) || shape.dash || shape.reposition) multiplier *= 1.45;
      if (CLOSE_TYPES.has(type)) multiplier *= 0.62;
    } else {
      if (MID_TYPES.has(type) || shape.dash || shape.reposition) multiplier *= 1.20;
    }
  }

  if (snapshot.players.length >= 2) {
    if (MULTI_TARGET_TYPES.has(type)) multiplier *= 1.25;
    if (type === "cone" && snapshot.spread > 7) multiplier *= 0.82;
  }
  if (snapshot.spread >= 9 && (type === "target_circles" || type === "arena_hazard_circles"))
    multiplier *= 1.20;

  if (context.phase >= 3 && ability.minPhase >= 3) multiplier *= 1.12;
  if (ability.ultimate) multiplier *= context.phase >= 4 ? 1.15 : 0.75;

  const recentShapes = context.recentShapeTypes ?? [];
  if (recentShapes[0] === type) multiplier *= 0.72;
  if (recentShapes.slice(0, 2).every((recentType) => recentType === type) && recentShapes.length >= 2)
    multiplier *= 0.55;

  return clamp(multiplier, 0.28, 2.25);
}

export function recordAbilityUse(context, ability) {
  context.recentAbilityIds = [
    ability.id,
    ...(context.recentAbilityIds ?? []).filter((id) => id !== ability.id),
  ].slice(0, 4);
  context.recentShapeTypes = [
    ability.shape?.type ?? "",
    ...(context.recentShapeTypes ?? []),
  ].slice(0, 4);
}

function steerInsideArena(context, desired) {
  const location = context.boss.location;
  const center = context.worldZone.center;
  const fromCenter = {
    x: location.x - center.x,
    z: location.z - center.z,
  };
  const distance = Math.hypot(fromCenter.x, fromCenter.z);
  const softRadius = Math.max(4, Number(context.worldZone.leashRadius) - 5);
  if (distance <= softRadius) return desired;

  const inward = normalizeXZ({ x: -fromCenter.x, z: -fromCenter.z });
  const pressure = clamp((distance - softRadius) / 5, 0.35, 1);
  return normalizeXZ({
    x: desired.x * (1 - pressure) + inward.x * pressure,
    z: desired.z * (1 - pressure) + inward.z * pressure,
  }, inward);
}

function movementVector(context, snapshot, profile) {
  const target = snapshot.nearest;
  if (!target) return undefined;
  const bossLocation = context.boss.location;
  const toward = normalizeXZ({
    x: target.location.x - bossLocation.x,
    z: target.location.z - bossLocation.z,
  });
  const side = { x: -toward.z, z: toward.x };
  const sign = context.strafeSign || 1;
  const distance = snapshot.nearestDistance;

  let desired;
  let strength;
  if (distance > profile.preferredMax) {
    desired = normalizeXZ({
      x: toward.x + side.x * sign * 0.22,
      z: toward.z + side.z * sign * 0.22,
    }, toward);
    strength = profile.approach;
  } else if (distance < profile.preferredMin) {
    desired = normalizeXZ({
      x: -toward.x + side.x * sign * 0.55,
      z: -toward.z + side.z * sign * 0.55,
    }, { x: -toward.x, z: -toward.z });
    strength = profile.retreat;
  } else {
    desired = normalizeXZ({
      x: side.x * sign + toward.x * 0.18,
      z: side.z * sign + toward.z * 0.18,
    }, side);
    strength = profile.strafe;
  }
  return { direction: steerInsideArena(context, desired), strength };
}

function emitFootworkTrail(context, direction, profile) {
  const family = particlesForBossKey(context.def.key);
  if (!family) return;
  const origin = context.boss.location;
  const right = { x: -direction.z, z: direction.x };
  const count = context.phase >= 3 ? 4 : 3;
  for (let index = 0; index < count; index += 1) {
    const back = 0.28 + index * 0.28;
    const side = (index % 2 === 0 ? -1 : 1) * 0.16;
    particle(context, index === count - 1 ? family.accent : family.warning, {
      x: origin.x - direction.x * back + right.x * side,
      y: origin.y,
      z: origin.z - direction.z * back + right.z * side,
    });
  }
  if (profile.strafe >= 0.1)
    particle(context, family.accent, { x: origin.x, y: origin.y + 0.6, z: origin.z });
}

function emitCastingAura(context) {
  const family = particlesForBossKey(context.def.key);
  if (!family) return;
  const origin = context.boss.location;
  const activeType = context.activeAbility?.shape?.type ?? "";
  const points = context.phase >= 4 ? 5 : context.phase >= 2 ? 4 : 3;
  const radius = 0.85 + context.phase * 0.10;
  const angleBase = system.currentTick * 0.16;
  for (let index = 0; index < points; index += 1) {
    const angle = angleBase + index * Math.PI * 2 / points;
    particle(context, index % 2 === 0 ? family.accent : family.warning, {
      x: origin.x + Math.cos(angle) * radius,
      y: origin.y + 0.10 + (index % 2) * 0.35,
      z: origin.z + Math.sin(angle) * radius,
    });
  }

  // Give ranged and sweeping casts a longer directional streak, while close-range attacks
  // get a wider arc around the boss. This layers on top of the existing ability telegraphs.
  try {
    const view = normalizeXZ(context.boss.getViewDirection());
    const streakCount = RANGE_TYPES.has(activeType) || MID_TYPES.has(activeType) ? 5 : 3;
    for (let index = 1; index <= streakCount; index += 1) {
      particle(context, index >= streakCount - 1 ? family.accent : family.warning, {
        x: origin.x + view.x * (0.48 + index * 0.40),
        y: origin.y + 0.12 + index * 0.08,
        z: origin.z + view.z * (0.48 + index * 0.40),
      });
    }

    if (CLOSE_TYPES.has(activeType)) {
      const right = { x: -view.z, z: view.x };
      for (const side of [-1, 1]) {
        particle(context, family.accent, {
          x: origin.x + view.x * 0.75 + right.x * side * 0.85,
          y: origin.y + 0.35,
          z: origin.z + view.z * 0.75 + right.z * side * 0.85,
        });
      }
    }
  } catch {}

  if (MULTI_TARGET_TYPES.has(activeType) && context.phase >= 2) {
    for (let index = 0; index < 3; index += 1) {
      const angle = angleBase * 0.7 + index * Math.PI * 2 / 3;
      particle(context, family.warning, {
        x: origin.x + Math.cos(angle) * (radius + 0.75),
        y: origin.y + 0.20,
        z: origin.z + Math.sin(angle) * (radius + 0.75),
      });
    }
  }
}

export function tickBossCombatDirector(context) {
  if (context.ended || context.boss?.isValid === false) return;
  const now = system.currentTick;

  if (context.state === "casting" || context.state === "phase_shift") {
    if (now >= (context.nextCombatFxTick ?? 0)) {
      emitCastingAura(context);
      context.nextCombatFxTick = now + (context.phase >= 3 ? 5 : 7);
    }
    return;
  }

  if (context.state !== "idle" || now < (context.nextFootworkTick ?? 0)) return;
  const snapshot = combatSnapshot(context);
  if (!snapshot.nearest) {
    context.nextFootworkTick = now + 10;
    return;
  }

  const profile = profileFor(context);
  const movement = movementVector(context, snapshot, profile);
  if (!movement) return;

  try {
    context.boss.lookAt(snapshot.nearest.location);
    const phaseScale = 1 + Math.max(0, context.phase - 1) * 0.07;
    context.boss.applyImpulse({
      x: movement.direction.x * movement.strength * phaseScale,
      y: 0,
      z: movement.direction.z * movement.strength * phaseScale,
    });
    emitFootworkTrail(context, movement.direction, profile);
  } catch {}

  if (Math.random() < 0.34) context.strafeSign = -(context.strafeSign || 1);
  const phaseTempo = Math.max(0, context.phase - 1);
  context.nextFootworkTick = now + Math.max(6, randomInterval(profile) - phaseTempo);
}
