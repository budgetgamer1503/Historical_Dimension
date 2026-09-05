import {
  CatmullRomSpline,
  EasingType,
  InputPermissionCategory,
  system,
} from "@minecraft/server";
import { buildCameraPoints, buildLookAtRotations, getCinematicProfile } from "./cinematic_profiles.js";
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

  // The custom HUD reads #hud_title_text_string directly. On some Bedrock clients the
  // bound title string can outlive the native title's stay duration, so every presentation
  // also gets an independent token-safe cleanup even if its async cinematic is interrupted.
  system.runTimeout(() => clearBossUi(player, token), Math.max(2, Math.floor(durationTicks) + 2));
  return token;
}

function clearBossUi(player, token = undefined) {
  const currentToken = bossUiTokenByPlayer.get(player.id);
  if (token !== undefined && currentToken !== token)
    return;

  const clearToken = currentToken;

  // Do not rely on setTitle("") alone for the custom HUD binding. First replace the
  // HJBOSS_* payload with an invisible non-HJBOSS sentinel so the resource-pack overlay
  // immediately evaluates to hidden, then clear the native title a couple of ticks later.
  try {
    player.onScreenDisplay.setTitle("§r", {
      fadeInDuration: 0,
      stayDuration: 1,
      fadeOutDuration: 0,
    });
  } catch {}

  system.runTimeout(() => {
    const latestToken = bossUiTokenByPlayer.get(player.id);
    if (clearToken !== undefined && latestToken !== clearToken)
      return;
    if (clearToken === undefined && latestToken !== undefined)
      return;

    try { player.onScreenDisplay.setTitle(""); } catch {}
    if (clearToken === undefined || bossUiTokenByPlayer.get(player.id) === clearToken)
      bossUiTokenByPlayer.delete(player.id);
  }, 2);
}

export function clearBossPresentations(world, playerIds) {
  for (const id of playerIds ?? []) {
    const player = playerById(world, id);
    if (!player) continue;
    clearBossUi(player);
    try { player.camera.clear(); } catch {}
    try { setInputEnabled(player, true); } catch {}
  }
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

function lookAtKeyFrames(points, target, durationSeconds) {
  const rotations = buildLookAtRotations(points, target);
  const lastIndex = Math.max(1, rotations.length - 1);
  return rotations.map((rotation, index) => ({
    timeSeconds: durationSeconds * index / lastIndex,
    rotation,
    easingFunc: EasingType.InOutSine,
  }));
}

function cameraProgressKeyFrames(durationSeconds) {
  // Keep spline progress linear so camera position reaches each evenly spaced control point
  // at the same time as its matching look-at rotation keyframe. The Catmull-Rom curve still
  // supplies the smooth spatial motion; mismatched progress easing was causing the camera to
  // rotate as if it had reached the next point while it was still elsewhere on the path.
  return [
    { timeSeconds: 0, alpha: 0, easingFunc: EasingType.Linear },
    { timeSeconds: durationSeconds, alpha: 1, easingFunc: EasingType.Linear },
  ];
}

async function playIntroForPlayer(player, def, center, bossLocation, profile) {
  const points = terrainSafeCameraPoints(player.dimension, buildCameraPoints(center, profile), 3);
  const target = {
    x: Number(bossLocation.x),
    y: Number(bossLocation.y) + 1.35,
    z: Number(bossLocation.z),
  };
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
    player.camera.setCamera("minecraft:free", {
      location: points[0],
      facingLocation: target,
    });
    uiToken = showBossUi(player, "intro", def.displayName, def.zone.subtitle, durationTicks);
    await system.waitTicks(2);

    player.camera.playAnimation(spline, {
      animation: {
        progressKeyFrames: cameraProgressKeyFrames(profile.introSeconds),
        rotationKeyFrames: lookAtKeyFrames(points, target, profile.introSeconds),
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
    const bossLocation = { ...context.boss.location };
    await Promise.all(players.map(async (player) => {
      try {
        await playIntroForPlayer(
          player,
          context.def,
          context.worldZone.center,
          bossLocation,
          profile,
        );
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
  const target = {
    x: Number(location.x),
    y: Number(location.y) + 1.15,
    z: Number(location.z),
  };
  const spline = new CatmullRomSpline();
  spline.controlPoints = points;
  const durationTicks = Math.max(1, Math.round(profile.victorySeconds * 20));
  let uiToken;
  try {
    setInputEnabled(player, false);
    player.camera.setCamera("minecraft:free", {
      location: points[0],
      facingLocation: target,
    });
    uiToken = showBossUi(player, "victory", "SAMURAI DEFEATED", def.displayName, durationTicks);
    await system.waitTicks(2);
    player.camera.playAnimation(spline, {
      animation: {
        progressKeyFrames: cameraProgressKeyFrames(profile.victorySeconds),
        rotationKeyFrames: lookAtKeyFrames(points, target, profile.victorySeconds),
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
