import { normalizeXZ, rotateXZ } from "./geometry.js";
import { impactTelegraphDescriptors } from "./impact_telegraph.js";
import {
  FX2D_PRIORITY,
  scheduleBossFx2D,
  spawnBossFx2D,
  spawnSpriteLine,
  spawnSpriteRing,
} from "./fx2d.js";

const SEIRYU_BOSS_KEY = "seiryu_dragon_daimyo";

const SEIRYU_FX = Object.freeze({
  dragonHead: "historyjam:seiryu_dragon_head_2d",
  dragonBody: "historyjam:seiryu_dragon_body_2d",
  waterWall: "historyjam:seiryu_water_wall_2d",
  spear: "historyjam:seiryu_spear_2d",
  pillar: "historyjam:seiryu_pillar_2d",
  cloud: "historyjam:seiryu_cloud_2d",
  seal: "historyjam:seiryu_seal_2d",
  impact: "historyjam:seiryu_impact_2d",
});

function point(origin, direction, distance, yOffset = 0) {
  const forward = normalizeXZ(direction);
  return {
    x: origin.x + forward.x * distance,
    y: origin.y + yOffset,
    z: origin.z + forward.z * distance,
  };
}

function descriptorsFor(context, ability, plan, index = 0) {
  return impactTelegraphDescriptors(ability, plan, context.worldZone.center, index);
}

function descriptorFor(context, ability, plan, index = 0) {
  return descriptorsFor(context, ability, plan, index)[0];
}

function fx(context, effectId, at, options = {}) {
  if (!at) return false;
  return spawnBossFx2D(context, effectId, at, {
    lifetimeSeconds: 0.6,
    styleRole: "primary",
    priority: FX2D_PRIORITY.presentation,
    ...options,
  });
}

function dragonHead(context, at, width = 2.2, height = 1.7, role = "primary", priority = FX2D_PRIORITY.presentation) {
  return fx(context, SEIRYU_FX.dragonHead, at, { width, height, styleRole: role, priority, lifetimeSeconds: 0.62 });
}

function dragonBody(context, at, width = 1.6, height = 1.15, role = "primary", priority = FX2D_PRIORITY.presentation) {
  return fx(context, SEIRYU_FX.dragonBody, at, { width, height, styleRole: role, priority, lifetimeSeconds: 0.72 });
}

function impact(context, at, size = 2.4, role = "secondary") {
  return fx(context, SEIRYU_FX.impact, { ...at, y: at.y + 0.7 }, {
    width: size,
    height: size,
    styleRole: role,
    priority: FX2D_PRIORITY.critical,
    lifetimeSeconds: 0.5,
  });
}

function seal(context, at, size, lifetimeSeconds = 1.0, role = "primary") {
  return fx(context, SEIRYU_FX.seal, { ...at, y: at.y + 0.06 }, {
    width: size,
    height: size,
    lifetimeSeconds,
    styleRole: role,
    priority: FX2D_PRIORITY.critical,
  });
}

function bodyChain(context, origin, direction, startDistance, segments, spacing, yOffset = 1.0, role = "primary", priority = FX2D_PRIORITY.presentation) {
  for (let index = 0; index < segments; index += 1) {
    const distance = Math.max(0, startDistance - index * spacing);
    dragonBody(context, point(origin, direction, distance, yOffset + Math.sin(index * 0.8) * 0.22), 1.55 - index * 0.05, 1.05 - index * 0.03, role, priority);
  }
}

function waterLine(context, descriptor, options = {}) {
  if (!descriptor || descriptor.kind !== "line") return;
  spawnSpriteLine(context, descriptor.origin, descriptor.direction, descriptor.length, {
    effectId: SEIRYU_FX.waterWall,
    width: options.width ?? 1.3,
    height: options.height ?? 2.5,
    lifetimeSeconds: options.lifetimeSeconds ?? 0.6,
    spacing: options.spacing ?? 1.9,
    maxSamples: options.maxSamples ?? 28,
    yOffset: options.yOffset ?? 1.05,
    styleRole: options.styleRole ?? "primary",
    priority: options.priority ?? FX2D_PRIORITY.critical,
  });
}

