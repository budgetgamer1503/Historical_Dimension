import { MolangVariableMap, system } from "@minecraft/server";
import { fx2dStyleForBossKey } from "./visual_identity.js";

export const FX2D_PARTICLES = Object.freeze({
  billboard: "historyjam:fx2d_billboard",
  verticalCard: "historyjam:fx2d_vertical_card",
  floorDisc: "historyjam:fx2d_floor_disc",
  flipbook: "historyjam:fx2d_flipbook",
});

export const FX2D_PRIORITY = Object.freeze({
  critical: "critical",
  presentation: "presentation",
  ambient: "ambient",
});

const PER_TICK_EMITTER_BUDGET = Object.freeze({
  critical: 128,
  presentation: 64,
  ambient: 24,
});

function finitePoint(point) {
  return point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function budgetState(context) {
  if (!context) return undefined;
  if (!context.fx2dBudget || context.fx2dBudget.tick !== system.currentTick) {
    context.fx2dBudget = {
      tick: system.currentTick,
      critical: 0,
      presentation: 0,
      ambient: 0,
    };
  }
  return context.fx2dBudget;
}

function spendBudget(context, priority, cost = 1) {
  const key = PER_TICK_EMITTER_BUDGET[priority] ? priority : FX2D_PRIORITY.presentation;
  const state = budgetState(context);
  if (!state) return false;
  const safeCost = Math.max(1, Math.floor(Number(cost) || 1));
  if (state[key] + safeCost > PER_TICK_EMITTER_BUDGET[key]) return false;
  state[key] += safeCost;
  return true;
}

function normalizeColor(color) {
  const fallback = { red: 1, green: 1, blue: 1, alpha: 1 };
  if (!color) return fallback;
  return {
    red: clamp(color.red, 0, 1),
    green: clamp(color.green, 0, 1),
    blue: clamp(color.blue, 0, 1),
    alpha: clamp(color.alpha ?? 1, 0, 1),
  };
}

function makeVariables(options = {}) {
  const variables = new MolangVariableMap();
  const color = normalizeColor(options.color);
  variables.setColorRGBA("variable.fx_color", color);
  variables.setFloat("variable.fx_width", clamp(options.width ?? 1, 0.01, 64));
  variables.setFloat("variable.fx_height", clamp(options.height ?? options.width ?? 1, 0.01, 64));
  variables.setFloat("variable.fx_lifetime", clamp(options.lifetimeSeconds ?? 0.6, 0.05, 30));
  variables.setFloat("variable.fx_scale", clamp(options.scale ?? 1, 0.01, 16));
  return variables;
}

function styleColor(context, styleRole) {
  const style = fx2dStyleForBossKey(context?.def?.key);
  return style?.[styleRole] ?? style?.primary;
}

export function spawnBossFx2D(context, effectId, point, options = {}) {
  if (!context?.dimension || typeof effectId !== "string" || effectId.length === 0 || !finitePoint(point)) return false;
  const priority = options.priority ?? FX2D_PRIORITY.presentation;
  if (!spendBudget(context, priority, options.cost ?? 1)) return false;
  const color = options.color ?? styleColor(context, options.styleRole ?? "primary");
  try {
    context.dimension.spawnParticle(effectId, point, makeVariables({ ...options, color }));
    return true;
  } catch {
    return false;
  }
}

export function spawnBillboard(context, point, options = {}) {
  return spawnBossFx2D(context, options.effectId ?? FX2D_PARTICLES.billboard, point, options);
}

export function spawnVerticalCard(context, point, options = {}) {
  return spawnBossFx2D(context, options.effectId ?? FX2D_PARTICLES.verticalCard, point, options);
}

export function spawnFloorDisc(context, point, options = {}) {
  return spawnBossFx2D(context, options.effectId ?? FX2D_PARTICLES.floorDisc, point, options);
}

export function spawnFlipbook(context, point, options = {}) {
  return spawnBossFx2D(context, options.effectId ?? FX2D_PARTICLES.flipbook, point, options);
}

function sampleCount(length, spacing, maxSamples) {
  return Math.max(2, Math.min(maxSamples, Math.ceil(Math.max(0, length) / Math.max(0.25, spacing)) + 1));
}

export function spawnSpriteLine(context, origin, direction, length, options = {}) {
  if (!finitePoint(origin) || !direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.z)) return 0;
  const magnitude = Math.hypot(direction.x, direction.z);
  if (magnitude < 0.0001) return 0;
  const forward = { x: direction.x / magnitude, z: direction.z / magnitude };
  const safeLength = Math.max(0, Number(length) || 0);
  const count = sampleCount(safeLength, options.spacing ?? 1.2, options.maxSamples ?? 48);
  let spawned = 0;
  for (let index = 0; index < count; index += 1) {
    const distance = count === 1 ? 0 : safeLength * index / (count - 1);
    const point = {
      x: origin.x + forward.x * distance,
      y: origin.y + (options.yOffset ?? 0),
      z: origin.z + forward.z * distance,
    };
    if (spawnBillboard(context, point, { ...options, cost: 1 })) spawned += 1;
  }
  return spawned;
}

