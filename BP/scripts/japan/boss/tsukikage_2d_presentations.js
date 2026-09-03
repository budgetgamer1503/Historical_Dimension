import { normalizeXZ } from "./geometry.js";
import { impactTelegraphDescriptors } from "./impact_telegraph.js";
import {
  FX2D_PRIORITY,
  scheduleBossFx2D,
  spawnBillboard,
  spawnBossFx2D,
  spawnFloorDisc,
  spawnSpriteArc,
  spawnSpriteLine,
  spawnSpriteRing,
  tsukikageTellOptions,
} from "./fx2d.js";

const TSUKIKAGE_BOSS_KEY = "tsukikage_ghost_samurai";

const TSUKIKAGE_FX = Object.freeze({
  crescent: "historyjam:tsukikage_crescent_2d",
  shadowReal: "historyjam:tsukikage_shadow_real_2d",
  shadowFake: "historyjam:tsukikage_shadow_fake_2d",
  chain: "historyjam:tsukikage_chain_2d",
  prisonGate: "historyjam:tsukikage_prison_gate_2d",
  eclipse: "historyjam:tsukikage_eclipse_2d",
  mist: "historyjam:tsukikage_mist_2d",
  impact: "historyjam:tsukikage_impact_2d",
});

function point(origin, direction, distance, yOffset = 0) {
  const forward = normalizeXZ(direction);
  return {
    x: origin.x + forward.x * distance,
    y: origin.y + yOffset,
    z: origin.z + forward.z * distance,
  };
}

function radialPoint(center, radius, degrees, yOffset = 0) {
  const angle = Number(degrees) * Math.PI / 180;
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + yOffset,
    z: center.z + Math.sin(angle) * radius,
  };
}

function descriptorList(context, ability, plan, index = 0) {
  return impactTelegraphDescriptors(ability, plan, context.worldZone.center, index);
}

function descriptorFor(context, ability, plan, index = 0) {
  return descriptorList(context, ability, plan, index)[0];
}

function spawnMist(context, at, width = 2.0, height = 1.4, lifetimeSeconds = 0.75, priority = FX2D_PRIORITY.presentation) {
  if (!at) return;
  spawnBossFx2D(context, TSUKIKAGE_FX.mist, at, {
    width,
    height,
    lifetimeSeconds,
    styleRole: "primary",
    priority,
  });
}

function spawnCrescent(context, at, width = 2.5, height = 1.15, lifetimeSeconds = 0.55, priority = FX2D_PRIORITY.presentation) {
  if (!at) return;
  spawnBossFx2D(context, TSUKIKAGE_FX.crescent, at, {
    width,
    height,
    lifetimeSeconds,
    styleRole: "real",
    priority,
  });
}

function spawnShadow(context, at, real, options = {}) {
  if (!at) return;
  const base = tsukikageTellOptions(real, {
    width: options.width ?? 1.0,
    height: options.height ?? 2.1,
    lifetimeSeconds: options.lifetimeSeconds ?? (real ? 0.95 : 0.52),
    priority: options.priority,
  });
  spawnBossFx2D(context, real ? TSUKIKAGE_FX.shadowReal : TSUKIKAGE_FX.shadowFake, at, base);
}

function spawnChain(context, at, width = 2.15, height = 0.7, lifetimeSeconds = 0.7, priority = FX2D_PRIORITY.presentation) {
  if (!at) return;
  spawnBossFx2D(context, TSUKIKAGE_FX.chain, at, {
    width,
    height,
    lifetimeSeconds,
    styleRole: "secondary",
    priority,
  });
}

function spawnGate(context, at, lifetimeSeconds = 0.9) {
  if (!at) return;
  spawnBossFx2D(context, TSUKIKAGE_FX.prisonGate, at, {
    width: 1.55,
    height: 3.1,
    lifetimeSeconds,
    styleRole: "primary",
    priority: FX2D_PRIORITY.presentation,
  });
}

function spawnImpact(context, at, size = 2.3) {
  if (!at) return;
  spawnBossFx2D(context, TSUKIKAGE_FX.impact, at, {
    width: size,
    height: size,
    lifetimeSeconds: 0.42,
    styleRole: "real",
    priority: FX2D_PRIORITY.critical,
  });
}

function lineMidpoint(descriptor, fraction = 0.5, yOffset = 0) {
  if (!descriptor || descriptor.kind !== "line") return undefined;
  return point(descriptor.origin, descriptor.direction, descriptor.length * fraction, yOffset);
}

