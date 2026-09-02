import { normalizeXZ, rotateXZ } from "./geometry.js";
import { impactTelegraphDescriptors } from "./impact_telegraph.js";
import {
  FX2D_PRIORITY,
  scheduleBossFx2D,
  spawnBillboard,
  spawnBossFx2D,
  spawnFlipbook,
  spawnSpriteArc,
  spawnSpriteLine,
  spawnSpriteRing,
} from "./fx2d.js";

const JADE_BOSS_KEY = "jade_storm_ronin";

const JADE_FX = Object.freeze({
  crescent: "historyjam:jade_crescent_2d",
  afterimage: "historyjam:jade_afterimage_2d",
  stormSeal: "historyjam:jade_storm_seal_2d",
  lightning: "historyjam:jade_lightning_2d",
  fracture: "historyjam:jade_fracture_2d",
  impact: "historyjam:jade_impact_2d",
});

function point(origin, direction, distance, yOffset = 0) {
  const forward = normalizeXZ(direction);
  return {
    x: origin.x + forward.x * distance,
    y: origin.y + yOffset,
    z: origin.z + forward.z * distance,
  };
}

function midpointLine(descriptor, yOffset = 0) {
  return point(descriptor.origin, descriptor.direction, descriptor.length * 0.5, yOffset);
}

function descriptorFor(context, ability, plan, index = 0) {
  return impactTelegraphDescriptors(ability, plan, context.worldZone.center, index)[0];
}

function spawnImpact(context, at, size = 2.2, role = "secondary") {
  if (!at) return;
  spawnBossFx2D(context, JADE_FX.impact, at, {
    width: size,
    height: size,
    lifetimeSeconds: 0.45,
    styleRole: role,
    priority: FX2D_PRIORITY.critical,
  });
}

function spawnCrescent(context, at, width = 2.4, height = 1.2, role = "primary", lifetimeSeconds = 0.55) {
  if (!at) return;
  spawnBossFx2D(context, JADE_FX.crescent, at, {
    width,
    height,
    lifetimeSeconds,
    styleRole: role,
    priority: FX2D_PRIORITY.presentation,
  });
}

function spawnAfterimage(context, at, role = "primary", alphaScale = 1) {
  if (!at) return;
  const color = role === "secondary"
    ? { red: 0.72, green: 0.98, blue: 1.0, alpha: 0.72 * alphaScale }
    : { red: 0.35, green: 0.95, blue: 0.72, alpha: 0.68 * alphaScale };
  spawnBossFx2D(context, JADE_FX.afterimage, at, {
    width: 1.0,
    height: 2.0,
    lifetimeSeconds: 0.5,
    color,
    priority: FX2D_PRIORITY.presentation,
  });
}

function spawnLightning(context, at, width = 1.1, height = 4.6, role = "secondary", priority = FX2D_PRIORITY.presentation) {
  if (!at) return;
  spawnBossFx2D(context, JADE_FX.lightning, at, {
    width,
    height,
    lifetimeSeconds: 0.42,
    styleRole: role,
    priority,
  });
}

function spawnSeal(context, at, size, lifetimeSeconds, role = "primary", priority = FX2D_PRIORITY.critical) {
  if (!at) return;
  spawnBossFx2D(context, JADE_FX.stormSeal, { x: at.x, y: at.y + 0.06, z: at.z }, {
    width: size,
    height: size,
    lifetimeSeconds,
    styleRole: role,
    priority,
  });
}

function spawnFracture(context, at, size, role = "secondary") {
  if (!at) return;
  spawnBossFx2D(context, JADE_FX.fracture, { x: at.x, y: at.y + 0.07, z: at.z }, {
    width: size,
    height: size,
    lifetimeSeconds: 1.0,
    styleRole: role,
    priority: FX2D_PRIORITY.presentation,
  });
}

