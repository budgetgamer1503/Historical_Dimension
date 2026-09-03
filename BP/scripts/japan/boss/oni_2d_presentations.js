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

const ONI_BOSS_KEY = "oni_blood_warlord";

const ONI_FX = Object.freeze({
  cleaver: "historyjam:oni_cleaver_2d",
  fracture: "historyjam:oni_fracture_2d",
  chain: "historyjam:oni_chain_2d",
  pool: "historyjam:oni_pool_2d",
  orb: "historyjam:oni_orb_2d",
  roar: "historyjam:oni_roar_2d",
  demon: "historyjam:oni_demon_2d",
  impact: "historyjam:oni_impact_2d",
});

function point(origin, direction, distance, yOffset = 0) {
  const forward = normalizeXZ(direction);
  return {
    x: origin.x + forward.x * distance,
    y: origin.y + yOffset,
    z: origin.z + forward.z * distance,
  };
}

function descriptorFor(context, ability, plan, index = 0) {
  return impactTelegraphDescriptors(ability, plan, context.worldZone.center, index)[0];
}

function spawnFx(context, effectId, at, options = {}) {
  if (!at) return false;
  return spawnBossFx2D(context, effectId, at, {
    width: options.width ?? 1.6,
    height: options.height ?? options.width ?? 1.6,
    lifetimeSeconds: options.lifetimeSeconds ?? 0.55,
    styleRole: options.styleRole ?? "primary",
    priority: options.priority ?? FX2D_PRIORITY.presentation,
    color: options.color,
  });
}

function spawnImpact(context, at, size = 2.4, role = "primary") {
  spawnFx(context, ONI_FX.impact, at, {
    width: size,
    height: size,
    lifetimeSeconds: 0.45,
    styleRole: role,
    priority: FX2D_PRIORITY.critical,
  });
}

function spawnPool(context, at, size, lifetimeSeconds = 1.8, priority = FX2D_PRIORITY.critical) {
  spawnFx(context, ONI_FX.pool, { x: at.x, y: at.y + 0.05, z: at.z }, {
    width: size,
    height: size,
    lifetimeSeconds,
    priority,
  });
}

function spawnFracture(context, at, size, role = "secondary") {
  spawnFx(context, ONI_FX.fracture, { x: at.x, y: at.y + 0.06, z: at.z }, {
    width: size,
    height: size,
    lifetimeSeconds: 1.15,
    styleRole: role,
    priority: FX2D_PRIORITY.presentation,
  });
}

function ringPulse(context, center, radius, role = "primary", priority = FX2D_PRIORITY.critical) {
  spawnSpriteRing(context, center, radius, {
    effectId: ONI_FX.orb,
    width: 0.55,
    height: 0.55,
    lifetimeSeconds: 0.48,
    spacing: 1.2,
    maxSamples: 30,
    styleRole: role,
    priority,
  });
}

function chainLine(context, descriptor, role = "primary", priority = FX2D_PRIORITY.critical) {
  if (!descriptor || descriptor.kind !== "line") return;
  spawnSpriteLine(context, descriptor.origin, descriptor.direction, descriptor.length, {
    effectId: ONI_FX.chain,
    width: 0.75,
    height: 0.75,
    lifetimeSeconds: 0.72,
    spacing: 0.9,
    maxSamples: 24,
    styleRole: role,
    priority,
  });
}

function presentBloodCleaver(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "cone") return;
  const pose = plan.pose;
  spawnFlipbook(context, { ...pose.origin, y: pose.origin.y + 1.1 }, {
    width: 1.5, height: 1.5, lifetimeSeconds: 0.48, styleRole: "primary", priority: FX2D_PRIORITY.presentation,
  });
  [4, 8, 12].forEach((delay, index) => scheduleBossFx2D(context, delay, () => {
    const distance = 1.25 + index * 1.25;
    spawnFx(context, ONI_FX.cleaver, point(pose.origin, pose.view, distance, 1.05), {
      width: 2.7 + index * 0.45,
      height: 1.25 + index * 0.18,
      lifetimeSeconds: 0.48,
      styleRole: index === 2 ? "secondary" : "primary",
    });
  }));
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 2), () => {
    spawnSpriteArc(context, pose.origin, descriptor.range, -descriptor.angle / 2, descriptor.angle / 2, {
      effectId: ONI_FX.orb,
      width: 0.6, height: 0.6, lifetimeSeconds: 0.35, spacing: 0.85, maxSamples: 22,
      styleRole: "secondary", priority: FX2D_PRIORITY.critical,
    });
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, point(pose.origin, pose.view, 2.8, 0.85), 2.8));
}

