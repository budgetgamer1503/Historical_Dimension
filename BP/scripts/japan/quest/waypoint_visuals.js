import { TextPrimitive, system, world } from "@minecraft/server";
import { getBossByStep } from "../boss/catalog.js";
import { buildWorldZone } from "../boss/encounter.js";
import { DIMENSION_ID } from "../config.js";
import { getTerrainOrigin } from "../state/dynamic_properties.js";
import { getQuestStep } from "./progression.js";
import { cardinalDirectionLabel, waypointDistance } from "./waypoint.js";
import { logError } from "../diagnostics/logging.js";

const records = new Map();
const MAX_RENDER_DISTANCE = 640;
const HIDE_WITHIN_BLOCKS = 26;
const RETRY_TICKS = 80;
const WAYPOINT_COLOR = Object.freeze({ red: 0.96, green: 0.18, blue: 0.62, alpha: 1.0 });
const LABEL_COLOR = Object.freeze({ red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0 });
const TRANSPARENT = Object.freeze({ red: 0, green: 0, blue: 0, alpha: 0 });
const BEAM_TEXT = "┃\n┃\n┃\n┃\n┃\n┃\n┃\n┃\n┃\n┃\n┃\n┃\n┃\n┃";
let registered = false;

function removePrimitive(primitive) {
  if (!primitive) return;
  try { primitive.remove(); } catch {}
}

function clearRecord(playerId) {
  const record = records.get(playerId);
  if (!record) return;
  removePrimitive(record.label);
  removePrimitive(record.beam);
  records.delete(playerId);
}

function createPrimitive(player, location, text, { scale, color }) {
  const primitive = new TextPrimitive(
    { dimension: player.dimension, x: location.x, y: location.y, z: location.z },
    text,
  );
  primitive.visibleTo = [player];
  primitive.maximumRenderDistance = MAX_RENDER_DISTANCE;
  primitive.depthTest = false;
  primitive.useRotation = false;
  primitive.scale = scale;
  primitive.color = color;
  primitive.backgroundColorOverride = TRANSPARENT;
  world.primitiveShapesManager.addText(primitive, player.dimension);
  return primitive;
}

function labelText(def, distance, direction) {
  return `§d◆ §f${def.displayName}\n§7${Math.max(0, distance)}m §8• §e${direction}`;
}

function createRecord(player, def, step, approach) {
  const label = createPrimitive(player, {
    x: approach.x,
    y: approach.y + 6.2,
    z: approach.z,
  }, labelText(def, waypointDistance(player.location, approach), cardinalDirectionLabel(player.location, approach)), {
    scale: 1.35,
    color: LABEL_COLOR,
  });

  let beam;
  try {
    beam = createPrimitive(player, {
      x: approach.x,
      y: approach.y + 17.5,
      z: approach.z,
    }, BEAM_TEXT, {
      scale: 1.28,
      color: WAYPOINT_COLOR,
    });
  } catch (error) {
    // Keep the useful floating label even if the primitive-shape budget cannot fit the beam.
    logError(`boss-waypoint-beam-${player.id}`, error, 20);
  }

  return { step, label, beam, nextRetryTick: 0 };
}

function updatePlayer(player, terrainOrigin) {
  const step = getQuestStep(player);
  if (player.dimension.id !== DIMENSION_ID || step < 0 || step >= 5) {
    clearRecord(player.id);
    return;
  }
  const def = getBossByStep(step);
  if (!def) {
    clearRecord(player.id);
    return;
  }

  const approach = buildWorldZone(def, terrainOrigin).approach;
  const distance = waypointDistance(player.location, approach);
  if (distance <= HIDE_WITHIN_BLOCKS) {
    clearRecord(player.id);
    return;
  }

  let record = records.get(player.id);
  if (!record || record.step !== step) {
    clearRecord(player.id);
    try {
      record = createRecord(player, def, step, approach);
      records.set(player.id, record);
    } catch (error) {
      logError(`boss-waypoint-world-label-${player.id}`, error, 20);
      records.set(player.id, { step, label: undefined, beam: undefined, nextRetryTick: system.currentTick + RETRY_TICKS });
      return;
    }
  }

  if (!record.label && system.currentTick >= (record.nextRetryTick ?? 0)) {
    clearRecord(player.id);
    try {
      record = createRecord(player, def, step, approach);
      records.set(player.id, record);
    } catch (error) {
      logError(`boss-waypoint-world-label-retry-${player.id}`, error, 20);
      records.set(player.id, { step, label: undefined, beam: undefined, nextRetryTick: system.currentTick + RETRY_TICKS });
      return;
    }
  }

  if (record.label) {
    try {
      record.label.setText(labelText(def, distance, cardinalDirectionLabel(player.location, approach)));
    } catch (error) {
      logError(`boss-waypoint-world-label-update-${player.id}`, error, 20);
      clearRecord(player.id);
    }
  }
}

function tickWaypointVisuals() {
  const terrainOrigin = getTerrainOrigin();
  const liveIds = new Set();
  for (const player of world.getAllPlayers()) {
    liveIds.add(player.id);
    updatePlayer(player, terrainOrigin);
  }
  for (const playerId of records.keys()) {
    if (!liveIds.has(playerId)) clearRecord(playerId);
  }
}

export function registerBossWaypointVisuals() {
  if (registered) return;
  registered = true;
  system.runInterval(tickWaypointVisuals, 10);
  world.afterEvents.playerLeave.subscribe((event) => clearRecord(event.playerId));
  world.afterEvents.worldLoad.subscribe(() => system.run(tickWaypointVisuals));
}