function ringPulse(context, center, radius, role = "primary", priority = FX2D_PRIORITY.presentation) {
  spawnSpriteRing(context, center, radius, {
    width: 0.55,
    height: 0.55,
    lifetimeSeconds: 0.45,
    spacing: 1.4,
    maxSamples: 28,
    styleRole: role,
    priority,
  });
}

function lineLightning(context, descriptor, options = {}) {
  if (!descriptor || descriptor.kind !== "line") return;
  spawnSpriteLine(context, descriptor.origin, descriptor.direction, descriptor.length, {
    effectId: JADE_FX.lightning,
    width: options.width ?? 0.72,
    height: options.height ?? 2.8,
    lifetimeSeconds: options.lifetimeSeconds ?? 0.42,
    spacing: options.spacing ?? 2.4,
    maxSamples: options.maxSamples ?? 22,
    styleRole: options.styleRole ?? "secondary",
    priority: options.priority ?? FX2D_PRIORITY.critical,
  });
}

function presentGaleDraw(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  const pose = plan.pose;
  ringPulse(context, pose.origin, 1.4, "primary");
  spawnFlipbook(context, { ...pose.origin, y: pose.origin.y + 1.1 }, {
    width: 1.4, height: 1.4, lifetimeSeconds: 0.55, styleRole: "secondary", priority: FX2D_PRIORITY.presentation,
  });
  for (const [delay, distance, scale] of [[4, 1.1, 1.3], [7, 1.8, 1.65], [10, 2.5, 2.05]]) {
    scheduleBossFx2D(context, delay, () => spawnCrescent(context, point(pose.origin, pose.view, distance, 1.0), scale * 1.6, scale * 0.75));
  }
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 2), () => {
    if (descriptor?.kind === "cone") {
      spawnSpriteArc(context, pose.origin, descriptor.range, -descriptor.angle / 2, descriptor.angle / 2, {
        width: 0.6, height: 0.6, lifetimeSeconds: 0.35, spacing: 0.9, maxSamples: 20, styleRole: "secondary", priority: FX2D_PRIORITY.critical,
      });
    }
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, point(pose.origin, pose.view, Math.min(2.2, descriptor?.range ?? 2.2), 1.0), 2.4));
}

function presentTempestStep(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "line") return;
  ringPulse(context, descriptor.origin, 1.1, "secondary");
  const delays = [3, 6, 9, 12];
  delays.forEach((delay, index) => {
    scheduleBossFx2D(context, delay, () => {
      const distance = descriptor.length * (index + 1) / (delays.length + 1);
      const at = point(descriptor.origin, descriptor.direction, distance, 0.05);
      spawnAfterimage(context, at, index % 2 === 0 ? "primary" : "secondary", 1 - index * 0.13);
      spawnCrescent(context, { ...at, y: at.y + 1.0 }, 1.9, 0.9, index % 2 === 0 ? "primary" : "secondary", 0.38);
    });
  });
  ability.impactTicks.forEach((impactTick, index) => {
    scheduleBossFx2D(context, Math.max(1, impactTick - 2), () => lineLightning(context, descriptor, { spacing: 2.8, height: 2.1, styleRole: index === 0 ? "primary" : "secondary" }));
    scheduleBossFx2D(context, impactTick, () => spawnImpact(context, midpointLine(descriptor, 0.7), 1.9));
  });
}

function presentThunderMark(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "circle") return;
  const center = descriptor.center;
  const size = Math.max(2.5, descriptor.radius * 2.05);
  scheduleBossFx2D(context, ability.telegraphStartTick ?? 6, () => spawnSeal(context, center, size, 1.35, "primary"));
  for (const delay of [12, 18, 24]) {
    scheduleBossFx2D(context, delay, () => {
      ringPulse(context, center, descriptor.radius, delay === 24 ? "secondary" : "primary", FX2D_PRIORITY.critical);
      spawnBillboard(context, { ...center, y: center.y + 2.2 }, { width: 0.8, height: 0.8, lifetimeSeconds: 0.3, styleRole: "secondary", priority: FX2D_PRIORITY.presentation });
    });
  }
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 2), () => {
    spawnLightning(context, { ...center, y: center.y + 2.2 }, 1.6, 6.5, "secondary", FX2D_PRIORITY.critical);
    spawnFracture(context, center, size * 0.92, "primary");
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, { ...center, y: center.y + 0.8 }, 2.9));
}

