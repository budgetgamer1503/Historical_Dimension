import {
  CatmullRomSpline,
  EasingType,
  InputPermissionCategory,
  system,
} from "@minecraft/server";
import { buildCameraPoints, getCinematicProfile, lookRotation } from "./cinematic_profiles.js";
import { buildBossUiPayload } from "./boss_ui_protocol.js";
import { logError } from "../diagnostics/logging.js";

const bossUiTokenByPlayer = new Map();

function playerById(world, id) {
  try {
    const entity = world.getEntity(id);
    return entity?.typeId === "minecraft:player" && entity.isValid !== false ? entity : undefined;
  } catch {
    return undefined;
  }
}

function setInputEnabled(player, enabled) {
  let firstError;
  for (const category of [InputPermissionCategory.Camera, InputPermissionCategory.Movement]) {
    try {
      player.inputPermissions.setPermissionCategory(category, enabled);
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError) throw firstError;
}

function showBossUi(player, kind, title, subtitle, durationTicks) {
  const token = (bossUiTokenByPlayer.get(player.id) ?? 0) + 1;
  bossUiTokenByPlayer.set(player.id, token);
  player.onScreenDisplay.setTitle(buildBossUiPayload(kind, title, subtitle), {
    fadeInDuration: 0,
    stayDuration: Math.max(1, Math.floor(durationTicks)),
    fadeOutDuration: 0,
  });
  return token;
}

function clearBossUi(player, token = undefined) {
  if (token !== undefined && bossUiTokenByPlayer.get(player.id) !== token)
    return;
  try {
    player.onScreenDisplay.setTitle("");
  } catch {}
  if (token === undefined || bossUiTokenByPlayer.get(player.id) === token)
    bossUiTokenByPlayer.delete(player.id);
}

function terrainSafeCameraPoint(dimension, point, clearance = 3) {
  try {
    const probe = { x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z) };
    if (!dimension.isChunkLoaded(probe)) return point;
    const top = dimension.getTopmostBlock({ x: probe.x, z: probe.z });
    if (!top) return point;
    return { ...point, y: Math.max(point.y, top.location.y + Math.max(2, clearance)) };
  } catch {
    return point;
  }
}

function terrainSafeCameraPoints(dimension, points, clearance = 3) {
  return points.map((point) => terrainSafeCameraPoint(dimension, point, clearance));
}

async function playIntroForPlayer(player, def, center, profile) {
  const points = terrainSafeCameraPoints(player.dimension, buildCameraPoints(center, profile), 3);
  const target = { x: center.x, y: center.y + 1.2, z: center.z };
  const spline = new CatmullRomSpline();
  spline.controlPoints = points;
  const durationTicks = Math.max(1, Math.round(profile.introSeconds * 20));
  let uiToken;

  try {
    setInputEnabled(player, false);
    player.camera.fade({
      fadeColor: { red: 0, green: 0, blue: 0 },
      fadeTime: { fadeInTime: 0.25, holdTime: 0.15, fadeOutTime: 0.35 },
    });
    const firstRotation = lookRotation(points[0], target);
    player.camera.setCamera("minecraft:free", {
      location: points[0],
      rotation: { x: firstRotation.x, y: firstRotation.y },
    });
    uiToken = showBossUi(player, "intro", def.displayName, def.zone.subtitle, durationTicks);
    await system.waitTicks(2);

    player.camera.playAnimation(spline, {
      animation: {
        progressKeyFrames: [
          { timeSeconds: 0, alpha: 0, easingFunc: EasingType.InOutCubic },
          { timeSeconds: profile.introSeconds, alpha: 1, easingFunc: EasingType.InOutCubic },
        ],
        rotationKeyFrames: points.map((point, index) => ({
          timeSeconds: profile.introSeconds * index / (points.length - 1),
          rotation: lookRotation(point, target),
          easingFunc: EasingType.InOutSine,
        })),
      },
      totalTimeSeconds: profile.introSeconds,
    });

    await system.waitTicks(durationTicks);
  } finally {
    clearBossUi(player, uiToken);
    try { player.camera.clear(); } catch {}
    try { setInputEnabled(player, true); } catch {}
  }
}

