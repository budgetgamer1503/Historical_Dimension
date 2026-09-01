import { LocationWaypoint, WaypointTexture, system, world } from "@minecraft/server";
import { damageCone } from "./damage.js";
import { BOSS_BY_ID, getBossByStep } from "./catalog.js";
import { createEncounter, cleanupEncounter, tickEncounter, buildWorldZone, releaseEncounterFromIntro } from "./encounter.js";
import { directionToPoint } from "./encounter_logic.js";
import { findSafeSurfaceNear } from "./surface.js";
import { playBossIntro, playBossVictory, showPhasePresentation } from "./cinematics.js";
import { getTerrainOrigin } from "../state/dynamic_properties.js";
import { DIMENSION_ID } from "../config.js";
import { advanceQuestForBoss, getQuestStep } from "../quest/progression.js";
import { cardinalDirectionLabel, formatBossApproachFallback, waypointDistance } from "../quest/waypoint.js";
import { logError, logInfo } from "../diagnostics/logging.js";
import { requestSengokuTerrainStreaming } from "../generation/coordinator.js";
import { isKuroganeBoss } from "./visual_identity.js";

const encounters = new Map();
const playerWaypoints = new Map();
const WAYPOINT_RETRY_TICKS = 40;
let registered = false;

function distanceXZ(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function dimensionSafe() { try { return world.getDimension(DIMENSION_ID); } catch { return undefined; } }

function clearFallback(player, record) {
  if (!record?.fallbackActive) return;
  try {
    player.onScreenDisplay.setActionBar("");
  } catch (error) {
    logError(`boss-waypoint-fallback-clear-${player.id}`, error, 20);
  }
  record.fallbackActive = false;
}

function showFallback(player, approach, record) {
  const distance = waypointDistance(player.location, approach);
  const direction = cardinalDirectionLabel(player.location, approach);
  try {
    player.onScreenDisplay.setActionBar(formatBossApproachFallback(distance, direction));
    record.fallbackActive = true;
  } catch (error) {
    logError(`boss-waypoint-fallback-${player.id}`, error, 20);
  }
}

function removeNativeWaypoint(player, record) {
  if (!record?.waypoint) return;
  try {
    if (player.locatorBar.hasWaypoint(record.waypoint))
      player.locatorBar.removeWaypoint(record.waypoint);
  } catch (error) {
    logError(`boss-waypoint-remove-bar-${player.id}`, error, 20);
  }
  try {
    if (record.waypoint.isValid !== false)
      record.waypoint.remove();
  } catch (error) {
    logError(`boss-waypoint-remove-handle-${player.id}`, error, 20);
  }
  record.waypoint = undefined;
}

function removePlayerWaypoint(player) {
  const record = playerWaypoints.get(player.id);
  if (!record) return;
  removeNativeWaypoint(player, record);
  clearFallback(player, record);
  playerWaypoints.delete(player.id);
}

function waypointRecord(step) {
  return {
    step,
    waypoint: undefined,
    failures: 0,
    nextRetryTick: 0,
    fallbackActive: false,
    lastError: "",
  };
}

function nativeWaypointIsActive(player, record) {
  if (!record?.waypoint || record.waypoint.isValid === false) return false;
  try {
    record.waypoint.isEnabled = true;
    return player.locatorBar.hasWaypoint(record.waypoint);
  } catch (error) {
    record.lastError = String(error);
    logError(`boss-waypoint-verify-${player.id}`, error, 20);
    return false;
  }
}

function markWaypointFailure(player, record, error) {
  record.failures += 1;
  record.lastError = String(error);
  record.nextRetryTick = system.currentTick + WAYPOINT_RETRY_TICKS;
  logError(`boss-waypoint-create-${player.id}`, error, 5);
}

function tryCreateNativeWaypoint(player, approach, record) {
  try {
    const locatorBar = player.locatorBar;
    if (locatorBar.count >= locatorBar.maxCount)
      throw new Error(`Locator bar is full (${locatorBar.count}/${locatorBar.maxCount})`);

    const selector = { textureBoundsList: [{ lowerBound: 0, texture: WaypointTexture.SmallStar }] };
    const waypoint = new LocationWaypoint(
      { dimension: player.dimension, ...approach },
      selector,
      { red: 0.92, green: 0.78, blue: 0.25 },
    );
    waypoint.isEnabled = true;
    locatorBar.addWaypoint(waypoint);
    if (!locatorBar.hasWaypoint(waypoint)) {
      try { waypoint.remove(); } catch (cleanupError) {
        logError(`boss-waypoint-create-cleanup-${player.id}`, cleanupError, 20);
      }
      throw new Error("Locator bar did not retain the Samurai duel waypoint after addWaypoint");
    }

    record.waypoint = waypoint;
    record.failures = 0;
    record.nextRetryTick = 0;
    record.lastError = "";
    clearFallback(player, record);
    logInfo(`Samurai duel waypoint active for ${player.name} at quest step ${record.step}.`);
    return true;
  } catch (error) {
    markWaypointFailure(player, record, error);
    return false;
  }
}

function updatePlayerWaypoint(player, terrainOrigin) {
  const step = getQuestStep(player);
  if (player.dimension.id !== DIMENSION_ID || step >= 5) {
    removePlayerWaypoint(player);
    return;
  }
  const def = getBossByStep(step);
  if (!def) {
    removePlayerWaypoint(player);
    return;
  }

  const approach = buildWorldZone(def, terrainOrigin).approach;
  let record = playerWaypoints.get(player.id);
  if (!record || record.step !== step) {
    removePlayerWaypoint(player);
    record = waypointRecord(step);
    playerWaypoints.set(player.id, record);
  }

  if (nativeWaypointIsActive(player, record)) {
    clearFallback(player, record);
    return;
  }
  if (record.waypoint)
    removeNativeWaypoint(player, record);

  if (system.currentTick >= record.nextRetryTick)
    tryCreateNativeWaypoint(player, approach, record);

  if (!nativeWaypointIsActive(player, record))
    showFallback(player, approach, record);
}

function activateFromBossZones(terrainOrigin) {
  const dimension = dimensionSafe();
  if (!dimension) return;
  for (const player of dimension.getPlayers()) {
    const step = getQuestStep(player);
    const def = getBossByStep(step);
    if (!def || encounters.has(def.key)) continue;
    const zone = buildWorldZone(def, terrainOrigin);
    if (distanceXZ(player.location, zone.approach) > def.zone.triggerRadius) continue;

    const surface = findSafeSurfaceNear(dimension, zone.center, def.zone.surfaceSearchRadius);
    if (!surface) {
      // Keep terrain generation centered on the player. Do not synthesize a remote
      // boss island in the void merely because this boss is the current quest step.
      requestSengokuTerrainStreaming(player.id, 1);
      continue;
    }

    try {
      const context = createEncounter({ world, dimension, def, terrainOrigin, activatingPlayer: player });
      encounters.set(def.key, context);
      void playBossIntro(context)
        .catch((error) => logError(`boss-intro-${def.key}`, error, 20))
        .finally(() => releaseEncounterFromIntro(context));
    } catch (error) {
      logError(`boss-encounter-activate-${def.key}`, error, 20);
    }
  }
}

function tickEncounters() {
  for (const [key, context] of encounters) {
    const status = tickEncounter(context, { onPhaseShift: showPhasePresentation });
    if (status === "wipe") {
      cleanupEncounter(context, { removeBoss: true });
      encounters.delete(key);
    } else if (status === "ended") {
      cleanupEncounter(context);
      encounters.delete(key);
    }
  }
}

function tickPersistentHazardsAndWaypoints() {
  const terrainOrigin = getTerrainOrigin();
  for (const player of world.getAllPlayers()) updatePlayerWaypoint(player, terrainOrigin);
  activateFromBossZones(terrainOrigin);
}

function findEncounterForBoss(entity) {
  for (const context of encounters.values()) if (context.boss.id === entity.id) return context;
  return undefined;
}

function removeParticipantFromEncounters(playerId) {
  for (const context of encounters.values()) {
    if (!context.participantIds.includes(playerId)) continue;
    context.participantIds = context.participantIds.filter((id) => id !== playerId);
  }
}

function scheduleEncounterCallback(context, delay, callback) {
  const handle = system.runTimeout(() => {
    context.handles.delete(handle);
    if (context.ended || context.boss?.isValid === false) return;
    try {
      callback();
    } catch (error) {
      logError(`boss-scheduled-callback-${context.def.key}`, error, 20);
    }
  }, Math.max(0, Math.floor(delay)));
  context.handles.add(handle);
  return handle;
}

function onBossDeath(event) {
  if (event.deadEntity.typeId === "minecraft:player") {
    removeParticipantFromEncounters(event.deadEntity.id);
    return;
  }

  const def = BOSS_BY_ID[event.deadEntity.typeId];
  if (!def) return;
  const context = findEncounterForBoss(event.deadEntity);
  if (!context) return;
  const defeatLocation = { ...event.deadEntity.location };
  const rewardIds = [...(context.rewardParticipantIds ?? context.participantIds)];

  system.run(() => {
    cleanupEncounter(context);
    encounters.delete(def.key);
    void (async () => {
      try {
        await playBossVictory({ world, playerIds: rewardIds, def, location: defeatLocation });
      } catch (error) {
        logError(`boss-victory-${def.key}`, error, 20);
      }

      for (const id of rewardIds) {
        try {
          const player = world.getEntity(id);
          if (player?.typeId !== "minecraft:player" || player.isValid === false) continue;
          const advanced = advanceQuestForBoss(player, def.step);
          if (!advanced) continue;
        } catch (error) {
          logError(`boss-reward-${def.key}-${id}`, error, 20);
        }
      }

      const origin = getTerrainOrigin();
      for (const player of world.getAllPlayers()) updatePlayerWaypoint(player, origin);
    })();
  });
}

function onBossHurtBefore(event) {
  const context = findEncounterForBoss(event.hurtEntity);
  if (!context) return;
  const attacker = event.damageSource?.damagingEntity;
  if (attacker?.typeId === "minecraft:player" && !context.participantIds.includes(attacker.id)) {
    event.cancel = true;
    return;
  }
  if (!isKuroganeBoss(context.def)) return;
  if (!attacker || attacker.typeId !== "minecraft:player") return;

  const counter = context.counterWindow;
  if (counter && !counter.consumed && system.currentTick <= counter.endsTick) {
    event.cancel = true;
    counter.consumed = true;
    const attackerId = attacker.id;
    system.run(() => {
      if (context.ended || context.boss?.isValid === false) return;
      let punishDirection = counter.pose?.view ?? { x: 0, z: -1 };
      try {
        const liveAttacker = world.getEntity(attackerId);
        if (liveAttacker?.typeId === "minecraft:player" && liveAttacker.isValid !== false) {
          punishDirection = directionToPoint(context.boss.location, liveAttacker.location, punishDirection);
          context.boss.lookAt(liveAttacker.location);
        }
      } catch {}
      counter.punishDirection = punishDirection;
      try { context.dimension.spawnParticle("historyjam:steel_spark", context.boss.location); } catch {}

      const delay = Math.max(0, counter.punishTick - system.currentTick);
      scheduleEncounterCallback(context, delay, () => {
        const shape = counter.ability?.shape ?? {};
        const damage = Array.isArray(counter.ability?.damage) ? counter.ability.damage[0] : counter.ability?.damage;
        try { context.dimension.spawnParticle("historyjam:impact_flash", context.boss.location); } catch {}
        damageCone(
          context,
          context.boss.location,
          counter.punishDirection ?? counter.pose?.view ?? { x: 0, z: -1 },
          shape.range ?? 4,
          shape.angle ?? 110,
          damage ?? 14,
        );
      });
    });
    return;
  }

  if (context.damageReduction) event.damage *= Math.max(0, 1 - context.damageReduction);
}

function cleanupOrphanBosses() {
  const dimension = dimensionSafe();
  if (!dimension) return;
  try {
    for (const entity of dimension.getEntities({ tags: ["historyjam.boss"] })) {
      if (!findEncounterForBoss(entity)) try { entity.remove(); } catch {}
    }
  } catch {}
}

export function registerBossRuntime() {
  if (registered) return;
  registered = true;
  world.afterEvents.entityDie.subscribe(onBossDeath);
  world.beforeEvents.entityHurt.subscribe(onBossHurtBefore);
  world.afterEvents.playerLeave.subscribe((event) => {
    removeParticipantFromEncounters(event.playerId);
    const record = playerWaypoints.get(event.playerId);
    if (record?.waypoint) {
      try {
        if (record.waypoint.isValid !== false)
          record.waypoint.remove();
      } catch (error) {
        logError(`boss-waypoint-leave-${event.playerId}`, error, 20);
      }
    }
    playerWaypoints.delete(event.playerId);
  });
  system.runInterval(tickEncounters, 5);
  system.runInterval(tickPersistentHazardsAndWaypoints, 10);
  system.runInterval(cleanupOrphanBosses, 200);
  world.afterEvents.worldLoad.subscribe(() => system.run(cleanupOrphanBosses));
}