function shadowSlashLine(context, descriptor, options = {}) {
  if (!descriptor || descriptor.kind !== "line") return;
  spawnSpriteLine(context, descriptor.origin, descriptor.direction, descriptor.length, {
    effectId: TSUKIKAGE_FX.crescent,
    width: options.width ?? 1.3,
    height: options.height ?? 0.58,
    lifetimeSeconds: options.lifetimeSeconds ?? 0.38,
    spacing: options.spacing ?? 2.1,
    maxSamples: options.maxSamples ?? 18,
    styleRole: options.styleRole ?? "real",
    priority: options.priority ?? FX2D_PRIORITY.critical,
  });
}

function presentMoonCrescent(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  const pose = plan.pose;
  spawnMist(context, { ...pose.origin, y: pose.origin.y + 0.8 }, 2.3, 1.5, 0.8);
  spawnSpriteRing(context, pose.origin, 1.25, {
    width: 0.45, height: 0.45, lifetimeSeconds: 0.45, spacing: 1.0, maxSamples: 14,
    styleRole: "secondary", priority: FX2D_PRIORITY.presentation,
  });
  [[3, 1.1, 1.8], [6, 2.0, 2.15], [9, 3.0, 2.5]].forEach(([delay, distance, width]) => {
    scheduleBossFx2D(context, delay, () => spawnCrescent(context, point(pose.origin, pose.view, distance, 1.0), width, width * 0.46));
  });
  if (descriptor?.kind === "cone") {
    scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 3), () => {
      spawnSpriteArc(context, pose.origin, descriptor.range, -descriptor.angle / 2, descriptor.angle / 2, {
        effectId: TSUKIKAGE_FX.crescent,
        width: 0.95, height: 0.45, lifetimeSeconds: 0.34, spacing: 0.9, maxSamples: 18,
        styleRole: "real", priority: FX2D_PRIORITY.critical,
      });
    });
  }
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, point(pose.origin, pose.view, 2.1, 0.9), 2.2));
}

function presentShadowstep(context, ability, plan) {
  const origin = plan.pose.origin;
  const destination = plan.repositionDestination ?? plan.impactPose?.origin ?? origin;
  spawnMist(context, { ...origin, y: origin.y + 0.8 }, 2.8, 1.8, 0.9, FX2D_PRIORITY.critical);
  spawnShadow(context, { ...origin, y: origin.y + 1.0 }, false, { width: 1.15, height: 2.25, lifetimeSeconds: 0.7 });

  [0, 120, 240].forEach((degrees, index) => {
    scheduleBossFx2D(context, 7 + index, () => {
      const decoy = radialPoint(destination, 2.5, degrees, 1.0);
      spawnShadow(context, decoy, false, { width: 0.95, height: 2.0, lifetimeSeconds: 0.62 });
      spawnMist(context, { ...decoy, y: decoy.y - 0.45 }, 1.4, 0.9, 0.55, FX2D_PRIORITY.ambient);
    });
  });

  const revealTick = Math.max(2, (ability.shape.repositionTick ?? ability.impactTicks[0] - 8) + 1);
  scheduleBossFx2D(context, revealTick, () => {
    const realAt = { ...(plan.impactPose?.origin ?? destination), y: (plan.impactPose?.origin ?? destination).y + 1.0 };
    spawnShadow(context, realAt, true, { width: 1.08, height: 2.2, lifetimeSeconds: 0.9, priority: FX2D_PRIORITY.critical });
    spawnMist(context, { ...realAt, y: realAt.y - 0.55 }, 2.0, 1.1, 0.62);
  });

  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 2), () => {
    const descriptor = descriptorFor(context, ability, plan, 0);
    if (descriptor?.kind === "cone") {
      spawnSpriteArc(context, descriptor.origin, descriptor.range, -descriptor.angle / 2, descriptor.angle / 2, {
        effectId: TSUKIKAGE_FX.crescent,
        width: 0.9, height: 0.42, lifetimeSeconds: 0.32, spacing: 0.8, maxSamples: 16,
        styleRole: "real", priority: FX2D_PRIORITY.critical,
      });
    }
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, { ...(plan.impactPose?.origin ?? destination), y: (plan.impactPose?.origin ?? destination).y + 0.9 }, 2.0));
}

function presentPhantomFan(context, ability, plan) {
  spawnMist(context, { ...plan.pose.origin, y: plan.pose.origin.y + 0.75 }, 2.4, 1.45, 0.8);
  ability.impactTicks.forEach((impactTick, index) => {
    const descriptor = descriptorFor(context, ability, plan, index);
    if (!descriptor || descriptor.kind !== "line") return;
    scheduleBossFx2D(context, Math.max(1, impactTick - 8), () => {
      spawnShadow(context, lineMidpoint(descriptor, 0.28, 1.0), true, { lifetimeSeconds: 0.82 });
      spawnShadow(context, lineMidpoint(descriptor, 0.72, 1.0), true, { width: 0.88, height: 1.9, lifetimeSeconds: 0.75 });
    });
    scheduleBossFx2D(context, Math.max(1, impactTick - 3), () => shadowSlashLine(context, descriptor, { spacing: 2.5, width: 1.15 }));
    scheduleBossFx2D(context, impactTick, () => spawnImpact(context, lineMidpoint(descriptor, 0.58, 0.8), 1.8));
  });
}

