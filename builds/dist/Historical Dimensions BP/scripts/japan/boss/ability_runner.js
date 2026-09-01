import { system } from "@minecraft/server";
import { combatParticipants, damageCircle, damageCone, damageLine, damagePlayer, damageRing, healBoss, pullTowardPoint, pushFromPoint } from "./damage.js";
import { inLine, normalizeXZ } from "./geometry.js";
import { clampPointToZone, directionToPoint, targetCountForAbility } from "./encounter_logic.js";
import { particlesForBossKey } from "./visual_identity.js";
import { impactTelegraphDescriptors } from "./impact_telegraph.js";

function particleFamily(context) {
  return particlesForBossKey(context.def.key) ?? particlesForBossKey("jade_storm_ronin");
}

function safeParticle(context, id, point) {
  try { context.dimension.spawnParticle(id, { x: point.x, y: point.y + 0.08, z: point.z }); } catch {}
}

function schedule(context, delay, callback) {
  const handle = system.runTimeout(() => {
    context.handles.delete(handle);
    if (context.ended || context.boss?.isValid === false) return;
    try { callback(); } catch {}
  }, Math.max(0, Math.floor(delay)));
  context.handles.add(handle);
  return handle;
}

function bossPose(context) {
  const origin = { ...context.boss.location };
  const view = normalizeXZ(context.boss.getViewDirection());
  return { origin, view };
}

function selectTargets(context, ability, countOverride) {
  const count = countOverride ?? targetCountForAbility(ability, context.participantCount);
  const players = combatParticipants(context);
  players.sort((a, b) => {
    const da = Math.hypot(a.location.x - context.boss.location.x, a.location.z - context.boss.location.z);
    const db = Math.hypot(b.location.x - context.boss.location.x, b.location.z - context.boss.location.z);
    return da - db;
  });
  return players.slice(0, Math.min(count, players.length));
}

function lineBoundaryPoints(origin, direction, length, width) {
  const forward = normalizeXZ(direction);
  const right = { x: -forward.z, z: forward.x };
  const points = [];
  for (let d = 0; d <= length + 0.001; d += 1) {
    for (const side of [-width / 2, width / 2]) {
      points.push({ x: origin.x + forward.x * d + right.x * side, y: origin.y, z: origin.z + forward.z * d + right.z * side });
    }
  }
  return points;
}

function circleBoundaryPoints(center, radius, segments = 24) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * radius, y: center.y, z: center.z + Math.sin(angle) * radius };
  });
}

function coneBoundaryPoints(origin, direction, range, angle) {
  const points = [{ ...origin }];
  for (let offset = -angle / 2; offset <= angle / 2 + 0.001; offset += Math.max(10, angle / 8)) {
    const ray = normalizeXZ({
      x: direction.x * Math.cos(offset * Math.PI / 180) - direction.z * Math.sin(offset * Math.PI / 180),
      z: direction.x * Math.sin(offset * Math.PI / 180) + direction.z * Math.cos(offset * Math.PI / 180),
    });
    points.push({ x: origin.x + ray.x * range, y: origin.y, z: origin.z + ray.z * range });
  }
  return points;
}

function spawnPoints(context, points, particleId) {
  for (const point of points) safeParticle(context, particleId, point);
}

function telegraphImpact(context, ability, plan, impactIndex, accent = false) {
  const family = particleFamily(context);
  const descriptors = impactTelegraphDescriptors(ability, plan, context.worldZone.center, impactIndex);
  for (const descriptor of descriptors) {
    const particleId = descriptor.feint ? family.warning : (accent ? family.accent : family.warning);
    if (descriptor.kind === "line") spawnPoints(context, lineBoundaryPoints(descriptor.origin, descriptor.direction, descriptor.length, descriptor.width), particleId);
    else if (descriptor.kind === "cone") spawnPoints(context, coneBoundaryPoints(descriptor.origin, descriptor.direction, descriptor.range, descriptor.angle), particleId);
    else if (descriptor.kind === "circle") spawnPoints(context, circleBoundaryPoints(descriptor.center, descriptor.radius), particleId);
    else if (descriptor.kind === "ring") {
      spawnPoints(context, circleBoundaryPoints(descriptor.center, descriptor.outerRadius), particleId);
      if (descriptor.innerRadius > 0) spawnPoints(context, circleBoundaryPoints(descriptor.center, descriptor.innerRadius), particleId);
    }
  }
}