function presentEarthbreaker(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "circle") return;
  const center = descriptor.center;
  scheduleBossFx2D(context, ability.telegraphStartTick ?? 7, () => {
    spawnFracture(context, center, descriptor.radius * 1.4, "primary");
    spawnPool(context, center, descriptor.radius * 0.7, 1.0, FX2D_PRIORITY.presentation);
  });
  [12, 18, 24].forEach((delay, index) => scheduleBossFx2D(context, delay, () => {
    ringPulse(context, center, descriptor.radius * (0.45 + index * 0.27), index === 2 ? "secondary" : "primary");
  }));
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 2), () => {
    spawnFracture(context, center, descriptor.radius * 2.0, "secondary");
    for (let index = 0; index < 8; index += 1) {
      const direction = rotateXZ({ x: 0, z: -1 }, index * 45);
      spawnFx(context, ONI_FX.cleaver, point(center, direction, descriptor.radius * 0.72, 0.85), {
        width: 1.45, height: 1.85, lifetimeSeconds: 0.46, styleRole: index % 2 ? "secondary" : "primary",
      });
    }
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, { ...center, y: center.y + 0.8 }, 3.6, "secondary"));
}

function presentCrimsonTether(context, ability, plan) {
  const first = descriptorFor(context, ability, plan, 0);
  const second = descriptorFor(context, ability, plan, 1);
  if (first?.kind === "line") {
    scheduleBossFx2D(context, ability.telegraphStartTick ?? 8, () => chainLine(context, first, "primary", FX2D_PRIORITY.critical));
    [12, 17, 22].forEach((delay, index) => scheduleBossFx2D(context, delay, () => {
      chainLine(context, first, index === 2 ? "secondary" : "primary", FX2D_PRIORITY.critical);
      const at = point(first.origin, first.direction, first.length * (0.35 + index * 0.25), 0.75);
      spawnFx(context, ONI_FX.orb, at, { width: 0.9, height: 0.9, lifetimeSeconds: 0.4, styleRole: "secondary" });
    }));
    scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, point(first.origin, first.direction, first.length, 0.65), 1.8));
  }
  if (second?.kind === "cone") {
    scheduleBossFx2D(context, Math.max(1, ability.impactTicks[1] - 6), () => {
      spawnSpriteArc(context, second.origin, second.range, -second.angle / 2, second.angle / 2, {
        effectId: ONI_FX.chain, width: 0.72, height: 0.72, lifetimeSeconds: 0.55,
        spacing: 0.9, maxSamples: 22, styleRole: "secondary", priority: FX2D_PRIORITY.critical,
      });
    });
    scheduleBossFx2D(context, ability.impactTicks[1], () => spawnImpact(context, point(second.origin, second.direction, 2.2, 0.85), 2.7));
  }
}

function presentBloodPool(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "circle") return;
  const center = descriptor.center;
  const size = Math.max(3.2, descriptor.radius * 2.0);
  scheduleBossFx2D(context, ability.telegraphStartTick ?? 12, () => spawnPool(context, center, size, 2.5));
  [18, 25, 31].forEach((delay, index) => scheduleBossFx2D(context, delay, () => {
    ringPulse(context, center, descriptor.radius * (0.55 + index * 0.2), index === 2 ? "secondary" : "primary");
    for (let drop = 0; drop < 4; drop += 1) {
      const direction = rotateXZ({ x: 0, z: -1 }, drop * 90 + index * 17);
      spawnFx(context, ONI_FX.orb, point(center, direction, 0.8 + index * 0.45, 0.45 + drop * 0.08), {
        width: 0.55, height: 0.55, lifetimeSeconds: 0.45, priority: FX2D_PRIORITY.ambient,
      });
    }
  }));
  scheduleBossFx2D(context, ability.impactTicks[0], () => {
    spawnPool(context, center, size * 1.12, 2.7);
    spawnImpact(context, { ...center, y: center.y + 0.6 }, 2.1);
  });
}

function presentDevourWound(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "cone") return;
  const pose = plan.pose;
  const source = plan.primaryTarget?.location ?? point(pose.origin, pose.view, Math.min(3.3, descriptor.range), 0);
  [5, 9, 13, 17].forEach((delay, index) => scheduleBossFx2D(context, delay, () => {
    const t = (index + 1) / 5;
    const at = {
      x: source.x + (pose.origin.x - source.x) * t,
      y: source.y + 1.0 + (pose.origin.y - source.y) * t + Math.sin(t * Math.PI) * 0.6,
      z: source.z + (pose.origin.z - source.z) * t,
    };
    spawnFx(context, ONI_FX.orb, at, {
      width: 0.75 + index * 0.1, height: 0.75 + index * 0.1, lifetimeSeconds: 0.5,
      styleRole: index === 3 ? "secondary" : "primary", priority: FX2D_PRIORITY.presentation,
    });
  }));
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 2), () => {
    spawnSpriteArc(context, pose.origin, descriptor.range, -descriptor.angle / 2, descriptor.angle / 2, {
      effectId: ONI_FX.orb, width: 0.55, height: 0.55, lifetimeSeconds: 0.35,
      spacing: 0.85, maxSamples: 18, styleRole: "primary", priority: FX2D_PRIORITY.critical,
    });
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => {
    spawnImpact(context, { ...pose.origin, y: pose.origin.y + 1.2 }, 2.3, "secondary");
    spawnFx(context, ONI_FX.roar, { ...pose.origin, y: pose.origin.y + 1.3 }, { width: 2.0, height: 2.5, lifetimeSeconds: 0.55, styleRole: "secondary" });
  });
}