function presentVanishingMist(context, ability, plan) {
  const destination = plan.repositionDestination ?? plan.impactPose?.origin ?? plan.pose.origin;
  spawnMist(context, { ...plan.pose.origin, y: plan.pose.origin.y + 0.7 }, 4.0, 2.0, 1.25, FX2D_PRIORITY.critical);
  [4, 9, 14].forEach((delay, index) => {
    scheduleBossFx2D(context, delay, () => {
      spawnSpriteRing(context, destination, 1.8 + index * 0.7, {
        effectId: TSUKIKAGE_FX.mist,
        width: 0.9, height: 0.65, lifetimeSeconds: 0.55, spacing: 1.4, maxSamples: 16,
        styleRole: "primary", priority: index === 2 ? FX2D_PRIORITY.critical : FX2D_PRIORITY.presentation,
      });
      for (let fake = 0; fake < 2; fake += 1) {
        const at = radialPoint(destination, 2.5 + index * 0.25, index * 55 + fake * 180, 1.0);
        spawnShadow(context, at, false, { lifetimeSeconds: 0.55 });
      }
    });
  });
  const revealTick = Math.max(2, ability.impactTicks[0] - 7);
  scheduleBossFx2D(context, revealTick, () => {
    const realOrigin = plan.impactPose?.origin ?? destination;
    spawnShadow(context, { ...realOrigin, y: realOrigin.y + 1.0 }, true, { lifetimeSeconds: 1.0, priority: FX2D_PRIORITY.critical });
    spawnMist(context, { ...realOrigin, y: realOrigin.y + 0.4 }, 2.6, 1.4, 0.75);
  });
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 2), () => {
    const descriptor = descriptorFor(context, ability, plan, 0);
    if (descriptor?.kind === "circle") {
      spawnSpriteRing(context, descriptor.center, descriptor.radius, {
        effectId: TSUKIKAGE_FX.crescent,
        width: 0.8, height: 0.42, lifetimeSeconds: 0.34, spacing: 1.0, maxSamples: 22,
        styleRole: "real", priority: FX2D_PRIORITY.critical,
      });
    }
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, { ...(plan.impactPose?.origin ?? destination), y: (plan.impactPose?.origin ?? destination).y + 0.8 }, 2.5));
}

function presentShadowPrison(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "ring") return;
  const center = descriptor.center;
  spawnFloorDisc(context, { ...center, y: center.y + 0.04 }, {
    width: descriptor.outerRadius * 2.0,
    height: descriptor.outerRadius * 2.0,
    lifetimeSeconds: 1.4,
    styleRole: "primary",
    priority: FX2D_PRIORITY.presentation,
  });

  const prisonPulse = (lifetimeSeconds) => {
    for (let index = 0; index < 8; index += 1) {
      const gateAt = radialPoint(center, descriptor.outerRadius, index * 45, 1.5);
      spawnGate(context, gateAt, lifetimeSeconds);
      const chainAt = radialPoint(center, descriptor.outerRadius * 0.96, index * 45 + 22.5, 1.2);
      spawnChain(context, chainAt, 2.1, 0.68, Math.min(0.85, lifetimeSeconds), FX2D_PRIORITY.critical);
    }
    spawnSpriteRing(context, center, descriptor.outerRadius, {
      effectId: TSUKIKAGE_FX.chain,
      width: 1.1, height: 0.45, lifetimeSeconds: Math.min(0.75, lifetimeSeconds), spacing: 1.55, maxSamples: 24,
      styleRole: "secondary", priority: FX2D_PRIORITY.critical,
    });
    if (descriptor.innerRadius > 0) {
      spawnSpriteRing(context, center, descriptor.innerRadius, {
        width: 0.5, height: 0.5, lifetimeSeconds: Math.min(0.75, lifetimeSeconds), spacing: 0.8, maxSamples: 18,
        styleRole: "real", priority: FX2D_PRIORITY.critical,
      });
    }
  };

  [8, 16, 25, Math.max(1, ability.impactTicks[0] - 5)].forEach((delay, index) => {
    scheduleBossFx2D(context, delay, () => prisonPulse(index === 3 ? 0.95 : 0.72));
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => spawnImpact(context, { ...center, y: center.y + 0.9 }, 3.2));
}

