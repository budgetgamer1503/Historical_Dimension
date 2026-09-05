import { EntityComponentTypes, system } from "@minecraft/server";
import { decisionDelayForPlayers, healthForPlayers } from "./scaling.js";
import { chooseAbility } from "./selection.js";
import { phaseForRatio } from "./catalog.js";
import { isPointInsideZone, resolveLocalPosition } from "./encounter_logic.js";
import { runAbility, tickHazards } from "./ability_runner.js";
import { findSafeSurfaceNear } from "./surface.js";
import {
  combatSnapshot,
  recordAbilityUse,
  tacticalAbilityWeight,
  tickBossCombatDirector,
} from "./combat_director.js";

function distanceXZ(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

export function buildWorldZone(def, terrainOrigin) {
  return {
    center: resolveLocalPosition(def.zone.center, terrainOrigin),
    approach: resolveLocalPosition(def.zone.approach, terrainOrigin),
    participantRadius: def.zone.participantRadius,
    leashRadius: def.zone.leashRadius,
    resetRadius: def.zone.resetRadius,
    triggerRadius: def.zone.triggerRadius,
  };
}

export function snapshotParticipants(dimension, worldZone) {
  return dimension.getPlayers()
    .filter((player) => isPointInsideZone(player.location, worldZone, worldZone.participantRadius, 16))
    .sort((a, b) => distanceXZ(a.location, worldZone.center) - distanceXZ(b.location, worldZone.center))
    .slice(0, 4);
}

export function createEncounter({ world, dimension, def, terrainOrigin, activatingPlayer }) {
  const worldZone = buildWorldZone(def, terrainOrigin);
  const spawnLocation = findSafeSurfaceNear(dimension, worldZone.center, def.zone.surfaceSearchRadius);
  if (!spawnLocation)
    throw new Error(`No safe natural spawn surface is loaded for ${def.key}`);
  worldZone.center = spawnLocation;

  let participants = snapshotParticipants(dimension, worldZone);
  if (participants.length === 0 && activatingPlayer) participants = [activatingPlayer];
  const participantCount = Math.max(1, Math.min(4, participants.length));
  const boss = dimension.spawnEntity(def.id, spawnLocation);
  boss.addTag("historyjam.boss");
  boss.addTag(`historyjam.boss.${def.key}`);
  boss.triggerEvent(`historyjam:scale_${participantCount}`);
  const maxHealth = healthForPlayers(def.baseHealth, participantCount);
  try { boss.getComponent(EntityComponentTypes.Health)?.setCurrentValue(maxHealth); } catch {}
  return {
    world, dimension, def, terrainOrigin, worldZone, boss,
    participantIds: participants.map((player) => player.id),
    rewardParticipantIds: participants.map((player) => player.id),
    participantCount, maxHealth, phase: 1, state: "intro", ended: false,
    nextDecisionTick: Number.MAX_SAFE_INTEGER, lastAbilityId: undefined,
    recentAbilityIds: [], recentShapeTypes: [], activeAbility: undefined,
    nextFootworkTick: system.currentTick + 10, nextCombatFxTick: 0, strafeSign: Math.random() < 0.5 ? -1 : 1,
    cooldowns: new Map(), handles: new Set(), hazards: [], absentTicks: 0,
    counterWindow: undefined, damageReduction: undefined, pressureUntilTick: 0,
  };
}

export function releaseEncounterFromIntro(context) {
  if (context.ended || context.state !== "intro") return;
  context.state = "idle";
  context.nextDecisionTick = system.currentTick + 10;
  context.nextFootworkTick = system.currentTick + 2;
}

function currentHealth(context) {
  try { return context.boss.getComponent(EntityComponentTypes.Health)?.currentValue ?? 0; } catch { return 0; }
}

function startPhaseShift(context, nextPhase, onPresentation = undefined) {
  context.phase = nextPhase;
  context.state = "phase_shift";
  try { onPresentation?.(context, nextPhase); } catch {}
  try { context.boss.triggerEvent("historyjam:cast_start"); } catch {}
  try { context.boss.playAnimation("animation.historyjam.samurai.phase_shift", { blendOutTime: 0.12 }); } catch {}
  const handle = system.runTimeout(() => {
    context.handles.delete(handle);
    if (context.ended) return;
    try { context.boss.triggerEvent("historyjam:cast_end"); } catch {}
    context.state = "idle";
    context.nextDecisionTick = system.currentTick + 10;
    context.nextFootworkTick = system.currentTick + 1;
  }, 28);
  context.handles.add(handle);
}

function participantEntity(context, id) {
  try {
    const entity = context.world.getEntity(id);
    return entity?.typeId === "minecraft:player" && entity.isValid !== false ? entity : undefined;
  } catch {
    return undefined;
  }
}

function constrainBossToZone(context) {
  try {
    if (distanceXZ(context.boss.location, context.worldZone.center) <= context.worldZone.leashRadius) return;
    const destination = findSafeSurfaceNear(
      context.dimension,
      context.worldZone.center,
      Math.min(8, context.def.zone.surfaceSearchRadius),
    );
    if (!destination) return;
    context.boss.tryTeleport(destination, { facingLocation: context.worldZone.center });
  } catch {}
}

function activeParticipantInside(context) {
  return context.participantIds.some((id) => {
    const entity = participantEntity(context, id);
    if (!entity) return false;
    try {
      return entity.dimension.id === context.dimension.id
        && distanceXZ(entity.location, context.worldZone.center) <= context.worldZone.resetRadius;
    } catch {
      return false;
    }
  });
}

export function tickEncounter(context, hooks = {}) {
  if (context.ended || context.boss?.isValid === false) return "ended";
  tickHazards(context);
  constrainBossToZone(context);
  tickBossCombatDirector(context);

  if (activeParticipantInside(context)) context.absentTicks = 0;
  else context.absentTicks += 5;
  if (context.absentTicks >= 200) return "wipe";

  const ratio = context.maxHealth > 0 ? currentHealth(context) / context.maxHealth : 0;
  const expectedPhase = phaseForRatio(ratio);
  if (expectedPhase > context.phase && context.state === "idle") {
    startPhaseShift(context, expectedPhase, hooks.onPhaseShift);
    return "active";
  }
  if (context.state !== "idle" || system.currentTick < context.nextDecisionTick) return "active";

  const snapshot = combatSnapshot(context);
  const ability = chooseAbility(
    context.def,
    context.phase,
    context.recentAbilityIds,
    Math.random(),
    (candidate) => (context.cooldowns.get(candidate.id) ?? 0) <= system.currentTick,
    (candidate) => tacticalAbilityWeight(context, candidate, snapshot),
  );
  if (!ability) {
    context.nextDecisionTick = system.currentTick + 5;
    context.nextFootworkTick = Math.min(context.nextFootworkTick ?? system.currentTick, system.currentTick + 1);
    return "active";
  }

  context.lastAbilityId = ability.id;
  context.activeAbility = ability;
  recordAbilityUse(context, ability);
  runAbility(context, ability, () => {
    context.activeAbility = undefined;
    context.nextDecisionTick = system.currentTick + decisionDelayForPlayers(context.participantCount);
    context.nextFootworkTick = system.currentTick + 1;
  });
  return "active";
}

export function cleanupEncounter(context, { removeBoss = false } = {}) {
  if (context.ended) return;
  context.ended = true;
  for (const handle of context.handles) try { system.clearRun(handle); } catch {}
  context.handles.clear();
  context.hazards = [];
  context.activeAbility = undefined;
  context.counterWindow = undefined;
  context.damageReduction = undefined;
  context.pressureUntilTick = 0;
  try { context.boss?.triggerEvent("historyjam:cast_end"); } catch {}
  try { context.boss?.triggerEvent("historyjam:pressure_end"); } catch {}
  if (removeBoss) try { if (context.boss?.isValid !== false) context.boss.remove(); } catch {}
}