function presentWindCrescent(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  const pose = plan.pose;
  if (!descriptor || descriptor.kind !== "cone") return;
  const distances = [1.8, 3.6, 5.6, 7.6, Math.min(descriptor.range, 9.2)];
  distances.forEach((distance, index) => {
    const delay = 3 + index * 3;
    scheduleBossFx2D(context, delay, () => {
      const at = point(pose.origin, pose.view, distance, 1.0);
      spawnCrescent(context, at, 2.3 + index * 0.22, 1.05 + index * 0.08, index % 2 ? "secondary" : "primary", 0.42);
      if (index > 0) spawnBillboard(context, { ...at, y: at.y - 0.45 }, { width: 0.55, height: 0.55, lifetimeSeconds: 0.35, styleRole: "primary", priority: FX2D_PRIORITY.ambient });
    });
  });
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 1), () => {
    spawnSpriteArc(context, pose.origin, descriptor.range, -descriptor.angle / 2, descriptor.angle / 2, {
      width: 0.65, height: 0.65, lifetimeSeconds: 0.4, spacing: 1.0, maxSamples: 20, styleRole: "secondary", priority: FX2D_PRIORITY.critical,
    });
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, point(pose.origin, pose.view, descriptor.range * 0.72, 0.8), 2.1));
}

function presentCycloneGuard(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "ring") return;
  const center = descriptor.center;
  spawnSeal(context, center, descriptor.outerRadius * 1.7, 1.25, "primary", FX2D_PRIORITY.presentation);
  [1.7, 3.1, descriptor.outerRadius].forEach((radius, index) => {
    scheduleBossFx2D(context, 4 + index * 5, () => ringPulse(context, center, radius, index === 2 ? "secondary" : "primary", FX2D_PRIORITY.critical));
  });
  for (let index = 0; index < 8; index += 1) {
    const angle = index * 45;
    const direction = rotateXZ({ x: 0, z: -1 }, angle);
    scheduleBossFx2D(context, 8 + index % 3, () => spawnCrescent(context, point(center, direction, descriptor.outerRadius * 0.82, 1.05), 1.5, 0.72, index % 2 ? "secondary" : "primary", 0.65));
  }
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 2), () => ringPulse(context, center, descriptor.outerRadius, "secondary", FX2D_PRIORITY.critical));
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, { ...center, y: center.y + 0.8 }, 3.0));
}

function presentStormCross(context, ability, plan) {
  const center = context.worldZone.center;
  spawnSeal(context, center, 5.2, 1.6, "primary", FX2D_PRIORITY.presentation);
  ability.impactTicks.forEach((impactTick, index) => {
    const descriptor = descriptorFor(context, ability, plan, index);
    if (!descriptor || descriptor.kind !== "line") return;
    scheduleBossFx2D(context, Math.max(1, impactTick - 7), () => lineLightning(context, descriptor, { spacing: 3.1, height: 2.8, styleRole: index ? "secondary" : "primary" }));
    scheduleBossFx2D(context, Math.max(1, impactTick - 3), () => {
      lineLightning(context, descriptor, { spacing: 2.0, height: 3.8, width: 0.95, styleRole: "secondary", priority: FX2D_PRIORITY.critical });
      spawnFracture(context, center, 4.1, index ? "secondary" : "primary");
    });
    scheduleBossFx2D(context, impactTick, () => spawnImpact(context, { ...center, y: center.y + 1.0 }, 2.8 + index * 0.4));
  });
}