function presentAzureDragonArc(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "cone") return;
  const pose = plan.pose;
  seal(context, pose.origin, 2.4, 0.7, "primary");
  [4, 7, 10, 13].forEach((delay, index) => {
    scheduleBossFx2D(context, delay, () => {
      const distance = Math.min(descriptor.range, 1.3 + index * 1.15);
      const at = point(pose.origin, pose.view, distance, 1.15 + index * 0.05);
      dragonHead(context, at, 1.8 + index * 0.18, 1.35 + index * 0.12, index % 2 ? "secondary" : "primary");
      bodyChain(context, pose.origin, pose.view, distance - 0.7, 3, 0.55, 1.0, "primary");
    });
  });
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 2), () => {
    for (const offset of [-descriptor.angle / 2, descriptor.angle / 2]) {
      spawnSpriteLine(context, pose.origin, rotateXZ(pose.view, offset), descriptor.range, {
        effectId: SEIRYU_FX.cloud,
        width: 0.8,
        height: 0.6,
        lifetimeSeconds: 0.45,
        spacing: 1.15,
        maxSamples: 12,
        yOffset: 0.55,
        styleRole: "secondary",
        priority: FX2D_PRIORITY.critical,
      });
    }
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => impact(context, point(pose.origin, pose.view, descriptor.range * 0.72, 0.1), 2.8));
}

function presentTidalLine(context, ability, plan) {
  ability.impactTicks.forEach((impactTick, index) => {
    const descriptor = descriptorFor(context, ability, plan, index);
    if (!descriptor || descriptor.kind !== "line") return;
    scheduleBossFx2D(context, Math.max(1, impactTick - 8), () => waterLine(context, descriptor, { width: 1.0, height: 1.8, styleRole: "primary" }));
    scheduleBossFx2D(context, Math.max(1, impactTick - 3), () => {
      waterLine(context, descriptor, { width: 1.45, height: 3.0, spacing: 1.45, styleRole: "secondary" });
      spawnSpriteLine(context, descriptor.origin, descriptor.direction, descriptor.length, {
        effectId: SEIRYU_FX.cloud,
        width: 0.7,
        height: 0.55,
        lifetimeSeconds: 0.5,
        spacing: 1.25,
        maxSamples: 30,
        yOffset: 0.25,
        styleRole: "secondary",
        priority: FX2D_PRIORITY.presentation,
      });
    });
    scheduleBossFx2D(context, impactTick, () => impact(context, point(descriptor.origin, descriptor.direction, descriptor.length * 0.62, 0.2), 2.25));
  });
}

function presentSkySpear(context, ability, plan) {
  const descriptors = descriptorsFor(context, ability, plan, 0).filter((entry) => entry.kind === "circle");
  descriptors.forEach((descriptor, index) => {
    const center = descriptor.center;
    scheduleBossFx2D(context, ability.telegraphStartTick ?? 10, () => seal(context, center, descriptor.radius * 1.75, 1.45, index % 2 ? "secondary" : "primary"));
    [16, 24, 30].forEach((delay, stage) => scheduleBossFx2D(context, delay, () => {
      fx(context, SEIRYU_FX.spear, { ...center, y: center.y + 5.8 - stage * 1.35 }, {
        width: 0.8 + stage * 0.12,
        height: 3.4 + stage * 0.35,
        lifetimeSeconds: 0.55,
        styleRole: stage === 2 ? "secondary" : "primary",
        priority: FX2D_PRIORITY.critical,
      });
    }));
    scheduleBossFx2D(context, ability.impactTicks[0], () => impact(context, center, 2.6));
  });
}