export async function playBossIntro(context) {
  const profile = getCinematicProfile(context.def.key);
  if (!profile) return;
  try { context.boss.triggerEvent("historyjam:cast_start"); } catch {}
  try { context.boss.playAnimation("animation.historyjam.samurai.phase_shift", { blendOutTime: 0.12 }); } catch {}

  try {
    const players = context.participantIds
      .map((id) => playerById(context.world, id))
      .filter(Boolean);
    await Promise.all(players.map(async (player) => {
      try {
        await playIntroForPlayer(player, context.def, context.worldZone.center, profile);
      } catch (error) {
        logError(`boss-intro-camera-${context.def.key}-${player.id}`, error, 20);
      }
    }));
  } finally {
    try { context.boss.triggerEvent("historyjam:cast_end"); } catch {}
  }
}

async function playVictoryForPlayer(player, def, location, profile) {
  const points = terrainSafeCameraPoints(player.dimension, [
    { x: location.x - 8, y: location.y + 5, z: location.z - 8 },
    { x: location.x - 3, y: location.y + 7, z: location.z - 1 },
    { x: location.x + 3, y: location.y + 8, z: location.z + 2 },
    { x: location.x + 9, y: location.y + 7, z: location.z + 7 },
  ], 3);
  const [first, , , second] = points;
  const spline = new CatmullRomSpline();
  spline.controlPoints = points;
  const durationTicks = Math.max(1, Math.round(profile.victorySeconds * 20));
  let uiToken;
  try {
    setInputEnabled(player, false);
    const rot = lookRotation(first, location);
    player.camera.setCamera("minecraft:free", { location: first, rotation: { x: rot.x, y: rot.y } });
    uiToken = showBossUi(player, "victory", "SAMURAI DEFEATED", def.displayName, durationTicks);
    await system.waitTicks(2);
    player.camera.playAnimation(spline, {
      animation: {
        progressKeyFrames: [
          { timeSeconds: 0, alpha: 0, easingFunc: EasingType.OutCubic },
          { timeSeconds: profile.victorySeconds, alpha: 1, easingFunc: EasingType.InOutSine },
        ],
        rotationKeyFrames: [
          { timeSeconds: 0, rotation: lookRotation(first, location), easingFunc: EasingType.InOutSine },
          { timeSeconds: profile.victorySeconds, rotation: lookRotation(second, location), easingFunc: EasingType.InOutSine },
        ],
      },
      totalTimeSeconds: profile.victorySeconds,
    });
    await system.waitTicks(durationTicks);
  } finally {
    clearBossUi(player, uiToken);
    try { player.camera.clear(); } catch {}
    try { setInputEnabled(player, true); } catch {}
  }
}

export async function playBossVictory({ world, playerIds, def, location }) {
  const profile = getCinematicProfile(def.key);
  if (!profile) return;
  const players = playerIds.map((id) => playerById(world, id)).filter(Boolean);
  await Promise.all(players.map(async (player) => {
    try {
      await playVictoryForPlayer(player, def, location, profile);
    } catch (error) {
      logError(`boss-victory-camera-${def.key}-${player.id}`, error, 20);
    }
  }));
}

export function showPhasePresentation(context, phase) {
  const labels = {
    2: "SECOND FORM",
    3: "THIRD FORM",
    4: "FINAL FORM",
  };
  const techniques = {
    2: context.def.phaseTwoTitle ?? "The duel intensifies",
    3: context.def.phaseThreeTitle ?? "A killing rhythm emerges",
    4: context.def.phaseFourTitle ?? "No restraint remains",
  };

  for (const id of context.participantIds) {
    const player = playerById(context.world, id);
    if (!player) continue;
    try {
      const uiToken = showBossUi(
        player,
        "phase",
        labels[phase] ?? `PHASE ${phase}`,
        techniques[phase] ?? "",
        28,
      );
      player.camera.fade({
        fadeColor: { red: 0.06, green: 0.06, blue: 0.06 },
        fadeTime: { fadeInTime: 0.05, holdTime: 0.05, fadeOutTime: 0.2 },
      });
      system.runTimeout(() => clearBossUi(player, uiToken), 29);
    } catch (error) {
      clearBossUi(player);
      logError(`boss-phase-presentation-${context.def.key}-${player.id}`, error, 20);
    }
  }
}