function presentRaijinHeavenSplit(context, ability, plan) {
  const center = context.worldZone.center;
  scheduleBossFx2D(context, 4, () => spawnSeal(context, center, 12.0, 4.6, "primary", FX2D_PRIORITY.critical));
  scheduleBossFx2D(context, 12, () => ringPulse(context, center, 8.0, "secondary", FX2D_PRIORITY.critical));
  scheduleBossFx2D(context, 20, () => {
    ringPulse(context, center, 12.0, "primary", FX2D_PRIORITY.critical);
    for (let index = 0; index < 8; index += 1) {
      const direction = rotateXZ({ x: 0, z: -1 }, index * 45);
      spawnLightning(context, point(center, direction, 8.5, 2.0), 1.1, 5.2, index % 2 ? "secondary" : "primary");
    }
  });
  [0, 1].forEach((index) => {
    const impactTick = ability.impactTicks[index];
    const descriptor = descriptorFor(context, ability, plan, index);
    if (!descriptor || descriptor.kind !== "line") return;
    scheduleBossFx2D(context, Math.max(1, impactTick - 10), () => lineLightning(context, descriptor, { spacing: 4.2, height: 2.8, styleRole: "primary" }));
    scheduleBossFx2D(context, Math.max(1, impactTick - 4), () => {
      lineLightning(context, descriptor, { spacing: 2.5, height: 5.0, width: 1.05, styleRole: "secondary", priority: FX2D_PRIORITY.critical });
      spawnFracture(context, center, 6.2 + index * 1.2, index ? "secondary" : "primary");
    });
    scheduleBossFx2D(context, impactTick, () => spawnImpact(context, { ...center, y: center.y + 1.2 }, 3.4 + index * 0.5));
  });
  const finalTick = ability.impactTicks[2];
  const finalDescriptor = descriptorFor(context, ability, plan, 2);
  scheduleBossFx2D(context, Math.max(1, finalTick - 12), () => {
    const radius = finalDescriptor?.kind === "circle" ? finalDescriptor.radius : 4;
    spawnSeal(context, center, radius * 2.4, 1.25, "secondary", FX2D_PRIORITY.critical);
    ringPulse(context, center, radius, "secondary", FX2D_PRIORITY.critical);
  });
  scheduleBossFx2D(context, Math.max(1, finalTick - 3), () => {
    for (let index = 0; index < 10; index += 1) {
      const direction = rotateXZ({ x: 0, z: -1 }, index * 36);
      spawnLightning(context, point(center, direction, 3.2, 2.4), 1.2, 6.4, index % 2 ? "secondary" : "primary", FX2D_PRIORITY.critical);
    }
    spawnFracture(context, center, 9.2, "secondary");
  });
  scheduleBossFx2D(context, finalTick, () => {
    spawnImpact(context, { ...center, y: center.y + 1.4 }, 5.0, "secondary");
    spawnFlipbook(context, { ...center, y: center.y + 1.0 }, { width: 5.4, height: 5.4, lifetimeSeconds: 0.65, styleRole: "secondary", priority: FX2D_PRIORITY.critical });
  });
}

export function presentJadeAbility2D(context, ability, plan) {
  if (context?.def?.key !== JADE_BOSS_KEY || !ability || !plan) return false;
  switch (ability.id) {
    case "gale_draw": presentGaleDraw(context, ability, plan); break;
    case "tempest_step": presentTempestStep(context, ability, plan); break;
    case "thunder_mark": presentThunderMark(context, ability, plan); break;
    case "wind_crescent": presentWindCrescent(context, ability, plan); break;
    case "cyclone_guard": presentCycloneGuard(context, ability, plan); break;
    case "storm_cross": presentStormCross(context, ability, plan); break;
    case "raijin_heaven_split": presentRaijinHeavenSplit(context, ability, plan); break;
    default: return false;
  }
  return true;
}
