import { normalizeXZ, rotateXZ } from "./geometry.js";
import { impactTelegraphDescriptors } from "./impact_telegraph.js";
import {
  FX2D_PRIORITY,
  scheduleBossFx2D,
  spawnBossFx2D,
  spawnSpriteArc,
  spawnSpriteLine,
  spawnSpriteRing,
} from "./fx2d.js";

const KUROGANE_BOSS_KEY = "kurogane_shogun";

const KUROGANE_FX = Object.freeze({
  slash: "historyjam:kurogane_slash_2d",
  judgment: "historyjam:kurogane_judgment_2d",
  sword: "historyjam:kurogane_sword_2d",
  counter: "historyjam:kurogane_counter_2d",
  execution: "historyjam:kurogane_execution_mark_2d",
  banner: "historyjam:kurogane_banner_2d",
  seal: "historyjam:kurogane_seal_2d",
  impact: "historyjam:kurogane_impact_2d",
});

const CALLBACK_FX = Object.freeze({
  jade: "historyjam:jade_lightning_2d",
  ghostReal: "historyjam:tsukikage_shadow_real_2d",
  ghostFake: "historyjam:tsukikage_shadow_fake_2d",
  oni: "historyjam:oni_fracture_2d",
  seiryu: "historyjam:seiryu_dragon_head_2d",
});