export function spawnSpriteArc(context, center, radius, startDegrees, endDegrees, options = {}) {
  if (!finitePoint(center)) return 0;
  const safeRadius = Math.max(0, Number(radius) || 0);
  const arcDegrees = Math.abs((Number(endDegrees) || 0) - (Number(startDegrees) || 0));
  const arcLength = safeRadius * arcDegrees * Math.PI / 180;
  const count = sampleCount(arcLength, options.spacing ?? 1.25, options.maxSamples ?? 56);
  let spawned = 0;
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : index / (count - 1);
    const angle = ((Number(startDegrees) || 0) + ((Number(endDegrees) || 0) - (Number(startDegrees) || 0)) * t) * Math.PI / 180;
    const point = {
      x: center.x + Math.cos(angle) * safeRadius,
      y: center.y + (options.yOffset ?? 0),
      z: center.z + Math.sin(angle) * safeRadius,
    };
    if (spawnBillboard(context, point, { ...options, cost: 1 })) spawned += 1;
  }
  return spawned;
}

export function spawnSpriteRing(context, center, radius, options = {}) {
  return spawnSpriteArc(context, center, radius, 0, 360, options);
}

export function scheduleBossFx2D(context, delayTicks, callback) {
  if (!context || typeof callback !== "function") return undefined;
  const delay = Math.max(0, Math.floor(Number(delayTicks) || 0));
  const handle = system.runTimeout(() => {
    if (context.handles instanceof Set) context.handles.delete(handle);
    if (context.ended || context.boss?.isValid === false) return;
    try { callback(); } catch {}
  }, delay);
  if (context.handles instanceof Set) context.handles.add(handle);
  return handle;
}

export function spawnSpriteSequence(context, sequence, options = {}) {
  if (!Array.isArray(sequence)) return 0;
  let scheduled = 0;
  for (const entry of sequence) {
    if (!entry || !finitePoint(entry.point)) continue;
    scheduleBossFx2D(context, entry.delayTicks ?? 0, () => {
      const merged = { ...options, ...(entry.options ?? {}) };
      const mode = entry.mode ?? merged.mode ?? "billboard";
      if (mode === "vertical") spawnVerticalCard(context, entry.point, merged);
      else if (mode === "floor") spawnFloorDisc(context, entry.point, merged);
      else if (mode === "flipbook") spawnFlipbook(context, entry.point, merged);
      else spawnBillboard(context, entry.point, merged);
    });
    scheduled += 1;
  }
  return scheduled;
}

export function tsukikageTellOptions(real, options = {}) {
  return real
    ? { ...options, styleRole: "real", priority: options.priority ?? FX2D_PRIORITY.critical }
    : { ...options, styleRole: "fake", priority: options.priority ?? FX2D_PRIORITY.presentation };
}
