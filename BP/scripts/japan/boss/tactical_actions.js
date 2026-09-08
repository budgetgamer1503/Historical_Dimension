import { system } from "@minecraft/server";
import { healBoss } from "./damage.js";
import { FX2D_PRIORITY, scheduleBossFx2D, spawnBillboard, spawnSpriteRing, spawnVerticalCard } from "./fx2d.js";
import { COMBAT_MODES } from "./combat_modes.js";

const DEFENSE_COOLDOWN_TICKS = 190;
const HEAL_COOLDOWN_TICKS = 420;
const DEFENSE_DURATION_TICKS = 44;
const HEAL_DURATION_TICKS = 50;
const HEAL_IMPACT_TICK = 31;

const DEFENSE_COLOR = Object.freeze({ red: 0.42, green: 0.76, blue: 1.0, alpha: 0.92 });
const DEFENSE_ACCENT = Object.freeze({ red: 0.88, green: 0.95, blue: 1.0, alpha: 0.98 });
const HEAL_COLOR = Object.freeze({ red: 0.34, green: 1.0, blue: 0.52, alpha: 0.94 });
const HEAL_ACCENT = Object.freeze({ red: 0.86, green: 1.0, blue: 0.88, alpha: 0.98 });

function schedule(context, delay, callback) {
  return scheduleBossFx2D(context, delay, callback);
}

function pointAboveBoss(context, y = 0) {
  const location = context.boss.location;
  return { x: location.x, y: location.y + y, z: location.z };
}

function defensePulse(context, pulse) {
  const center = pointAboveBoss(context, 0.10);
  const radius = 1.45 + (pulse % 3) * 0.38;
  spawnSpriteRing(context, center, radius, {
    width: 0.34,
    height: 0.34,
    lifetimeSeconds: 0.42,
    spacing: 0.72,
    color: pulse % 2 === 0 ? DEFENSE_COLOR : DEFENSE_ACCENT,
    priority: FX2D_PRIORITY.presentation,
  });
  for (let side = 0; side < 4; side += 1) {
    const angle = side * Math.PI / 2 + pulse * 0.22;
    spawnVerticalCard(context, {
      x: center.x + Math.cos(angle) * 1.35,
      y: center.y + 1.0,
      z: center.z + Math.sin(angle) * 1.35,
    }, {
      width: 0.26,
      height: 2.2,
      lifetimeSeconds: 0.48,
      color: DEFENSE_COLOR,
      priority: FX2D_PRIORITY.presentation,
    });
  }
}

function healPulse(context, pulse) {
  const center = pointAboveBoss(context, 0.12);
  const radius = 0.95 + (pulse % 4) * 0.34;
  spawnSpriteRing(context, center, radius, {
    width: 0.30,
    height: 0.30,
    lifetimeSeconds: 0.46,
    spacing: 0.68,
    color: pulse % 2 === 0 ? HEAL_COLOR : HEAL_ACCENT,
    priority: FX2D_PRIORITY.presentation,
  });
  const height = 1.15 + (pulse % 3) * 0.48;
  spawnBillboard(context, pointAboveBoss(context, height), {
    width: 0.62,
    height: 0.62,
    lifetimeSeconds: 0.52,
    color: HEAL_ACCENT,
    priority: FX2D_PRIORITY.presentation,
  });
}

function schedulePulses(context, durationTicks, intervalTicks, callback) {
  let pulse = 0;
  for (let tick = 0; tick < durationTicks; tick += intervalTicks) {
    const index = pulse;
    schedule(context, tick, () => callback(context, index));
    pulse += 1;
  }
}

function startCommon(context, mode) {
  context.state = "casting";
  context.activeCombatMode = mode;
  try { context.boss.triggerEvent("historyjam:cast_start"); } catch {}
  try { context.boss.playAnimation("animation.historyjam.samurai.phase_shift", { blendOutTime: 0.12 }); } catch {}
}

function finishCommon(context, onDone) {
  try { context.boss.triggerEvent("historyjam:cast_end"); } catch {}
  context.state = "idle";
  context.activeCombatMode = undefined;
  onDone?.();
}

function runDefense(context, onDone) {
  startCommon(context, COMBAT_MODES.defense);
  context.tacticalCooldowns.set(COMBAT_MODES.defense, system.currentTick + DEFENSE_COOLDOWN_TICKS);
  // Hide vanilla status particles; the guard is communicated entirely through the 2D shield FX.
  try {
    context.boss.addEffect("resistance", DEFENSE_DURATION_TICKS, {
      amplifier: context.phase >= 3 ? 2 : 1,
      showParticles: false,
    });
  } catch {}
  schedulePulses(context, DEFENSE_DURATION_TICKS, 6, defensePulse);
  schedule(context, DEFENSE_DURATION_TICKS, () => {
    try { context.boss.removeEffect("resistance"); } catch {}
    finishCommon(context, onDone);
  });
}

function runHeal(context, onDone) {
  startCommon(context, COMBAT_MODES.heal);
  context.tacticalCooldowns.set(COMBAT_MODES.heal, system.currentTick + HEAL_COOLDOWN_TICKS);
  schedulePulses(context, HEAL_DURATION_TICKS, 6, healPulse);

  schedule(context, HEAL_IMPACT_TICK, () => {
    // Percentage healing keeps the move useful under multiplayer health scaling without allowing
    // the boss to erase an entire phase. The long wind-up leaves a clear punish window.
    const fraction = 0.060 + Math.max(0, context.phase - 1) * 0.006;
    const healed = healBoss(context.boss, context.maxHealth * fraction);
    if (healed <= 0) return;
    const center = pointAboveBoss(context, 1.15);
    spawnSpriteRing(context, center, 2.25, {
      width: 0.48,
      height: 0.48,
      lifetimeSeconds: 0.70,
      spacing: 0.58,
      color: HEAL_ACCENT,
      priority: FX2D_PRIORITY.critical,
    });
    for (let index = 0; index < 5; index += 1) {
      const angle = index * Math.PI * 2 / 5;
      spawnVerticalCard(context, {
        x: center.x + Math.cos(angle) * 1.4,
        y: center.y,
        z: center.z + Math.sin(angle) * 1.4,
      }, {
        width: 0.32,
        height: 2.8,
        lifetimeSeconds: 0.72,
        color: HEAL_COLOR,
        priority: FX2D_PRIORITY.critical,
      });
    }
  });

  schedule(context, HEAL_DURATION_TICKS, () => finishCommon(context, onDone));
}

export function tacticalActionReady(context, mode) {
  const readyTick = context.tacticalCooldowns?.get(mode) ?? 0;
  return readyTick <= system.currentTick;
}

export function runTacticalAction(context, mode, onDone) {
  if (mode === COMBAT_MODES.defense) {
    runDefense(context, onDone);
    return true;
  }
  if (mode === COMBAT_MODES.heal) {
    runHeal(context, onDone);
    return true;
  }
  return false;
}