const CALLBACK_COLORS = Object.freeze({
  jade: Object.freeze({ red: 0.35, green: 0.95, blue: 0.72, alpha: 0.96 }),
  ghostReal: Object.freeze({ red: 0.86, green: 0.91, blue: 1.0, alpha: 0.98 }),
  ghostFake: Object.freeze({ red: 0.32, green: 0.28, blue: 0.50, alpha: 0.50 }),
  oni: Object.freeze({ red: 0.86, green: 0.10, blue: 0.14, alpha: 0.94 }),
  seiryu: Object.freeze({ red: 0.24, green: 0.70, blue: 1.0, alpha: 0.94 }),
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

function seal(context, at, size, lifetimeSeconds = 1.0, role = "primary", priority = FX2D_PRIORITY.critical) {
  return fx(context, KUROGANE_FX.seal, { ...at, y: at.y + 0.06 }, {
    width: size,
    height: size,
    lifetimeSeconds,
    styleRole: role,
    priority,
  });
}

function judgment(context, at, size = 2.1, role = "secondary", priority = FX2D_PRIORITY.presentation) {
  return fx(context, KUROGANE_FX.judgment, at, {
    width: size,
    height: size,
    lifetimeSeconds: 0.7,
    styleRole: role,
    priority,
  });
}

function impact(context, at, size = 2.6, role = "secondary") {
  if (!at) return false;
  return fx(context, KUROGANE_FX.impact, { ...at, y: at.y + 0.8 }, {
    width: size,
    height: size,
    lifetimeSeconds: 0.48,
    styleRole: role,
    priority: FX2D_PRIORITY.critical,
  });
}

function slashConeEdges(context, descriptor, effectId = KUROGANE_FX.slash, role = "primary") {
  if (!descriptor || descriptor.kind !== "cone") return;
  for (const offset of [-descriptor.angle / 2, descriptor.angle / 2]) {
    spawnSpriteLine(context, descriptor.origin, rotateXZ(descriptor.direction, offset), descriptor.range, {
      effectId,
      width: 0.9,
      height: 1.8,
      lifetimeSeconds: 0.42,
      spacing: 1.1,
      maxSamples: 14,
      yOffset: 0.85,
      styleRole: role,
      priority: FX2D_PRIORITY.critical,
    });
  }
}

function judgmentLine(context, descriptor, options = {}) {
  if (!descriptor || descriptor.kind !== "line") return;
  spawnSpriteLine(context, descriptor.origin, descriptor.direction, descriptor.length, {
    effectId: options.effectId ?? KUROGANE_FX.slash,
    width: options.width ?? 0.9,
    height: options.height ?? 2.2,
    lifetimeSeconds: options.lifetimeSeconds ?? 0.5,
    spacing: options.spacing ?? 1.7,
    maxSamples: options.maxSamples ?? 26,
    yOffset: options.yOffset ?? 0.85,
    styleRole: options.styleRole ?? "primary",
    priority: options.priority ?? FX2D_PRIORITY.critical,
    ...(options.color ? { color: options.color } : {}),
  });
}

function presentIronDraw(context, ability, plan) {
  const descriptor = descriptorFor(context, ability, plan, 0);
  if (!descriptor || descriptor.kind !== "cone") return;
  seal(context, plan.pose.origin, 2.2, 0.55, "primary", FX2D_PRIORITY.presentation);
  [3, 6, 9].forEach((delay, index) => scheduleBossFx2D(context, delay, () => {
    const at = point(plan.pose.origin, plan.pose.view, 1.2 + index * 0.9, 1.05);
    fx(context, KUROGANE_FX.slash, at, { width: 1.8 + index * 0.55, height: 0.9 + index * 0.25, styleRole: index === 2 ? "secondary" : "primary" });
  }));
  scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 2), () => {
    slashConeEdges(context, descriptor, KUROGANE_FX.slash, "secondary");
    spawnSpriteArc(context, descriptor.origin, descriptor.range, -descriptor.angle / 2, descriptor.angle / 2, {
      effectId: KUROGANE_FX.judgment,
      width: 0.6,
      height: 0.6,
      lifetimeSeconds: 0.4,
      spacing: 1.2,
      maxSamples: 18,
      yOffset: 0.25,
      styleRole: "secondary",
      priority: FX2D_PRIORITY.critical,
    });
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => impact(context, point(descriptor.origin, descriptor.direction, descriptor.range * 0.7, 0.1), 2.7));
}

function presentTripleJudgment(context, ability, plan) {
  ability.impactTicks.forEach((impactTick, index) => {
    const descriptor = descriptorFor(context, ability, plan, index);
    if (!descriptor) return;
    scheduleBossFx2D(context, Math.max(1, impactTick - 9), () => judgment(context, { ...plan.pose.origin, y: plan.pose.origin.y + 2.1 }, 1.6 + index * 0.25, index === 1 ? "primary" : "secondary"));
    scheduleBossFx2D(context, Math.max(1, impactTick - 4), () => {
      if (descriptor.kind === "line") judgmentLine(context, descriptor, { width: 1.05, height: 2.5, styleRole: "secondary" });
      else if (descriptor.kind === "cone") slashConeEdges(context, descriptor, KUROGANE_FX.slash, index === 2 ? "secondary" : "primary");
    });
    scheduleBossFx2D(context, impactTick, () => {
      const at = descriptor.kind === "line"
        ? point(descriptor.origin, descriptor.direction, descriptor.length * 0.55, 0.1)
        : point(descriptor.origin, descriptor.direction, descriptor.range * 0.62, 0.1);
      impact(context, at, 2.2 + index * 0.3, index === 2 ? "secondary" : "primary");
    });
  });
}

function presentSteelRain(context, ability, plan) {
  const descriptors = descriptorsFor(context, ability, plan, 0).filter((entry) => entry.kind === "circle");
  descriptors.forEach((descriptor, index) => {
    scheduleBossFx2D(context, ability.telegraphStartTick ?? 12, () => seal(context, descriptor.center, descriptor.radius * 1.65, 1.8, index % 2 ? "secondary" : "primary"));
    [22, 31, 38].forEach((delay, stage) => scheduleBossFx2D(context, delay + index % 2, () => {
      fx(context, KUROGANE_FX.sword, { ...descriptor.center, y: descriptor.center.y + 6.8 - stage * 1.6 }, {
        width: 0.7 + stage * 0.12,
        height: 3.4 + stage * 0.35,
        lifetimeSeconds: 0.58,
        styleRole: stage === 2 ? "secondary" : "primary",
        priority: FX2D_PRIORITY.critical,
      });
    }));
    ability.impactTicks.forEach((impactTick, impactIndex) => scheduleBossFx2D(context, impactTick, () => {
      if ((index + impactIndex) % 2 === 0) impact(context, descriptor.center, 2.0 + impactIndex * 0.15);
    }));
  });
}

function presentIronCounter(context, ability, plan) {
  const [guardStart, guardEnd] = ability.shape.counterWindow ?? [8, 20];
  scheduleBossFx2D(context, guardStart, () => {
    seal(context, plan.pose.origin, 3.0, Math.max(0.4, (guardEnd - guardStart) / 20), "primary", FX2D_PRIORITY.critical);
    fx(context, KUROGANE_FX.counter, { ...plan.pose.origin, y: plan.pose.origin.y + 1.45 }, { width: 2.5, height: 2.5, lifetimeSeconds: Math.max(0.4, (guardEnd - guardStart) / 20), styleRole: "secondary", priority: FX2D_PRIORITY.critical });
  });
  [guardStart + 3, guardStart + 7].forEach((delay) => scheduleBossFx2D(context, delay, () => spawnSpriteRing(context, plan.pose.origin, 1.8, {
    effectId: KUROGANE_FX.judgment,
    width: 0.45,
    height: 0.45,
    lifetimeSeconds: 0.35,
    spacing: 0.9,
    maxSamples: 16,
    yOffset: 0.65,
    styleRole: "secondary",
    priority: FX2D_PRIORITY.critical,
  })));
  scheduleBossFx2D(context, Math.max(guardEnd + 1, ability.impactTicks[0] - 4), () => {
    const counter = context.counterWindow;
    if (!counter?.consumed || !counter.punishDirection) return;
    const descriptor = { kind: "cone", origin: { ...context.boss.location }, direction: counter.punishDirection, range: ability.shape.range ?? 4, angle: ability.shape.angle ?? 110 };
    slashConeEdges(context, descriptor, KUROGANE_FX.slash, "secondary");
    judgment(context, point(descriptor.origin, descriptor.direction, 1.7, 1.2), 2.3, "secondary", FX2D_PRIORITY.critical);
  });
  scheduleBossFx2D(context, ability.impactTicks[0], () => {
    const counter = context.counterWindow;
    if (!counter?.consumed || !counter.punishDirection) return;
    impact(context, point(context.boss.location, counter.punishDirection, 2.2, 0.1), 2.9, "secondary");
  });
}

function presentExecutionMark(context, ability, plan) {
  const descriptors = descriptorsFor(context, ability, plan, 0).filter((entry) => entry.kind === "circle");
  descriptors.forEach((descriptor, index) => {
    scheduleBossFx2D(context, ability.telegraphStartTick ?? 14, () => seal(context, descriptor.center, descriptor.radius * 1.8, 2.0, "primary"));
    [22, 32, 41].forEach((delay, stage) => scheduleBossFx2D(context, delay + index, () => fx(context, KUROGANE_FX.execution, { ...descriptor.center, y: descriptor.center.y + 2.4 }, {
      width: 2.2 + stage * 0.45,
      height: 2.2 + stage * 0.45,
      lifetimeSeconds: 0.55,
      styleRole: stage === 2 ? "secondary" : "primary",
      priority: FX2D_PRIORITY.critical,
    })));
    scheduleBossFx2D(context, Math.max(1, ability.impactTicks[0] - 3), () => spawnSpriteRing(context, descriptor.center, descriptor.radius, {
      effectId: KUROGANE_FX.sword,
      width: 0.55,
      height: 1.7,
      lifetimeSeconds: 0.48,
      spacing: 1.1,
      maxSamples: 22,
      yOffset: 1.1,
      styleRole: "secondary",
      priority: FX2D_PRIORITY.critical,
    }));
    scheduleBossFx2D(context, ability.impactTicks[0], () => impact(context, descriptor.center, 3.0, "secondary"));
  });
}

function presentBlackBannerDomain(context, ability, plan) {
  const center = context.worldZone.center;
  scheduleBossFx2D(context, 4, () => {
    seal(context, center, 10.5, 4.2, "primary", FX2D_PRIORITY.critical);
    for (let index = 0; index < 4; index += 1) {
      const direction = rotateXZ({ x: 0, z: -1 }, 45 + index * 90);
      fx(context, KUROGANE_FX.banner, point(center, direction, 7.0, 2.4), { width: 2.4, height: 5.4, lifetimeSeconds: 3.8, styleRole: index % 2 ? "secondary" : "primary", priority: FX2D_PRIORITY.presentation });
    }
  });
  ability.impactTicks.forEach((impactTick, index) => {
    const descriptor = descriptorFor(context, ability, plan, index);
    if (!descriptor || descriptor.kind !== "line") return;
    scheduleBossFx2D(context, Math.max(1, impactTick - 9), () => judgmentLine(context, descriptor, { width: 0.7, height: 1.8, styleRole: "primary", spacing: 2.3 }));
    scheduleBossFx2D(context, Math.max(1, impactTick - 3), () => judgmentLine(context, descriptor, { width: 1.05, height: 3.0, styleRole: "secondary", spacing: 1.6 }));
    scheduleBossFx2D(context, impactTick, () => impact(context, point(descriptor.origin, descriptor.direction, descriptor.length * 0.54, 0.1), 2.6 + index * 0.25));
  });
}

function callbackLine(context, descriptor, effectId, color, fake = false) {
  if (!descriptor || descriptor.kind !== "line") return;
  spawnSpriteLine(context, descriptor.origin, descriptor.direction, descriptor.length, {
    effectId,
    width: fake ? 0.75 : 1.0,
    height: fake ? 1.6 : 2.4,
    lifetimeSeconds: fake ? 0.35 : 0.6,
    spacing: 1.8,
    maxSamples: 24,
    yOffset: 1.0,
    color,
    priority: fake ? FX2D_PRIORITY.presentation : FX2D_PRIORITY.critical,
  });
}

function presentFivefoldJudgment(context, ability, plan) {
  const center = context.worldZone.center;
  scheduleBossFx2D(context, 4, () => {
    seal(context, center, 14.0, 7.0, "primary", FX2D_PRIORITY.critical);
    fx(context, KUROGANE_FX.banner, { ...center, y: center.y + 5.0 }, { width: 5.4, height: 10.0, lifetimeSeconds: 6.2, styleRole: "secondary", priority: FX2D_PRIORITY.presentation });
  });

  ability.impactTicks.forEach((impactTick, index) => {
    const descriptors = descriptorsFor(context, ability, plan, index);
    scheduleBossFx2D(context, Math.max(1, impactTick - 12), () => judgment(context, { ...center, y: center.y + 3.0 + index * 0.35 }, 2.1 + index * 0.28, index === 4 ? "secondary" : "primary", FX2D_PRIORITY.critical));

    if (index === 0) {
      scheduleBossFx2D(context, Math.max(1, impactTick - 5), () => descriptors.forEach((descriptor) => callbackLine(context, descriptor, CALLBACK_FX.jade, CALLBACK_COLORS.jade)));
    } else if (index === 1) {
      scheduleBossFx2D(context, Math.max(1, impactTick - 7), () => {
        const real = descriptors.find((entry) => !entry.feint);
        const fake = descriptors.find((entry) => entry.feint);
        callbackLine(context, real, CALLBACK_FX.ghostReal, CALLBACK_COLORS.ghostReal, false);
        callbackLine(context, fake, CALLBACK_FX.ghostFake, CALLBACK_COLORS.ghostFake, true);
      });
    } else if (index === 2) {
      const descriptor = descriptors[0];
      if (descriptor?.kind === "ring") scheduleBossFx2D(context, Math.max(1, impactTick - 6), () => {
        spawnSpriteRing(context, descriptor.center, descriptor.outerRadius, { effectId: CALLBACK_FX.oni, width: 1.2, height: 1.2, lifetimeSeconds: 0.7, spacing: 1.3, maxSamples: 32, yOffset: 0.15, color: CALLBACK_COLORS.oni, priority: FX2D_PRIORITY.critical });
        spawnSpriteRing(context, descriptor.center, descriptor.innerRadius, { effectId: CALLBACK_FX.oni, width: 0.9, height: 0.9, lifetimeSeconds: 0.6, spacing: 1.2, maxSamples: 24, yOffset: 0.12, color: CALLBACK_COLORS.oni, priority: FX2D_PRIORITY.critical });
      });
    } else if (index === 3) {
      const descriptor = descriptors[0];
      if (descriptor?.kind === "cone") scheduleBossFx2D(context, Math.max(1, impactTick - 8), () => {
        const direction = descriptor.direction;
        for (let part = 0; part < 5; part += 1) {
          fx(context, CALLBACK_FX.seiryu, point(descriptor.origin, direction, descriptor.range * (0.25 + part * 0.12), 2.0 + part * 0.45), {
            width: 2.4 + part * 0.35,
            height: 1.8 + part * 0.25,
            lifetimeSeconds: 0.7,
            color: CALLBACK_COLORS.seiryu,
            priority: FX2D_PRIORITY.critical,
          });
        }
        slashConeEdges(context, descriptor, KUROGANE_FX.slash, "primary");
      });
    } else {
      const descriptor = descriptors[0];
      if (descriptor?.kind === "cone") scheduleBossFx2D(context, Math.max(1, impactTick - 5), () => {
        slashConeEdges(context, descriptor, KUROGANE_FX.slash, "secondary");
        fx(context, KUROGANE_FX.execution, point(descriptor.origin, descriptor.direction, 2.0, 2.0), { width: 4.4, height: 4.4, lifetimeSeconds: 0.7, styleRole: "secondary", priority: FX2D_PRIORITY.critical });
      });
    }

    scheduleBossFx2D(context, impactTick, () => {
      const descriptor = descriptors.find((entry) => !entry.feint) ?? descriptors[0];
      let at = center;
      if (descriptor?.kind === "line") at = point(descriptor.origin, descriptor.direction, descriptor.length * 0.55, 0.1);
      else if (descriptor?.kind === "cone") at = point(descriptor.origin, descriptor.direction, descriptor.range * 0.58, 0.1);
      impact(context, at, 2.8 + index * 0.45, index === 4 ? "secondary" : "primary");
    });
  });

  scheduleBossFx2D(context, ability.impactTicks[ability.impactTicks.length - 1], () => spawnSpriteRing(context, center, 11.0, {
    effectId: KUROGANE_FX.judgment,
    width: 0.85,
    height: 0.85,
    lifetimeSeconds: 0.8,
    spacing: 1.4,
    maxSamples: 40,
    yOffset: 1.1,
    styleRole: "secondary",
    priority: FX2D_PRIORITY.critical,
  }));
}

export function presentKuroganeAbility2D(context, ability, plan) {
  if (context?.def?.key !== KUROGANE_BOSS_KEY || !ability || !plan) return false;
  switch (ability.id) {
    case "iron_draw": presentIronDraw(context, ability, plan); break;
    case "triple_judgment": presentTripleJudgment(context, ability, plan); break;
    case "steel_rain": presentSteelRain(context, ability, plan); break;
    case "iron_counter": presentIronCounter(context, ability, plan); break;
    case "execution_mark": presentExecutionMark(context, ability, plan); break;
    case "black_banner_domain": presentBlackBannerDomain(context, ability, plan); break;
    case "fivefold_judgment": presentFivefoldJudgment(context, ability, plan); break;
    default: return false;
  }
  return true;
}