function presentDragonRush(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "line") return;
  [3, 7, 11, 15].forEach((delay, index) => scheduleBossFx2D(context, delay, () => {
    const distance = descriptor.length * (index + 1) / 5;
    const at = point(descriptor.origin, descriptor.direction, distance, 1.15);
    dragonHead(context, at, 2.0, 1.5, index % 2 ? "secondary" : "primary");
    bodyChain(context, descriptor.origin, descriptor.direction, distance - 0.8, 4, 0.65, 1.0, "primary");
  }));
  ability.impactTicks.forEach((impactTick, index) => {
    scheduleBossFx2D(context, Math.max(1, impactTick - 3), () => waterLine(context, descriptor, { width: 0.8 + index * 0.15, height: 1.7 + index * 0.4, styleRole: index ? "secondary" : "primary" }));
    scheduleBossFx2D(context, impactTick, () => impact(context, point(descriptor.origin, descriptor.direction, descriptor.length * (0.55 + index * 0.18), 0.1), 2.2 + index * 0.3));
  });
}

function presentCoilingRing(context, ability, plan) {
  const first = descriptorFor(context, ability, plan, 0);
  const second = descriptorFor(context, ability, plan, 1);
  if (!first || first.kind !== "ring" || !second || second.kind !== "circle") return;
  const center = first.center;
  scheduleBossFx2D(context, ability.telegraphStartTick ?? 10, () => {
    seal(context, center, first.outerRadius * 1.3, 2.0, "primary");
    spawnSpriteRing(context, center, first.outerRadius, {
      effectId: SEIRYU_FX.dragonBody,
      width: 1.25,
      height: 0.95,
      lifetimeSeconds: 1.0,
      spacing: 1.35,
      maxSamples: 30,
      yOffset: 1.05,
      styleRole: "primary",
      priority: FX2D_PRIORITY.critical,
    });
  });
  for (let index = 0; index < 4; index += 1) {
    const direction = rotateXZ({ x: 0, z: -1 }, index * 90);
    scheduleBossFx2D(context, 16 + index * 2, () => dragonHead(context, point(center, direction, first.outerRadius, 1.2), 2.0, 1.5, index % 2 ? "secondary" : "primary", FX2D_PRIORITY.critical));
  }
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 3), () => spawnSpriteRing(context, center, first.outerRadius, {
    effectId: SEIRYU_FX.waterWall, width: 1.0, height: 2.4, lifetimeSeconds: 0.65, spacing: 1.3, maxSamples: 32, yOffset: 1.0, styleRole: "secondary", priority: FX2D_PRIORITY.critical,
  }));
  scheduleBossFx2D(context, ability.impactTicks[0], () => impact(context, center, 3.0));
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[1] - 4), () => seal(context, second.center, second.radius * 1.8, 0.8, "secondary"));
  scheduleBossFx2D(context, ability.impactTicks[1], () => impact(context, second.center, 3.4, "secondary"));
}

function presentDragonPillars(context, ability, plan) {
  const descriptors = descriptorsFor(context, ability, plan, 0).filter((entry) => entry.kind === "circle");
  descriptors.forEach((descriptor, index) => {
    const center = descriptor.center;
    scheduleBossFx2D(context, ability.telegraphStartTick ?? 12, () => seal(context, center, descriptor.radius * 1.6, 1.7, index % 2 ? "secondary" : "primary"));
    scheduleBossFx2D(context, 26 + index % 3, () => fx(context, SEIRYU_FX.pillar, { ...center, y: center.y + 2.1 }, {
      width: 1.6,
      height: 5.4,
      lifetimeSeconds: 0.95,
      styleRole: index % 2 ? "secondary" : "primary",
      priority: FX2D_PRIORITY.critical,
    }));
    scheduleBossFx2D(context, 34 + index % 2, () => dragonHead(context, { ...center, y: center.y + 4.2 }, 2.1, 1.6, "secondary", FX2D_PRIORITY.critical));
    scheduleBossFx2D(context, ability.impactTicks[0], () => impact(context, center, 2.7));
  });
}