function presentEightfoldSlash(context, ability, plan) {
  let manifestation = 0;
  ability.impactTicks.forEach((impactTick, index) => {
    const descriptor = descriptorFor(context, ability, plan, index);
    if (!descriptor || descriptor.kind !== "line") return;
    scheduleBossFx2D(context, Math.max(1, impactTick - 9), () => {
      [0.32, 0.72].forEach((fraction) => {
        manifestation += 1;
        spawnShadow(context, lineMidpoint(descriptor, fraction, 1.0), true, {
          width: manifestation % 2 ? 0.92 : 1.02,
          height: manifestation % 2 ? 1.95 : 2.15,
          lifetimeSeconds: 0.88,
          priority: FX2D_PRIORITY.critical,
        });
      });
    });
    scheduleBossFx2D(context, Math.max(1, impactTick - 4), () => shadowSlashLine(context, descriptor, { spacing: 2.0, width: 1.25, height: 0.54 }));
    scheduleBossFx2D(context, impactTick, () => spawnImpact(context, lineMidpoint(descriptor, 0.52, 0.85), 2.0));
  });
}

function presentEclipseOfEightShadows(context, ability, plan) {
  const center = context.worldZone.center;
  spawnBossFx2D(context, TSUKIKAGE_FX.eclipse, { ...center, y: center.y + 7.0 }, {
    width: 8.2,
    height: 8.2,
    lifetimeSeconds: 5.6,
    styleRole: "primary",
    priority: FX2D_PRIORITY.critical,
  });
  spawnFloorDisc(context, { ...center, y: center.y + 0.035 }, {
    width: 13.0,
    height: 13.0,
    lifetimeSeconds: 4.8,
    color: { red: 0.20, green: 0.16, blue: 0.34, alpha: 0.68 },
    priority: FX2D_PRIORITY.presentation,
  });
  [8, 18, 30, 42].forEach((delay, index) => {
    scheduleBossFx2D(context, delay, () => {
      spawnSpriteRing(context, center, 4.0 + index * 1.6, {
        effectId: TSUKIKAGE_FX.mist,
        width: 1.0, height: 0.7, lifetimeSeconds: 0.7, spacing: 1.7, maxSamples: 24,
        styleRole: index % 2 ? "secondary" : "primary", priority: FX2D_PRIORITY.presentation,
      });
    });
  });

  ability.impactTicks.forEach((impactTick, index) => {
    const descriptors = descriptorList(context, ability, plan, index);
    const real = descriptors.find((descriptor) => !descriptor.feint);
    const fake = descriptors.find((descriptor) => descriptor.feint);
    scheduleBossFx2D(context, Math.max(1, impactTick - 12), () => {
      if (real?.kind === "line") spawnShadow(context, lineMidpoint(real, 0.62, 1.0), true, { lifetimeSeconds: 1.05, priority: FX2D_PRIORITY.critical });
      if (fake?.kind === "line") spawnShadow(context, lineMidpoint(fake, 0.62, 1.0), false, { lifetimeSeconds: 0.55, priority: FX2D_PRIORITY.presentation });
    });
    scheduleBossFx2D(context, Math.max(1, impactTick - 5), () => {
      if (real?.kind === "line") shadowSlashLine(context, real, { spacing: 2.15, width: 1.25, styleRole: "real", priority: FX2D_PRIORITY.critical });
      if (fake?.kind === "line") {
        spawnSpriteLine(context, fake.origin, fake.direction, fake.length, {
          effectId: TSUKIKAGE_FX.mist,
          width: 0.8, height: 0.55, lifetimeSeconds: 0.32, spacing: 2.8, maxSamples: 14,
          styleRole: "fake", priority: FX2D_PRIORITY.presentation,
        });
      }
    });
    scheduleBossFx2D(context, impactTick, () => {
      if (real?.kind === "line") spawnImpact(context, lineMidpoint(real, 0.55, 0.9), 2.2 + index * 0.15);
    });
  });
}

const PRESENTERS = Object.freeze({
  moon_crescent: presentMoonCrescent,
  shadowstep: presentShadowstep,
  phantom_fan: presentPhantomFan,
  vanishing_mist: presentVanishingMist,
  shadow_prison: presentShadowPrison,
  eightfold_slash: presentEightfoldSlash,
  eclipse_of_eight_shadows: presentEclipseOfEightShadows,
});

export function presentTsukikageAbility2D(context, ability, plan) {
  if (context?.def?.key !== TSUKIKAGE_BOSS_KEY) return false;
  const presenter = PRESENTERS[ability?.id];
  if (!presenter) return false;
  presenter(context, ability, plan);
  return true;
}