function targetSnapshots(context, ability) {
  const requested = targetCountForAbility(ability, context.participantCount);
  const selected = selectTargets(context, ability, requested);
  const snapshots = selected.map((target) => ({ ...target.location }));
  if (snapshots.length === 0) return [];
  while (snapshots.length < requested) {
    const source = snapshots[snapshots.length % selected.length];
    const index = snapshots.length;
    snapshots.push({ x: source.x + Math.cos(index * 2.1) * 2.4, y: source.y, z: source.z + Math.sin(index * 2.1) * 2.4 });
  }
  return snapshots;
}

function randomZoneLocations(context, count) {
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.45;
    const radius = 6 + Math.random() * 14;
    points.push(clampPointToZone({
      x: context.worldZone.center.x + Math.cos(angle) * radius,
      y: context.worldZone.center.y,
      z: context.worldZone.center.z + Math.sin(angle) * radius,
    }, context.worldZone, 3));
  }
  return points;
}

function validTeleportDestination(context, destination) {
  try {
    const x = Math.floor(destination.x);
    const y = Math.floor(destination.y);
    const z = Math.floor(destination.z);
    const floor = context.dimension.getBlock({ x, y: y - 1, z });
    const feet = context.dimension.getBlock({ x, y, z });
    const head = context.dimension.getBlock({ x, y: y + 1, z });
    return Boolean(floor && !floor.isAir && !floor.isLiquid && feet?.isAir && head?.isAir);
  } catch {
    return false;
  }
}

function plannedReposition(context, target, fallbackView) {
  if (!target || target.isValid === false) return undefined;
  try {
    const targetView = normalizeXZ(target.getViewDirection());
    const raw = {
      x: target.location.x - targetView.x * 3,
      y: target.location.y,
      z: target.location.z - targetView.z * 3,
    };
    const destination = clampPointToZone(raw, context.worldZone, 3);
    if (!validTeleportDestination(context, destination)) return undefined;
    return {
      destination,
      pose: {
        origin: { ...destination },
        view: directionToPoint(destination, target.location, fallbackView),
      },
    };
  } catch {
    return undefined;
  }
}

function buildCastPlan(context, ability) {
  const primaryTarget = selectTargets(context, ability, 1)[0];
  const fallbackPose = bossPose(context);
  const pose = {
    origin: fallbackPose.origin,
    view: primaryTarget
      ? directionToPoint(fallbackPose.origin, primaryTarget.location, fallbackPose.view)
      : fallbackPose.view,
  };
  const targetLocations = ability.shape.type === "arena_hazard_circles"
    ? randomZoneLocations(context, targetCountForAbility(ability, context.participantCount))
    : targetSnapshots(context, ability);
  const reposition = ability.shape.reposition ? plannedReposition(context, primaryTarget, pose.view) : undefined;
  return {
    pose,
    impactPose: reposition?.pose ?? pose,
    repositionDestination: reposition?.destination,
    targetLocations,
    primaryTarget,
    startedTick: system.currentTick,
  };
}

function damageDescriptor(context, descriptor, amount) {
  if (!descriptor || descriptor.feint) return 0;
  if (descriptor.kind === "line") return damageLine(context, descriptor.origin, descriptor.direction, descriptor.length, descriptor.width, amount);
  if (descriptor.kind === "cone") return damageCone(context, descriptor.origin, descriptor.direction, descriptor.range, descriptor.angle, amount);
  if (descriptor.kind === "circle") return damageCircle(context, descriptor.center, descriptor.radius, amount);
  if (descriptor.kind === "ring") return damageRing(context, descriptor.center, descriptor.innerRadius, descriptor.outerRadius, amount);
  return 0;
}