function presentBerserkerRoar(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "circle") return;
  const center = descriptor.center;
  spawnFx(context, ONI_FX.roar, { ...center, y: center.y + 1.35 }, {
    width: 3.0, height: 3.6, lifetimeSeconds: 1.4, styleRole: "primary", priority: FX2D_PRIORITY.presentation,
  });
  [8, 14, 20, 26].forEach((delay, index) => scheduleBossFx2D(context, delay, () => {
    const radius = descriptor.radius * (0.28 + index * 0.22);
    ringPulse(context, center, radius, index >= 2 ? "secondary" : "primary", FX2D_PRIORITY.critical);
    spawnFx(context, ONI_FX.roar, { ...center, y: center.y + 1.15 }, {
      width: 2.4 + index * 0.55, height: 2.8 + index * 0.35, lifetimeSeconds: 0.48,
      styleRole: index === 3 ? "secondary" : "primary", priority: FX2D_PRIORITY.presentation,
    });
  }));
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, { ...center, y: center.y + 1.0 }, 4.0, "secondary"));
}

function presentCrimsonCataclysm(context, ability, plan) {
  const center = context.worldZone.center;
  spawnFx(context, ONI_FX.demon, { ...center, y: center.y + 7.8 }, {
    width: 8.0, height: 10.0, lifetimeSeconds: 5.2, styleRole: "primary", priority: FX2D_PRIORITY.presentation,
  });
  scheduleBossFx2D(context, 10, () => {
    spawnPool(context, center, 10.0, 4.5, FX2D_PRIORITY.presentation);
    spawnFx(context, ONI_FX.roar, { ...center, y: center.y + 2.1 }, { width: 5.8, height: 6.8, lifetimeSeconds: 1.4, styleRole: "secondary" });
  });
  scheduleBossFx2D(context, 20, () => {
    for (let index = 0; index < 12; index += 1) {
      const direction = rotateXZ({ x: 0, z: -1 }, index * 30);
      spawnFx(context, ONI_FX.chain, point(center, direction, 6.5, 1.0 + (index % 3) * 0.55), {
        width: 1.0, height: 3.0, lifetimeSeconds: 2.1, styleRole: index % 2 ? "secondary" : "primary",
      });
    }
  });
  ability.impactTicks.forEach((impactTick, index) => {
    const descriptor = descriptorFor(context, ability, plan, index);
    if (!descriptor) return;
    scheduleBossFx2D(context, Math.max(1, impactTick - 7), () => {
      if (descriptor.kind === "ring") {
        ringPulse(context, descriptor.center, descriptor.outerRadius, index === 2 ? "secondary" : "primary", FX2D_PRIORITY.critical);
        spawnFracture(context, descriptor.center, descriptor.outerRadius * 1.7, index === 2 ? "secondary" : "primary");
      } else if (descriptor.kind === "circle") {
        spawnPool(context, descriptor.center, descriptor.radius * 2.0, 1.4);
        spawnFracture(context, descriptor.center, descriptor.radius * 2.2, "secondary");
      }
    });
    scheduleBossFx2D(context, impactTick, () => {
      const at = descriptor.center ?? center;
      spawnImpact(context, { ...at, y: at.y + 1.0 }, index === ability.impactTicks.length - 1 ? 5.0 : 3.0 + index * 0.45, "secondary");
      spawnFx(context, ONI_FX.demon, { ...center, y: center.y + 6.8 }, {
        width: 6.8, height: 8.6, lifetimeSeconds: 0.65, styleRole: index % 2 ? "secondary" : "primary", priority: FX2D_PRIORITY.presentation,
      });
    });
  });
}

export function presentOniAbility2D(context, ability, plan) {
  if (context?.def?.key !== ONI_BOSS_KEY || !ability || !plan) return false;
  switch (ability.id) {
    case "blood_cleaver": presentBloodCleaver(context, ability, plan); break;
    case "earthbreaker": presentEarthbreaker(context, ability, plan); break;
    case "crimson_tether": presentCrimsonTether(context, ability, plan); break;
    case "blood_pool": presentBloodPool(context, ability, plan); break;
    case "devour_wound": presentDevourWound(context, ability, plan); break;
    case "berserker_roar": presentBerserkerRoar(context, ability, plan); break;
    case "crimson_cataclysm": presentCrimsonCataclysm(context, ability, plan); break;
    default: return false;
  }
  return true;
}