function presentCelestialSeiryu(context, ability, plan) {
  const center = context.worldZone.center;
  scheduleBossFx2D(context, 4, () => {
    seal(context, center, 15.0, 5.0, "primary");
    fx(context, SEIRYU_FX.cloud, { ...center, y: center.y + 8.5 }, { width: 14.0, height: 5.0, lifetimeSeconds: 4.5, styleRole: "secondary", priority: FX2D_PRIORITY.presentation });
  });
  scheduleBossFx2D(context, 12, () => {
    dragonHead(context, { ...center, y: center.y + 8.0 }, 7.0, 5.0, "secondary", FX2D_PRIORITY.critical);
    for (let index = 0; index < 8; index += 1) {
      const direction = rotateXZ({ x: 0, z: -1 }, 180 + index * 7);
      dragonBody(context, point(center, direction, 2.2 + index * 1.2, 7.2 - index * 0.22), 4.4 - index * 0.22, 3.0 - index * 0.13, index % 2 ? "primary" : "secondary");
    }
  });
  ability.impactTicks.forEach((impactTick, index) => {
    const descriptor = descriptorFor(context, ability, plan, index);
    if (!descriptor || descriptor.kind !== "cone") return;
    const centerAngle = index * (ability.shape.stepDegrees ?? 58);
    const direction = rotateXZ({ x: 0, z: -1 }, centerAngle);
    scheduleBossFx2D(context, Math.max(1, impactTick - 10), () => {
      dragonHead(context, point(center, direction, descriptor.range * 0.48, 4.8), 4.4, 3.1, index % 2 ? "secondary" : "primary", FX2D_PRIORITY.critical);
      bodyChain(context, center, direction, descriptor.range * 0.42, 6, 1.35, 4.2, index % 2 ? "secondary" : "primary", FX2D_PRIORITY.presentation);
    });
    scheduleBossFx2D(context, Math.max(1, impactTick - 4), () => {
      [-descriptor.angle / 2, 0, descriptor.angle / 2].forEach((offset) => {
        const ray = rotateXZ(direction, offset);
        spawnSpriteLine(context, center, ray, descriptor.range, {
          effectId: SEIRYU_FX.waterWall,
          width: 1.0,
          height: 2.2,
          lifetimeSeconds: 0.55,
          spacing: 2.8,
          maxSamples: 18,
          yOffset: 0.85,
          styleRole: offset === 0 ? "secondary" : "primary",
          priority: FX2D_PRIORITY.critical,
        });
      });
    });
    scheduleBossFx2D(context, impactTick, () => impact(context, point(center, direction, descriptor.range * 0.62, 0.2), 3.1 + index * 0.35, index === ability.impactTicks.length - 1 ? "secondary" : "primary"));
  });
  scheduleBossFx2D(context, ability.impactTicks[ability.impactTicks.length - 1], () => {
    spawnSpriteRing(context, center, 10.5, { effectId: SEIRYU_FX.cloud, width: 1.0, height: 0.8, lifetimeSeconds: 0.7, spacing: 1.8, maxSamples: 34, yOffset: 1.2, styleRole: "secondary", priority: FX2D_PRIORITY.critical });
  });
}

export function presentSeiryuAbility2D(context, ability, plan) {
  if (context?.def?.key !== SEIRYU_BOSS_KEY || !ability || !plan) return false;
  switch (ability.id) {
    case "azure_dragon_arc": presentAzureDragonArc(context, ability, plan); break;
    case "tidal_line": presentTidalLine(context, ability, plan); break;
    case "sky_spear": presentSkySpear(context, ability, plan); break;
    case "dragon_rush": presentDragonRush(context, ability, plan); break;
    case "coiling_ring": presentCoilingRing(context, ability, plan); break;
    case "dragon_pillars": presentDragonPillars(context, ability, plan); break;
    case "celestial_seiryu": presentCelestialSeiryu(context, ability, plan); break;
    default: return false;
  }
  return true;
}