function damageDescriptors(context, ability, plan, impactIndex, amount) {
  return impactTelegraphDescriptors(ability, plan, context.worldZone.center, impactIndex)
    .reduce((sum, descriptor) => sum + damageDescriptor(context, descriptor, amount), 0);
}

function damageAtImpact(context, ability, plan, impactIndex) {
  const amount = Array.isArray(ability.damage) ? ability.damage[Math.min(impactIndex, ability.damage.length - 1)] : ability.damage;
  const shape = ability.shape;
  const pose = shape.reposition ? (plan.impactPose ?? plan.pose) : plan.pose;

  switch (shape.type) {
    case "circle": {
      const dealt = damageDescriptors(context, ability, plan, impactIndex, amount);
      if (shape.knockback) {
        for (const player of combatParticipants(context)) {
          if (Math.hypot(player.location.x - pose.origin.x, player.location.z - pose.origin.z) <= shape.radius + 0.2) pushFromPoint(player, pose.origin, shape.knockback);
        }
      }
      return dealt;
    }
    case "ring": {
      const dealt = damageDescriptors(context, ability, plan, impactIndex, amount);
      const outer = shape.outerRadius ?? shape.radius ?? 5;
      if (shape.knockback) {
        for (const player of combatParticipants(context)) {
          if (Math.hypot(player.location.x - context.worldZone.center.x, player.location.z - context.worldZone.center.z) <= outer + 0.2) pushFromPoint(player, context.worldZone.center, shape.knockback);
        }
      }
      return dealt;
    }
    case "tether": {
      if (impactIndex === 0) {
        const target = plan.primaryTarget;
        const descriptor = impactTelegraphDescriptors(ability, plan, context.worldZone.center, 0)[0];
        if (!target || target.isValid === false || !descriptor || !inLine(target.location, descriptor.origin, descriptor.direction, descriptor.length, descriptor.width)) return 0;
        pullTowardPoint(target, descriptor.origin, 0.65);
        return damagePlayer(target, context.boss, amount) ? amount : 0;
      }
      return damageDescriptors(context, ability, plan, impactIndex, amount);
    }
    case "persistent_circle": {
      const descriptor = impactTelegraphDescriptors(ability, plan, context.worldZone.center, impactIndex)[0];
      const center = descriptor?.center ?? plan.targetLocations[0] ?? pose.origin;
      context.hazards.push({ type: "circle", center, radius: shape.radius, damage: amount, nextPulseTick: system.currentTick, expiresTick: system.currentTick + shape.lifetimeTicks, pulseTicks: shape.pulseTicks });
      return 0;
    }
    case "counter_cone": return 0;
    default: return damageDescriptors(context, ability, plan, impactIndex, amount);
  }
}

function specialAtStart(context, ability, plan) {
  if (ability.shape.reposition) {
    const target = plan.primaryTarget;
    if (target && plan.repositionDestination) {
      schedule(context, ability.shape.repositionTick ?? ability.shape.teleportTick ?? Math.max(4, ability.impactTicks[0] - 8), () => {
        const destination = plan.repositionDestination;
        try {
          const plannedView = plan.impactPose?.view ?? plan.pose.view;
          const success = context.boss.tryTeleport(destination, {
            facingLocation: {
              x: destination.x + plannedView.x * 4,
              y: destination.y,
              z: destination.z + plannedView.z * 4,
            },
          });
          if (success) {
            const actual = { ...context.boss.location };
            plan.impactPose = { origin: actual, view: plannedView };
          } else {
            plan.impactPose = plan.pose;
          }
        } catch {
          plan.impactPose = plan.pose;
        }
      });
    } else if (ability.shape.reposition) {
      plan.impactPose = plan.pose;
    }
  }

  if (ability.shape.dash) {
    schedule(context, Math.max(2, ability.impactTicks[0] - 3), () => {
      const pose = bossPose(context);
      const destination = clampPointToZone({
        x: pose.origin.x + pose.view.x * (ability.shape.length * 0.55),
        y: pose.origin.y,
        z: pose.origin.z + pose.view.z * (ability.shape.length * 0.55),
      }, context.worldZone, 3);
      if (!validTeleportDestination(context, destination)) return;
      try { context.boss.tryTeleport(destination, { facingLocation: { x: destination.x + pose.view.x * 4, y: destination.y, z: destination.z + pose.view.z * 4 } }); } catch {}
    });
  }

  if (ability.id === "iron_counter") {
    const [guardStart, guardEnd] = ability.shape.counterWindow ?? [8, 20];
    schedule(context, guardStart, () => {
      context.counterWindow = {
        consumed: false,
        startsTick: system.currentTick,
        endsTick: plan.startedTick + guardEnd,
        punishTick: plan.startedTick + ability.impactTicks[0],
        pose: plan.pose,
        ability,
      };
    });
  }

  if (ability.id === "black_banner_domain") {
    const [reductionStart, reductionEnd] = ability.shape.reductionWindow ?? [16, 72];
    schedule(context, reductionStart, () => { context.damageReduction = ability.shape.damageReduction ?? 0.25; });
    schedule(context, reductionEnd + 1, () => { context.damageReduction = undefined; });
  }
}

function activatePressureAfterCast(context) {
  if (!(context.pressureUntilTick > system.currentTick)) return;
  try { context.boss.triggerEvent("historyjam:pressure_start"); } catch {}
  const remaining = context.pressureUntilTick - system.currentTick;
  schedule(context, remaining, () => {
    context.pressureUntilTick = 0;
    try { context.boss.triggerEvent("historyjam:pressure_end"); } catch {}
  });
}

export function runAbility(context, ability, onDone) {
  context.state = "casting";
  context.lastAbilityId = ability.id;
  context.cooldowns.set(ability.id, system.currentTick + ability.cooldownTicks);
  try { context.boss.triggerEvent("historyjam:cast_start"); } catch {}
  const plan = buildCastPlan(context, ability);
  if (plan.primaryTarget) try { context.boss.lookAt(plan.primaryTarget.location); } catch {}
  try { context.boss.playAnimation(ability.animation, { blendOutTime: 0.12 }); } catch {}
  specialAtStart(context, ability, plan);

  schedule(context, Math.max(1, ability.telegraphStartTick ?? 1), () => telegraphImpact(context, ability, plan, 0, false));
  ability.impactTicks.forEach((impactTick, index) => {
    schedule(context, Math.max(1, impactTick - 6), () => telegraphImpact(context, ability, plan, index, true));
    schedule(context, impactTick, () => {
      const dealt = damageAtImpact(context, ability, plan, index);
      if (ability.id === "devour_wound" && dealt > 0) healBoss(context.boss, Math.min(ability.shape.healCap ?? 20, dealt * (ability.shape.healFraction ?? 0.5)));
      if (ability.id === "berserker_roar" && ability.shape.pressureTicks) context.pressureUntilTick = system.currentTick + ability.shape.pressureTicks;
      if (ability.shape.type !== "counter_cone") safeParticle(context, "historyjam:impact_flash", plan.impactPose?.origin ?? plan.targetLocations[0] ?? context.boss.location);
    });
  });

  schedule(context, ability.durationTicks, () => {
    context.counterWindow = undefined;
    context.damageReduction = undefined;
    try { context.boss.triggerEvent("historyjam:cast_end"); } catch {}
    activatePressureAfterCast(context);
    context.state = "idle";
    onDone?.();
  });
}

export function tickHazards(context) {
  const now = system.currentTick;
  context.hazards = context.hazards.filter((hazard) => {
    if (now >= hazard.expiresTick) return false;
    if (now >= hazard.nextPulseTick) {
      damageCircle(context, hazard.center, hazard.radius, hazard.damage);
      spawnPoints(context, circleBoundaryPoints(hazard.center, hazard.radius), particleFamily(context).accent);
      hazard.nextPulseTick = now + hazard.pulseTicks;
    }
    return true;
  });
}
